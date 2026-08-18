import { and, eq, isNull } from "drizzle-orm";
import type { AppDb } from "@/db";
import { media, userMedia } from "@/db/schema";
import { resolveExact } from "../providers";
import type { MediaCandidate, MediaIdentity } from "../types";
import { findMediaById, refreshMediaMetadata } from "./media";

export type ExactResolver = (source: MediaIdentity["source"], externalId: string, externalSubId: string, type?: MediaIdentity["type"]) => Promise<MediaCandidate | null>;
const active = new Set<string>();

export async function enrichMediaMetadata(db: AppDb, mediaId: string, resolver: ExactResolver = resolveExact) {
  if (active.has(mediaId)) return { state: "busy" as const };
  active.add(mediaId);
  try {
    const item = await findMediaById(db, mediaId);
    if (!item || item.metadataStatus === "READY") return { state: "skipped" as const };
    try {
      const candidate = await resolver(item.externalSource, item.externalId, item.externalSubId, item.type);
      if (!candidate) throw new Error("Provider validation failed");
      if (candidate.source !== item.externalSource || candidate.externalId !== item.externalId || candidate.externalSubId !== item.externalSubId) throw new Error("Provider returned a different media identity");
      if (candidate.type !== item.type) throw new Error(`Provider item type is ${candidate.type}, expected ${item.type}`);
      await refreshMediaMetadata(db, item.id, candidate);
      const progressTotal = defaultProgressTotal(candidate);
      if (progressTotal != null) await db.update(userMedia).set({ progressTotal }).where(and(eq(userMedia.mediaId, item.id), isNull(userMedia.progressTotal)));
      return { state: "ready" as const };
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Metadata enrichment failed").slice(0, 500);
      await db.update(media).set({ metadataStatus: "ERROR", metadataError: message }).where(eq(media.id, mediaId));
      return { state: "error" as const, error: message };
    }
  } finally {
    active.delete(mediaId);
  }
}

export async function enrichPendingMedia(db: AppDb, limit = 3, resolver: ExactResolver = resolveExact) {
  const pending = await db.select({ id: media.id }).from(media).where(eq(media.metadataStatus, "PENDING")).limit(Math.max(1, limit));
  const results = [];
  for (const item of pending) results.push(await enrichMediaMetadata(db, item.id, resolver));
  return results;
}

function defaultProgressTotal(candidate: MediaCandidate) {
  if (candidate.type === "MOVIE") return 1;
  if (candidate.type === "BOOK") return candidate.pageCount ?? null;
  return candidate.episodeCount ?? null;
}
