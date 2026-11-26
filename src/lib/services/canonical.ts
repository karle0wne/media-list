import { asc, eq } from "drizzle-orm";
import type { AppDb } from "@/db";
import { media, userMedia } from "@/db/schema";
import { parseCsv, rowsToObjects, stringifyCsv } from "../csv";
import { assertWellFormedIdentity } from "../domain/identity";
import { reconcileImportedProgress } from "../domain/progress";
import { parseExternalSource, parseMediaType, parseUserMediaInput } from "../user-media";
import { addSelectedMediaToUser } from "./media";

export const CANONICAL_HEADERS = [
  "external_source",
  "external_id",
  "external_sub_id",
  "type",
  "title",
  "status",
  "score",
  "progress_current",
  "progress_total",
  "notes",
  "created_at",
  "updated_at",
] as const;

// Columns every file must have; the dates and user state are optional so older exports and
// hand-made files keep working.
const REQUIRED_HEADERS = ["external_source", "external_id", "type"] as const;

export async function exportCanonical(db: AppDb, userId: string) {
  const rows = await db
    .select({
      source: media.externalSource,
      externalId: media.externalId,
      externalSubId: media.externalSubId,
      type: media.type,
      title: media.title,
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
    .where(eq(userMedia.userId, userId))
    .orderBy(asc(userMedia.createdAt), asc(media.title));
  return stringifyCsv([
    [...CANONICAL_HEADERS],
    ...rows.map((row) => [
      row.source,
      row.externalId,
      row.externalSubId,
      row.type,
      row.title,
      row.status,
      row.score,
      row.progressCurrent,
      row.progressTotal,
      row.notes,
      row.createdAt.toISOString(),
      row.updatedAt.toISOString(),
    ]),
  ]);
}

// The import runs inside one request on the single database connection: bound the work and
// hand control back to the event loop regularly so other requests keep being served.
const MAX_ROWS = 5_000;
const YIELD_EVERY = 25;

/**
 * Restores a canonical file without waiting for any provider: every row is saved locally at
 * once from the file's own data and its shared record is left PENDING for background
 * enrichment. A backup restore therefore works even while a provider is down or rate limited.
 */
export async function importCanonical(db: AppDb, userId: string, input: string) {
  const rows = parseCsv(input.replace(/^\uFEFF/, ""));
  const headers = new Set((rows[0] ?? []).map((header) => header.trim()));
  const missing = REQUIRED_HEADERS.filter((header) => !headers.has(header));
  if (rows.length && missing.length)
    throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
  if (rows.length - 1 > MAX_ROWS)
    throw new Error(`CSV has too many rows (${MAX_ROWS} at most per import)`);

  const report = {
    imported: 0,
    duplicates: 0,
    invalid: 0,
    adjusted: 0,
    needsEnrichment: false,
    /** READY shared records whose new positions still need a total from the provider. */
    totalLookups: [] as string[],
    errors: [] as string[],
  };
  const objects = rowsToObjects(rows);
  for (let index = 0; index < objects.length; index += 1) {
    if (index > 0 && index % YIELD_EVERY === 0) await new Promise((r) => setImmediate(r));
    const row = objects[index];
    try {
      const identity = {
        source: parseExternalSource(row.external_source),
        externalId: (row.external_id ?? "").trim(),
        externalSubId: (row.external_sub_id ?? "").trim(),
        type: parseMediaType(row.type),
      };
      if (!identity.externalId) throw new Error("external_id is required");
      assertWellFormedIdentity(identity);
      const createdAt = parseTimestamp(row.created_at, "created_at");
      const updatedAt = parseTimestamp(row.updated_at, "updated_at");
      const key = `${identity.source}:${identity.externalId}:${identity.externalSubId}`;
      const candidate = { ...identity, key, title: cleanTitle(row.title) || key };
      const reconciled = reconcileImportedProgress(
        {
          ...parseUserMediaInput({
            status: row.status,
            score: row.score,
            progressCurrent: row.progress_current,
            progressTotal: row.progress_total,
            notes: row.notes,
          }),
          createdAt,
          updatedAt: createdAt && updatedAt && updatedAt < createdAt ? createdAt : updatedAt,
        },
        candidate,
      );
      const result = await addSelectedMediaToUser(db, userId, candidate, reconciled.userData, {
        thin: true,
      });
      if (result.inserted) {
        report.imported += 1;
        if (reconciled.adjusted) report.adjusted += 1;
      } else report.duplicates += 1;
      if (result.needsEnrichment) report.needsEnrichment = true;
      if (result.needsTotal) report.totalLookups.push(result.item.id);
    } catch (error) {
      report.invalid += 1;
      report.errors.push(
        `row ${index + 2}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  return report;
}

/** The title is shown to every user who tracks this work, so it is kept short and plain. */
function cleanTitle(value: string | undefined) {
  return (value ?? "")
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function parseTimestamp(value: string | undefined, label: string) {
  const text = value?.trim();
  if (!text) return undefined;
  const time = /^\d{4}-\d{2}-\d{2}/.test(text) ? Date.parse(text) : Number.NaN;
  if (!Number.isFinite(time)) throw new Error(`${label} must be an ISO 8601 date`);
  return new Date(time);
}
