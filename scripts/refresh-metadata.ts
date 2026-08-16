import "dotenv/config";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { openDatabase } from "../src/db/index";
import { media } from "../src/db/schema";
import { resolveExact } from "../src/lib/providers";

export async function refreshTmdbMetadata(now = new Date()) {
  if (!process.env.TMDB_API_TOKEN?.trim()) return { refreshed: 0, failed: 0, skipped: true };
  const staleDays = Math.max(1, Number(process.env.TMDB_METADATA_TTL_DAYS || 30));
  const limit = Math.max(1, Math.min(500, Number(process.env.TMDB_REFRESH_LIMIT || 50)));
  const cutoff = new Date(now.getTime() - staleDays * 86_400_000);
  const { db, sqlite } = openDatabase();
  try {
    const stale = await db.select().from(media).where(and(
      eq(media.externalSource, "TMDB"),
      or(isNull(media.metadataRefreshedAt), lt(media.metadataRefreshedAt, cutoff)),
    )).limit(limit);
    let refreshed = 0;
    let failed = 0;
    for (const item of stale) {
      try {
        const candidate = await resolveExact("TMDB", item.externalId, item.externalSubId, item.type);
        if (!candidate) {
          failed += 1;
          continue;
        }
        await db.update(media).set({
          title: candidate.title,
          originalTitle: candidate.originalTitle ?? null,
          countryCode: candidate.countryCode ?? null,
          year: candidate.year ?? null,
          runtimeMinutes: candidate.runtimeMinutes ?? null,
          episodeCount: candidate.episodeCount ?? null,
          pageCount: candidate.pageCount ?? null,
          coverUrl: candidate.coverUrl ?? null,
          metadataJson: JSON.stringify({ description: candidate.description ?? null }),
          metadataRefreshedAt: now,
        }).where(eq(media.id, item.id));
        refreshed += 1;
      } catch (error) {
        failed += 1;
        console.error(`TMDB refresh failed for ${item.id}:`, error);
      }
    }
    return { refreshed, failed, skipped: false };
  } finally {
    sqlite.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await refreshTmdbMetadata();
  console.log(`TMDB metadata refresh complete: ${JSON.stringify(result)}`);
}
