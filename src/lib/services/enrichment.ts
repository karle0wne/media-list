import { eq } from "drizzle-orm";
import type { AppDb } from "@/db";
import { media, userMedia } from "@/db/schema";
import { assertSameIdentity } from "../domain/identity";
import { adoptProviderTotal, defaultProgressTotal } from "../domain/progress";
import { ProviderResponseError } from "../providers/http";
import { resolveExact } from "../providers";
import type { MediaCandidate, MediaIdentity } from "../types";
import { findMediaById, refreshMediaMetadata } from "./media";

export type ExactResolver = (
  source: MediaIdentity["source"],
  externalId: string,
  externalSubId: string,
  type?: MediaIdentity["type"],
) => Promise<MediaCandidate | null>;
const active = new Set<string>();

export async function enrichMediaMetadata(
  db: AppDb,
  mediaId: string,
  resolver: ExactResolver = resolveExact,
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
      assertSameIdentity(candidate, {
        source: item.externalSource,
        externalId: item.externalId,
        externalSubId: item.externalSubId,
        type: item.type,
      });
      await refreshMediaMetadata(db, item.id, candidate);
      await adoptTotalForOwners(db, item.id, candidate);
      return { state: "ready" as const };
    } catch (error) {
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
        rateLimited: error instanceof ProviderResponseError && error.status === 429,
      };
    }
  } finally {
    active.delete(mediaId);
  }
}

/**
 * Enriches up to `limit` pending records one after another. A rate limit stops the run: the
 * remaining records stay PENDING for a later pass instead of each failing against the limit.
 */
export async function enrichPendingMedia(
  db: AppDb,
  limit = 3,
  resolver: ExactResolver = resolveExact,
  pauseMs = 0,
) {
  const pending = await db
    .select({ id: media.id })
    .from(media)
    .where(eq(media.metadataStatus, "PENDING"))
    .limit(Math.max(1, limit));
  const results = [];
  for (const [index, item] of pending.entries()) {
    if (index > 0 && pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    const result = await enrichMediaMetadata(db, item.id, resolver);
    results.push(result);
    if (result.state === "error" && result.rateLimited) break;
  }
  return results;
}

/** Drains the whole pending backlog in bounded batches (after a bulk import). */
export async function enrichPendingBacklog(
  db: AppDb,
  options: { batch?: number; maxItems?: number; pauseMs?: number; resolver?: ExactResolver } = {},
) {
  const { batch = 5, maxItems = 300, pauseMs = 300, resolver = resolveExact } = options;
  let processed = 0;
  while (processed < maxItems) {
    const results = await enrichPendingMedia(db, batch, resolver, pauseMs);
    const advanced = results.filter(
      (result) => result.state === "ready" || result.state === "error",
    );
    processed += advanced.length;
    if (!advanced.length || results.some((r) => r.state === "error" && r.rateLimited)) break;
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
