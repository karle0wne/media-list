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
const active = new Set<string>();

// A provider that rate-limits or is down is left alone for a while. The pause is per provider
// (a TMDB outage must not stop AniList work) and in memory: it only protects the provider and
// the background work from hammering, nothing depends on it surviving a restart.
const DEFAULT_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 15 * 60_000;
const cooldowns = new Map<ExternalSource, number>();

export function resetEnrichmentCooldowns() {
  cooldowns.clear();
}

function coolingSources(now: number) {
  return [...cooldowns].filter(([, until]) => until > now).map(([source]) => source);
}

function cooldownEnd(now: number) {
  const ends = [...cooldowns.values()].filter((until) => until > now);
  return ends.length ? Math.min(...ends) : null;
}

function deferSource(source: ExternalSource, error: unknown, now: number) {
  const requested =
    error instanceof ProviderResponseError && error.retryAfterSeconds != null
      ? error.retryAfterSeconds * 1000
      : DEFAULT_COOLDOWN_MS;
  cooldowns.set(source, now + Math.min(Math.max(requested, 5_000), MAX_COOLDOWN_MS));
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
  if (active.has(mediaId)) return { state: "busy" as const };
  active.add(mediaId);
  try {
    const item = await findMediaById(db, mediaId);
    if (!item || item.metadataStatus === "READY") return { state: "skipped" as const };
    try {
      const candidate = await resolver(
        item.externalSource,
        item.externalId,
        item.externalSubId,
        item.type,
      );
      if (!candidate) throw new Error("Provider validation failed");
      await applyProviderCandidate(db, item, candidate);
      return { state: "ready" as const };
    } catch (error) {
      if (isTemporaryProviderFailure(error)) {
        // A rate limit or outage says nothing about the item: it stays PENDING and is tried
        // again later instead of becoming an error the user has to retry by hand.
        deferSource(item.externalSource, error, clock());
        return {
          state: "deferred" as const,
          error: error instanceof Error ? error.message : "Provider temporarily unavailable",
        };
      }
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
    active.delete(mediaId);
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
    return { state: "ready" as const };
  } catch (error) {
    if (isTemporaryProviderFailure(error)) {
      deferSource(item.externalSource, error, clock());
      return { state: "deferred" as const };
    }
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

  for (const mediaId of new Set(options.totalLookups ?? [])) {
    let result = await adoptTotalsForMedia(db, mediaId, resolver, clock);
    if (result.state === "deferred") {
      const waitUntil = cooldownEnd(clock());
      if (waitUntil == null || waitUntil - clock() > maxWaitMs) continue;
      await sleep(Math.max(0, waitUntil - clock()));
      result = await adoptTotalsForMedia(db, mediaId, resolver, clock);
    }
    if (result.state === "ready" && pauseMs > 0) await sleep(pauseMs);
  }
  return processed;
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
