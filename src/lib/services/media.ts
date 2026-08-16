import { randomUUID } from "node:crypto";
import { and, desc, eq, like, type SQL } from "drizzle-orm";
import type { AppDb } from "@/db";
import { media, userMedia } from "@/db/schema";
import { resolveExact } from "../providers";
import type { ImportedUserData, MediaCandidate, MediaIdentity, MediaStatus, MediaType } from "../types";

export async function ensureMedia(db: AppDb, candidate: MediaCandidate) {
  const existing = await findMedia(db, candidate.source, candidate.externalId, candidate.externalSubId);
  if (existing) return existing;
  const now = new Date();
  await db.insert(media).values({
    id: randomUUID(),
    type: candidate.type,
    externalSource: candidate.source,
    externalId: candidate.externalId,
    externalSubId: candidate.externalSubId,
    ...candidateMetadataValues(candidate),
    metadataRefreshedAt: candidate.source === "TMDB" ? now : null,
    createdAt: now,
  }).onConflictDoNothing();
  const resolved = await findMedia(db, candidate.source, candidate.externalId, candidate.externalSubId);
  if (!resolved) throw new Error("Failed to create media record");
  return resolved;
}

export async function refreshMediaMetadata(db: AppDb, mediaId: string, candidate: MediaCandidate, refreshedAt = new Date()) {
  await db.update(media).set({ ...candidateMetadataValues(candidate), metadataRefreshedAt: refreshedAt }).where(eq(media.id, mediaId));
}

export async function resolveAndAddMedia(db: AppDb, userId: string, identity: MediaIdentity, userData: ImportedUserData = {}) {
  const candidate = await resolveExact(identity.source, identity.externalId, identity.externalSubId, identity.type);
  if (!candidate) throw new Error("Provider validation failed");
  if (candidate.source !== identity.source || candidate.externalId !== identity.externalId || candidate.externalSubId !== identity.externalSubId) {
    throw new Error("Provider returned a different media identity");
  }
  if (candidate.type !== identity.type) throw new Error(`Provider item type is ${candidate.type}, expected ${identity.type}`);
  return addMediaToUser(db, userId, candidate, userData);
}

export async function addMediaToUser(db: AppDb, userId: string, candidate: MediaCandidate, userData: ImportedUserData = {}) {
  const item = await ensureMedia(db, candidate);
  const existing = (await db.select({ id: userMedia.id }).from(userMedia).where(and(eq(userMedia.userId, userId), eq(userMedia.mediaId, item.id))).limit(1))[0];
  if (existing) return { item, inserted: false };
  const now = new Date();
  await db.insert(userMedia).values({ id: randomUUID(), userId, mediaId: item.id, status: userData.status ?? "PLANNED", score: userData.score ?? null, progressCurrent: userData.progressCurrent ?? 0, progressTotal: userData.progressTotal ?? defaultProgressTotal(candidate), notes: userData.notes ?? null, timeSpentOverrideMinutes: userData.timeSpentOverrideMinutes ?? null, createdAt: now, updatedAt: now }).onConflictDoNothing();
  return { item, inserted: true };
}

export async function updateUserMedia(db: AppDb, userId: string, id: string, values: { status: MediaStatus; score: number | null; progressCurrent: number; progressTotal: number | null; notes: string | null; timeSpentOverrideMinutes: number | null; }) {
  await db.update(userMedia).set({ ...values, updatedAt: new Date() }).where(and(eq(userMedia.id, id), eq(userMedia.userId, userId)));
}

export async function deleteUserMedia(db: AppDb, userId: string, id: string) {
  await db.delete(userMedia).where(and(eq(userMedia.id, id), eq(userMedia.userId, userId)));
}

export async function listUserMedia(db: AppDb, userId: string, filters: { status?: MediaStatus; type?: MediaType; q?: string } = {}) {
  const clauses: SQL[] = [eq(userMedia.userId, userId)];
  if (filters.status) clauses.push(eq(userMedia.status, filters.status));
  if (filters.type) clauses.push(eq(media.type, filters.type));
  if (filters.q?.trim()) clauses.push(like(media.title, `%${filters.q.trim()}%`));
  return db.select({ userMediaId: userMedia.id, mediaId: media.id, title: media.title, originalTitle: media.originalTitle, type: media.type, year: media.year, source: media.externalSource, externalId: media.externalId, externalSubId: media.externalSubId, runtimeMinutes: media.runtimeMinutes, pageCount: media.pageCount, coverUrl: media.coverUrl, status: userMedia.status, score: userMedia.score, progressCurrent: userMedia.progressCurrent, progressTotal: userMedia.progressTotal, notes: userMedia.notes, timeSpentOverrideMinutes: userMedia.timeSpentOverrideMinutes, updatedAt: userMedia.updatedAt }).from(userMedia).innerJoin(media, eq(userMedia.mediaId, media.id)).where(and(...clauses)).orderBy(desc(userMedia.updatedAt));
}

function candidateMetadataValues(candidate: MediaCandidate) {
  return {
    title: candidate.title,
    originalTitle: candidate.originalTitle ?? null,
    countryCode: candidate.countryCode ?? null,
    year: candidate.year ?? null,
    runtimeMinutes: candidate.runtimeMinutes ?? null,
    episodeCount: candidate.episodeCount ?? null,
    pageCount: candidate.pageCount ?? null,
    coverUrl: candidate.coverUrl ?? null,
    metadataJson: JSON.stringify({ description: candidate.description ?? null }),
  };
}

async function findMedia(db: AppDb, source: MediaCandidate["source"], externalId: string, externalSubId: string) {
  return (await db.select().from(media).where(and(eq(media.externalSource, source), eq(media.externalId, externalId), eq(media.externalSubId, externalSubId))).limit(1))[0] ?? null;
}

function defaultProgressTotal(candidate: MediaCandidate) {
  if (candidate.type === "MOVIE") return 1;
  if (candidate.type === "BOOK") return candidate.pageCount ?? null;
  return candidate.episodeCount ?? null;
}
