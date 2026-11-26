import { and, count, eq, notInArray } from "drizzle-orm";
import type { AppDb } from "@/db";
import { media, userMedia } from "@/db/schema";
import { assertSameIdentity } from "../domain/identity";
import { adoptProviderTotal, defaultProgressTotal } from "../domain/progress";
import {
  isTemporaryProviderFailure,
  ProviderNotConfiguredError,
  ProviderResponseError,
} from "../providers/http";
import { resolveExact } from "../providers";
import type { ExternalSource, MediaCandidate, MediaIdentity } from "../types";
import { findMediaById, refreshMediaMetadata } from "./media";

export type ExactResolver = (
  source: MediaIdentity["source"],
  externalId: string,
  externalSubId: string,
  type?: MediaIdentity["type"],
) => Promise<MediaCandidate | null>;

// A provider that rate-limits or is down is left alone for a while. The pause is per provider
// (a TMDB outage must not stop AniList work) and in memory: it only protects the provider and
// the background work from hammering, nothing depends on it surviving a restart.
const DEFAULT_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 15 * 60_000;
// A record whose id makes the provider fail every time must not stay PENDING (and pause the
// provider) for good: after a few temporary failures in a row it becomes an error to retry.
const MAX_DEFERRALS = 5;

// Kept on globalThis, like the database connection: the background loop (started from the
// instrumentation hook) and the request handlers may be bundled separately, and they must see
// the same pauses and the same in-flight records.
type EnrichmentState = {
  active: Set<string>;
  cooldowns: Map<ExternalSource, number>;
  deferrals: Map<string, number>;
};
declare global {
  var __mediaListEnrichmentState: EnrichmentState | undefined;
}
function state(): EnrichmentState {
  return (globalThis.__mediaListEnrichmentState ??= {
    active: new Set(),
    cooldowns: new Map(),
    deferrals: new Map(),
  });
}

export function resetEnrichmentCooldowns() {
  state().cooldowns.clear();
  state().deferrals.clear();
}

function coolingSources(now: number) {
  return [...state().cooldowns].filter(([, until]) => until > now).map(([source]) => source);
}

function cooldownEnd(now: number) {
  const ends = [...state().cooldowns.values()].filter((until) => until > now);
  return ends.length ? Math.min(...ends) : null;
}

function deferSource(source: ExternalSource, error: unknown, now: number) {
  const requested =
    error instanceof ProviderResponseError && error.retryAfterSeconds != null
      ? error.retryAfterSeconds * 1000
      : DEFAULT_COOLDOWN_MS;
  state().cooldowns.set(source, now + Math.min(Math.max(requested, 5_000), MAX_COOLDOWN_MS));
}

/** Validates a provider answer for a shared record and applies it, including owners' totals. */
export async function applyProviderCandidate(
  db: AppDb,
  item: Pick<
    typeof media.$inferSelect,
    "id" | "externalSource" | "externalId" | "externalSubId" | "type"
  >,
  candidate: MediaCandidate,
  refreshedAt = new Date(),
) {
  assertSameIdentity(candidate, {
    source: item.externalSource,
    externalId: item.externalId,
    externalSubId: item.externalSubId,
    type: item.type,
  });
  await refreshMediaMetadata(db, item.id, candidate, refreshedAt);
  await adoptTotalForOwners(db, item.id, candidate);
}

export async function enrichMediaMetadata(
  db: AppDb,
  mediaId: string,
  resolver: ExactResolver = resolveExact,
  clock: () => number = Date.now,
) {
  if (state().active.has(mediaId)) return { state: "busy" as const };
  state().active.add(mediaId);
  try {
    const item = await findMediaById(db, mediaId);
    if (!item || item.metadataStatus === "READY") return { state: "skipped" as const };
    // A provider that asked to be left alone is not called for single records either; the
    // record stays PENDING for a later pass.
    if (coolingSources(clock()).includes(item.externalSource))
      return { state: "deferred" as const, error: "Provider is paused after a recent failure" };
    try {
      const candidate = await resolver(
        item.externalSource,
        item.externalId,
        item.externalSubId,
        item.type,
      );
      if (!candidate) throw new Error("Provider validation failed");
      await applyProviderCandidate(db, item, candidate);
      state().deferrals.delete(mediaId);
      return { state: "ready" as const };
    } catch (error) {
      const failures = (state().deferrals.get(mediaId) ?? 0) + 1;
      if (isTemporaryProviderFailure(error) && failures < MAX_DEFERRALS) {
        state().deferrals.set(mediaId, failures);
        // A rate limit or outage says nothing about the item: it stays PENDING and is tried
        // again later instead of becoming an error the user has to retry by hand.
        deferSource(item.externalSource, error, clock());
        return {
          state: "deferred" as const,
          error: error instanceof Error ? error.message : "Provider temporarily unavailable",
        };
      }
      state().deferrals.delete(mediaId);
      const message = (error instanceof Error ? error.message : "Metadata enrichment failed").slice(
        0,
        500,
      );
      await db
        .update(media)
        .set({ metadataStatus: "ERROR", metadataError: message })
        .where(eq(media.id, mediaId));
      return {
        state: "error" as const,
        error: message,
        /** Nothing was sent to a provider, so there is nothing to space out. */
        offline: error instanceof ProviderNotConfiguredError,
      };
    }
  } finally {
    state().active.delete(mediaId);
  }
}

/**
 * A user's list position was saved from a CSV row that carried no total, onto a record that is
 * already READY. Fetches the provider's data only to let that position adopt the total; the
 * shared record itself is left untouched.
 */
export async function adoptTotalsForMedia(
  db: AppDb,
  mediaId: string,
  resolver: ExactResolver = resolveExact,
  clock: () => number = Date.now,
) {
  const item = await findMediaById(db, mediaId);
  if (!item || item.metadataStatus !== "READY") return { state: "skipped" as const };
  if (coolingSources(clock()).includes(item.externalSource)) return { state: "deferred" as const };
  try {
    const candidate = await resolver(
      item.externalSource,
      item.externalId,
      item.externalSubId,
      item.type,
    );
    if (!candidate) return { state: "skipped" as const };
    assertSameIdentity(candidate, {
      source: item.externalSource,
      externalId: item.externalId,
      externalSubId: item.externalSubId,
      type: item.type,
    });
    await adoptTotalForOwners(db, mediaId, candidate);
    state().deferrals.delete(`total:${mediaId}`);
    return { state: "ready" as const };
  } catch (error) {
    // The lookup queue re-offers deferred ids, so the same cap as for records applies: an id
    // the provider keeps failing on is dropped after a few attempts instead of cycling forever.
    const key = `total:${mediaId}`;
    const failures = (state().deferrals.get(key) ?? 0) + 1;
    if (isTemporaryProviderFailure(error) && failures < MAX_DEFERRALS) {
      state().deferrals.set(key, failures);
      deferSource(item.externalSource, error, clock());
      return { state: "deferred" as const };
    }
    state().deferrals.delete(key);
    return { state: "error" as const };
  }
}

/**
 * Enriches up to `limit` pending records one after another. A provider that defers (rate limit,
 * outage) is skipped for the rest of the run and for later runs until its pause is over; the
 * records stay PENDING.
 */
export async function enrichPendingMedia(
  db: AppDb,
  limit = 3,
  resolver: ExactResolver = resolveExact,
  pauseMs = 0,
  clock: () => number = Date.now,
) {
  const cooling = coolingSources(clock());
  const pending = await db
    .select({ id: media.id, source: media.externalSource })
    .from(media)
    .where(
      cooling.length
        ? and(eq(media.metadataStatus, "PENDING"), notInArray(media.externalSource, cooling))
        : eq(media.metadataStatus, "PENDING"),
    )
    .limit(Math.max(1, limit));
  const results = [];
  let spaced = false;
  for (const item of pending) {
    if (coolingSources(clock()).includes(item.source)) continue;
    if (spaced && pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    const result = await enrichMediaMetadata(db, item.id, resolver, clock);
    results.push(result);
    spaced = !(result.state === "error" && "offline" in result && result.offline);
  }
  return results;
}

type DrainOptions = {
  batch?: number;
  maxItems?: number;
  /** Space between provider calls; the default stays under AniList's 90 requests a minute. */
  pauseMs?: number;
  resolver?: ExactResolver;
  /** READY records whose new list positions still need a total from the provider. */
  totalLookups?: string[];
  /** Longest provider pause the drain waits out itself; longer ones are left to later runs. */
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
};

/** Drains the pending backlog in bounded batches (after a bulk import), then the total lookups. */
export async function enrichPendingBacklog(db: AppDb, options: DrainOptions = {}) {
  const {
    batch = 5,
    maxItems = 1000,
    pauseMs = 700,
    resolver = resolveExact,
    maxWaitMs = 120_000,
    sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    clock = Date.now,
  } = options;
  let processed = 0;
  let waits = 0;
  while (processed < maxItems) {
    const results = await enrichPendingMedia(db, batch, resolver, pauseMs, clock);
    const advanced = results.filter((r) => r.state === "ready" || r.state === "error").length;
    processed += advanced;
    if (advanced) continue;
    // Nothing moved: either no pending record is left, or all that are left wait on a provider.
    const waitUntil = cooldownEnd(clock());
    const waiting = (
      await db.select({ value: count() }).from(media).where(eq(media.metadataStatus, "PENDING"))
    )[0].value;
    if (!waiting || waitUntil == null || waitUntil - clock() > maxWaitMs || waits >= 10) break;
    waits += 1;
    await sleep(Math.max(0, waitUntil - clock()));
  }

  const unfinished: string[] = [];
  const lookups = [...new Set(options.totalLookups ?? [])];
  for (const [index, mediaId] of lookups.entries()) {
    let result = await adoptTotalsForMedia(db, mediaId, resolver, clock);
    if (result.state === "deferred") {
      const waitUntil = cooldownEnd(clock());
      if (waitUntil != null && waitUntil - clock() <= maxWaitMs) {
        await sleep(Math.max(0, waitUntil - clock()));
        result = await adoptTotalsForMedia(db, mediaId, resolver, clock);
      }
    }
    // Still deferred: the provider is unavailable for longer than this run waits. Hand the
    // rest back so a later pass can finish them instead of leaving positions without totals.
    if (result.state === "deferred") {
      unfinished.push(...lookups.slice(index));
      break;
    }
    if (result.state === "ready" && pauseMs > 0) await sleep(pauseMs);
  }
  return { processed, unfinished };
}

async function adoptTotalForOwners(db: AppDb, mediaId: string, candidate: MediaCandidate) {
  const providerTotal = defaultProgressTotal(candidate);
  if (providerTotal == null) return;
  const rows = await db
    .select({
      id: userMedia.id,
      status: userMedia.status,
      progressCurrent: userMedia.progressCurrent,
      progressTotal: userMedia.progressTotal,
    })
    .from(userMedia)
    .where(eq(userMedia.mediaId, mediaId));
  for (const row of rows) {
    // Not an edit by the user: `updatedAt` stays so the "recently updated" order is theirs.
    const patch = adoptProviderTotal(row, providerTotal);
    if (patch) await db.update(userMedia).set(patch).where(eq(userMedia.id, row.id));
  }
}
