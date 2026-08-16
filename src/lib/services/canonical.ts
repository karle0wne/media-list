import { eq } from "drizzle-orm";
import type { AppDb } from "@/db";
import { media, userMedia } from "@/db/schema";
import { parseCsv, rowsToObjects, stringifyCsv } from "../csv";
import { parseExternalSource, parseMediaType, parseUserMediaInput } from "../user-media";
import { resolveAndAddMedia } from "./media";

export const CANONICAL_HEADERS = ["external_source","external_id","external_sub_id","type","title","status","score","progress_current","progress_total","notes","time_spent_override_minutes"] as const;

export async function exportCanonical(db: AppDb, userId: string) {
  const rows = await db.select({ source: media.externalSource, externalId: media.externalId, externalSubId: media.externalSubId, type: media.type, title: media.title, status: userMedia.status, score: userMedia.score, progressCurrent: userMedia.progressCurrent, progressTotal: userMedia.progressTotal, notes: userMedia.notes, timeSpentOverrideMinutes: userMedia.timeSpentOverrideMinutes }).from(userMedia).innerJoin(media, eq(userMedia.mediaId, media.id)).where(eq(userMedia.userId, userId));
  return stringifyCsv([[...CANONICAL_HEADERS], ...rows.map((row) => [row.source, row.externalId, row.externalSubId, row.type, row.title, row.status, row.score, row.progressCurrent, row.progressTotal, row.notes, row.timeSpentOverrideMinutes])]);
}

export async function importCanonical(db: AppDb, userId: string, input: string) {
  const objects = rowsToObjects(parseCsv(input));
  const report = { imported: 0, duplicates: 0, invalid: 0, errors: [] as string[] };
  for (let index = 0; index < objects.length; index += 1) {
    const row = objects[index];
    try {
      const identity = {
        source: parseExternalSource(row.external_source),
        externalId: row.external_id,
        externalSubId: row.external_sub_id ?? "",
        type: parseMediaType(row.type),
      };
      if (!identity.externalId?.trim()) throw new Error("external_id is required");
      const userData = parseUserMediaInput({
        status: row.status,
        score: row.score,
        progressCurrent: row.progress_current,
        progressTotal: row.progress_total,
        notes: row.notes,
        timeSpentOverrideMinutes: row.time_spent_override_minutes,
      });
      const result = await resolveAndAddMedia(db, userId, { ...identity, externalId: identity.externalId.trim(), externalSubId: identity.externalSubId.trim() }, userData);
      if (result.inserted) report.imported += 1; else report.duplicates += 1;
    } catch (error) {
      report.invalid += 1;
      report.errors.push(`row ${index + 2}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  return report;
}
