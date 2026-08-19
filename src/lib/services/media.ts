import { randomUUID } from "node:crypto";
import { and, desc, eq, like, type SQL } from "drizzle-orm";
import type { AppDb } from "@/db";
import { media, userMedia } from "@/db/schema";
import { resolveExact } from "../providers";
import type { ImportedUserData, MediaCandidate, MediaIdentity, MediaStatus, MediaType } from "../types";

export async function ensureMedia(db: AppDb, candidate: MediaCandidate) {
  const existing = await findMedia(db, candidate.source, candidate.externalId, candidate.externalSubId);
  if (existing) {
    if (existing.metadataStatus !== "READY") {
      await refreshMediaMetadata(db, existing.id, candidate);
      return (await findMedia(db, candidate.source, candidate.externalId, candidate.externalSubId))!;
    }
    return existing;
  }
  const now = new Date();
  await db.insert(media).values({
    id: randomUUID(),
    type: candidate.type,
    externalSource: candidate.source,
    externalId: candidate.externalId,
    externalSubId: candidate.externalSubId,
    ...candidateMetadataValues(candidate),
    metadataStatus: "READY",
    metadataError: null,
    metadataRefreshedAt: now,
    createdAt: now,
  }).onConflictDoNothing();
  const resolved = await findMedia(db, candidate.source, candidate.externalId, candidate.externalSubId);
  if (!resolved) throw new Error("Failed to create media record");
  return resolved;
}

export async function refreshMediaMetadata(db: AppDb, mediaId: string, candidate: MediaCandidate, refreshedAt = new Date()) {
  await db.update(media).set({ ...candidateMetadataValues(candidate), metadataStatus: "READY", metadataError: null, metadataRefreshedAt: refreshedAt }).where(eq(media.id, mediaId));
}

export async function resolveAndAddMedia(db: AppDb, userId: string, identity: MediaIdentity, userData: ImportedUserData = {}) {
  const candidate = await resolveExact(identity.source, identity.externalId, identity.externalSubId, identity.type);
  if (!candidate) throw new Error("Provider validation failed");
  assertSameIdentity(candidate, identity);
  return addMediaToUser(db, userId, candidate, userData);
}

export async function addSelectedMediaToUser(db: AppDb, userId: string, candidate: MediaCandidate, userData: ImportedUserData = {}) {
  let item = await findMedia(db, candidate.source, candidate.externalId, candidate.externalSubId);
  if (!item) {
    const now = new Date();
    await db.insert(media).values({
      id: randomUUID(),
      type: candidate.type,
      externalSource: candidate.source,
      externalId: candidate.externalId,
      externalSubId: candidate.externalSubId,
      ...candidateMetadataValues(candidate),
      metadataStatus: "PENDING",
      metadataError: null,
      metadataRefreshedAt: null,
      createdAt: now,
    }).onConflictDoNothing();
    item = await findMedia(db, candidate.source, candidate.externalId, candidate.externalSubId);
  } else if (item.metadataStatus !== "READY") {
    await db.update(media).set({ ...candidateMetadataValues(candidate), type: candidate.type, metadataStatus: "PENDING", metadataError: null }).where(eq(media.id, item.id));
    item = await findMedia(db, candidate.source, candidate.externalId, candidate.externalSubId);
  }
  if (!item) throw new Error("Failed to create media record");
  const result = await addUserMediaLink(db, userId, item.id, candidate, userData);
  return { ...result, item, needsEnrichment: item.metadataStatus !== "READY" };
}

export async function addMediaToUser(db: AppDb, userId: string, candidate: MediaCandidate, userData: ImportedUserData = {}) {
  const item = await ensureMedia(db, candidate);
  const result = await addUserMediaLink(db, userId, item.id, candidate, userData);
  return { item, ...result };
}

export async function retryMediaMetadata(db: AppDb, userId: string, mediaId: string) {
  const owned = (await db.select({ id: userMedia.id }).from(userMedia).where(and(eq(userMedia.userId, userId), eq(userMedia.mediaId, mediaId))).limit(1))[0];
  if (!owned) return false;
  await db.update(media).set({ metadataStatus: "PENDING", metadataError: null }).where(eq(media.id, mediaId));
  return true;
}

type UserMediaUpdate = {
  status: MediaStatus;
  score: number | null;
  progressCurrent: number;
  progressTotal: number | null;
  notes: string | null;
  timeSpentOverrideMinutes: number | null;
};

export async function updateUserMedia(db: AppDb, userId: string, id: string, values: Partial<UserMediaUpdate>) {
  if (!Object.keys(values).length) return;
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
  return db.select({ userMediaId: userMedia.id, mediaId: media.id, title: media.title, originalTitle: media.originalTitle, type: media.type, year: media.year, source: media.externalSource, externalId: media.externalId, externalSubId: media.externalSubId, runtimeMinutes: media.runtimeMinutes, pageCount: media.pageCount, coverUrl: media.coverUrl, metadataStatus: media.metadataStatus, metadataError: media.metadataError, status: userMedia.status, score: userMedia.score, progressCurrent: userMedia.progressCurrent, progressTotal: userMedia.progressTotal, notes: userMedia.notes, timeSpentOverrideMinutes: userMedia.timeSpentOverrideMinutes, updatedAt: userMedia.updatedAt }).from(userMedia).innerJoin(media, eq(userMedia.mediaId, media.id)).where(and(...clauses)).orderBy(desc(userMedia.updatedAt));
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

async function addUserMediaLink(db: AppDb, userId: string, mediaId: string, candidate: MediaCandidate, userData: ImportedUserData) {
  const existing = (await db.select({ id: userMedia.id }).from(userMedia).where(and(eq(userMedia.userId, userId), eq(userMedia.mediaId, mediaId))).limit(1))[0];
  if (existing) return { inserted: false };
  const now = new Date();
  await db.insert(userMedia).values({ id: randomUUID(), userId, mediaId, status: userData.status ?? "PLANNED", score: userData.score ?? null, progressCurrent: userData.progressCurrent ?? 0, progressTotal: userData.progressTotal ?? defaultProgressTotal(candidate), notes: userData.notes ?? null, timeSpentOverrideMinutes: userData.timeSpentOverrideMinutes ?? null, createdAt: now, updatedAt: now }).onConflictDoNothing();
  return { inserted: true };
}

export async function findMediaById(db: AppDb, mediaId: string) {
  return (await db.select().from(media).where(eq(media.id, mediaId)).limit(1))[0] ?? null;
}

function assertSameIdentity(candidate: MediaCandidate, identity: MediaIdentity) {
  if (candidate.source !== identity.source || candidate.externalId !== identity.externalId || candidate.externalSubId !== identity.externalSubId) throw new Error("Provider returned a different media identity");
  if (candidate.type !== identity.type) throw new Error(`Provider item type is ${candidate.type}, expected ${identity.type}`);
}

async function findMedia(db: AppDb, source: MediaCandidate["source"], externalId: string, externalSubId: string) {
  return (await db.select().from(media).where(and(eq(media.externalSource, source), eq(media.externalId, externalId), eq(media.externalSubId, externalSubId))).limit(1))[0] ?? null;
}

function defaultProgressTotal(candidate: MediaCandidate) {
  if (candidate.type === "MOVIE") return 1;
  if (candidate.type === "BOOK") return candidate.pageCount ?? null;
  return candidate.episodeCount ?? null;
}
