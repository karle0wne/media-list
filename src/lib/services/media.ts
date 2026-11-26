import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, ne, type SQL } from "drizzle-orm";
import type { AppDb } from "@/db";
import { media, userMedia } from "@/db/schema";
import { completionProgress, initialProgress } from "../domain/progress";
import type { ImportedUserData, MediaCandidate, MediaStatus, MediaType } from "../types";

export type MediaSort = "updated" | "created" | "title" | "score" | "progress" | "type" | "year";
export type SortDirection = "asc" | "desc";
export type ListUserMediaFilters = {
  status?: MediaStatus;
  types?: MediaType[];
  q?: string;
  scoreMin?: number;
  hasNotes?: boolean;
  sort?: MediaSort;
  direction?: SortDirection;
};

/**
 * "verified": the candidate came straight from a provider lookup, so the shared record is
 * READY at once. "signed": a provider search result this server signed; it may fill in an
 * unverified record but is still validated by enrichment. "pending": the candidate is only
 * trusted enough to save locally (CSV rows); it never rewrites an existing shared record.
 */
type MediaTrust = "verified" | "signed" | "pending";

/** The one place that creates or advances a shared `media` row for a provider identity. */
async function ensureMediaRow(db: AppDb, candidate: MediaCandidate, trust: MediaTrust) {
  const existing = await findMedia(db, candidate);
  if (existing) {
    if (existing.metadataStatus === "READY") return existing;
    // A CSV row never rewrites a shared record, otherwise one user's file could retitle a work
    // other users already track. Provider data (fetched or signed by this server) may.
    if (trust === "verified") await refreshMediaMetadata(db, existing.id, candidate);
    else if (trust === "signed")
      await db
        .update(media)
        .set({ ...candidateMetadataValues(candidate), metadataError: null })
        .where(eq(media.id, existing.id));
    return (await findMedia(db, candidate)) ?? existing;
  }
  await db
    .insert(media)
    .values({
      id: randomUUID(),
      type: candidate.type,
      externalSource: candidate.source,
      externalId: candidate.externalId,
      externalSubId: candidate.externalSubId,
      ...candidateMetadataValues(candidate),
      metadataStatus: trust === "verified" ? "READY" : "PENDING",
      metadataError: null,
      metadataRefreshedAt: trust === "verified" ? new Date() : null,
    })
    .onConflictDoNothing();
  const created = await findMedia(db, candidate);
  if (!created) throw new Error("Failed to create media record");
  return created;
}

export async function refreshMediaMetadata(
  db: AppDb,
  mediaId: string,
  candidate: MediaCandidate,
  refreshedAt = new Date(),
) {
  await db
    .update(media)
    .set({
      ...candidateMetadataValues(candidate),
      metadataStatus: "READY",
      metadataError: null,
      metadataRefreshedAt: refreshedAt,
    })
    .where(eq(media.id, mediaId));
}

/**
 * Local-first add: no provider call; enrichment validates and completes the record later.
 * `needsEnrichment`: the shared record is not READY yet. `needsTotal`: a thin candidate (CSV
 * row) landed on a READY record, so a lookup must still supply the total for this user.
 */
export async function addSelectedMediaToUser(
  db: AppDb,
  userId: string,
  candidate: MediaCandidate,
  userData: ImportedUserData = {},
  options: {
    trust?: "signed" | "pending";
    /** The candidate holds only identity and title (CSV), so a total may still be missing. */
    thin?: boolean;
  } = {},
) {
  const progress = initialProgress(userData, candidate);
  const item = await ensureMediaRow(db, candidate, options.trust ?? "pending");
  const result = await addUserMediaLink(db, userId, item.id, progress, userData);
  const needsEnrichment = item.metadataStatus !== "READY";
  const needsTotal =
    options.thin === true &&
    result.inserted &&
    !needsEnrichment &&
    progress.progressTotal == null &&
    !userData.progressTotalUnknown &&
    (candidate.type === "ANIME" || candidate.type === "SERIES" || candidate.type === "BOOK");
  return { ...result, item, needsEnrichment, needsTotal };
}

/** Adds a candidate that was just fetched from the provider (READY immediately). */
export async function addMediaToUser(
  db: AppDb,
  userId: string,
  candidate: MediaCandidate,
  userData: ImportedUserData = {},
) {
  const progress = initialProgress(userData, candidate);
  const item = await ensureMediaRow(db, candidate, "verified");
  const result = await addUserMediaLink(db, userId, item.id, progress, userData);
  return { item, ...result };
}

export async function retryMediaMetadata(db: AppDb, userId: string, mediaId: string) {
  const owned = (
    await db
      .select({ id: userMedia.id })
      .from(userMedia)
      .where(and(eq(userMedia.userId, userId), eq(userMedia.mediaId, mediaId)))
      .limit(1)
  )[0];
  if (!owned) return false;
  await db
    .update(media)
    .set({ metadataStatus: "PENDING", metadataError: null })
    .where(eq(media.id, mediaId));
  return true;
}

type UserMediaUpdate = {
  status: MediaStatus;
  score: number | null;
  progressCurrent: number;
  progressTotal: number | null;
  notes: string | null;
};

export async function updateUserMedia(
  db: AppDb,
  userId: string,
  id: string,
  values: Partial<UserMediaUpdate>,
) {
  if (!Object.keys(values).length) return;
  const normalized: Partial<UserMediaUpdate> = { ...values };
  if (values.status === "COMPLETED") {
    const current = (
      await db
        .select({ progressTotal: userMedia.progressTotal })
        .from(userMedia)
        .where(and(eq(userMedia.id, id), eq(userMedia.userId, userId)))
        .limit(1)
    )[0];
    if (current) Object.assign(normalized, completionProgress(current, values.progressTotal));
  }
  await db
    .update(userMedia)
    .set({ ...normalized, updatedAt: new Date() })
    .where(and(eq(userMedia.id, id), eq(userMedia.userId, userId)));
}

export async function deleteUserMedia(db: AppDb, userId: string, id: string) {
  await deleteUserMediaMany(db, userId, [id]);
}

export async function deleteUserMediaMany(db: AppDb, userId: string, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 500);
  if (!unique.length) return;
  await db
    .delete(userMedia)
    .where(and(eq(userMedia.userId, userId), inArray(userMedia.id, unique)));
}

export async function listUserMedia(db: AppDb, userId: string, filters: ListUserMediaFilters = {}) {
  const clauses: SQL[] = [eq(userMedia.userId, userId)];
  if (filters.status) clauses.push(eq(userMedia.status, filters.status));
  if (filters.types?.length) clauses.push(inArray(media.type, filters.types));
  if (filters.scoreMin != null) clauses.push(gte(userMedia.score, filters.scoreMin));
  if (filters.hasNotes) clauses.push(and(isNotNull(userMedia.notes), ne(userMedia.notes, ""))!);
  const direction = filters.direction === "asc" ? asc : desc;
  const order =
    filters.sort === "updated"
      ? direction(userMedia.updatedAt)
      : filters.sort === "created"
        ? direction(userMedia.createdAt)
        : filters.sort === "title"
          ? direction(media.title)
          : filters.sort === "score"
            ? direction(userMedia.score)
            : filters.sort === "progress"
              ? direction(userMedia.progressCurrent)
              : filters.sort === "type"
                ? direction(media.type)
                : filters.sort === "year"
                  ? direction(media.year)
                  : direction(userMedia.updatedAt);
  const rows = await db
    .select({
      userMediaId: userMedia.id,
      mediaId: media.id,
      title: media.title,
      originalTitle: media.originalTitle,
      romanizedTitle: media.romanizedTitle,
      type: media.type,
      year: media.year,
      source: media.externalSource,
      externalId: media.externalId,
      externalSubId: media.externalSubId,
      externalUrl: media.externalUrl,
      coverUrl: media.coverUrl,
      metadataStatus: media.metadataStatus,
      metadataError: media.metadataError,
      status: userMedia.status,
      score: userMedia.score,
      progressCurrent: userMedia.progressCurrent,
      progressTotal: userMedia.progressTotal,
      notes: userMedia.notes,
      createdAt: userMedia.createdAt,
      updatedAt: userMedia.updatedAt,
    })
    .from(userMedia)
    .innerJoin(media, eq(userMedia.mediaId, media.id))
    .where(and(...clauses))
    .orderBy(order, asc(media.title));
  // Matching is done here rather than with SQL LIKE: SQLite folds case for ASCII only, so
  // Cyrillic and accented titles would not be found.
  const needle = searchKey(filters.q ?? "");
  if (!needle) return rows;
  return rows.filter((row) =>
    [row.title, row.originalTitle, row.romanizedTitle].some(
      (title) => title != null && searchKey(title).includes(needle),
    ),
  );
}

/**
 * Case-insensitive form used to compare search text with titles. Accents on Latin letters
 * and ё/е are folded; other marks are kept, so "й" and "и" or "が" and "か" stay different.
 */
export function searchKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateMetadataValues(candidate: MediaCandidate) {
  return {
    title: candidate.title,
    originalTitle: candidate.originalTitle ?? null,
    romanizedTitle: candidate.romanizedTitle ?? null,
    year: candidate.year ?? null,
    externalUrl: candidate.externalUrl ?? null,
    coverUrl: candidate.coverUrl ?? null,
  };
}

async function addUserMediaLink(
  db: AppDb,
  userId: string,
  mediaId: string,
  progress: { progressCurrent: number; progressTotal: number | null },
  userData: ImportedUserData,
) {
  const existing = (
    await db
      .select({ id: userMedia.id })
      .from(userMedia)
      .where(and(eq(userMedia.userId, userId), eq(userMedia.mediaId, mediaId)))
      .limit(1)
  )[0];
  if (existing) return { inserted: false };
  const createdAt = userData.createdAt ?? new Date();
  await db
    .insert(userMedia)
    .values({
      id: randomUUID(),
      userId,
      mediaId,
      status: userData.status ?? "PLANNED",
      score: userData.score ?? null,
      ...progress,
      notes: userData.notes ?? null,
      createdAt,
      updatedAt: userData.updatedAt ?? createdAt,
    })
    .onConflictDoNothing();
  return { inserted: true };
}

export async function findMediaById(db: AppDb, mediaId: string) {
  return (await db.select().from(media).where(eq(media.id, mediaId)).limit(1))[0] ?? null;
}

async function findMedia(
  db: AppDb,
  identity: Pick<MediaCandidate, "source" | "externalId" | "externalSubId">,
) {
  return (
    (
      await db
        .select()
        .from(media)
        .where(
          and(
            eq(media.externalSource, identity.source),
            eq(media.externalId, identity.externalId),
            eq(media.externalSubId, identity.externalSubId),
          ),
        )
        .limit(1)
    )[0] ?? null
  );
}
