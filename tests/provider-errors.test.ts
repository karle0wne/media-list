import test from "node:test";
import assert from "node:assert/strict";
import { getAniListById, getAniListByMalId } from "../src/lib/providers/anilist";
import { getRawgGame } from "../src/lib/providers/rawg";
import { getTmdbMovie, getTmdbSeason, getTmdbShowSeasons } from "../src/lib/providers/tmdb";

async function withProviders(
  respond: () => Response | Promise<Response>,
  run: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const originalTmdb = process.env.TMDB_API_TOKEN;
  const originalRawg = process.env.RAWG_API_KEY;
  process.env.TMDB_API_TOKEN = "test-token";
  process.env.RAWG_API_KEY = "test-key";
  globalThis.fetch = (async () => respond()) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTmdb === undefined) delete process.env.TMDB_API_TOKEN;
    else process.env.TMDB_API_TOKEN = originalTmdb;
    if (originalRawg === undefined) delete process.env.RAWG_API_KEY;
    else process.env.RAWG_API_KEY = originalRawg;
  }
}

const lookups: Array<[string, () => Promise<unknown>, unknown]> = [
  ["TMDB movie", () => getTmdbMovie("603"), null],
  ["TMDB season", () => getTmdbSeason("1396", "season:1"), null],
  ["TMDB show seasons", () => getTmdbShowSeasons("1396"), []],
  ["AniList id", () => getAniListById("1"), null],
  ["AniList MAL id", () => getAniListByMalId("1"), null],
  ["RAWG game", () => getRawgGame("3498"), null],
];

test("a 404 from a provider means the item does not exist", async () => {
  await withProviders(
    () => new Response("{}", { status: 404 }),
    async () => {
      for (const [name, lookup, expected] of lookups)
        assert.deepEqual(await lookup(), expected, name);
    },
  );
});

test("rate limits and outages are never reported as a missing item", async () => {
  await withProviders(
    () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
    async () => {
      for (const [name, lookup] of lookups)
        await assert.rejects(lookup, /rate limit reached; retry in about 30s/, name);
    },
  );
  await withProviders(
    () => new Response("{}", { status: 503 }),
    async () => {
      for (const [name, lookup] of lookups)
        await assert.rejects(lookup, /temporarily unavailable \(503\)/, name);
    },
  );
});

test("network failures are never reported as a missing item", async () => {
  await withProviders(
    () => Promise.reject(new TypeError("fetch failed")),
    async () => {
      for (const [name, lookup] of lookups) await assert.rejects(lookup, /fetch failed/, name);
    },
  );
});

test("an unconfigured TMDB is an error to show, not a verdict that the item is missing", async () => {
  const original = process.env.TMDB_API_TOKEN;
  delete process.env.TMDB_API_TOKEN;
  try {
    await assert.rejects(getTmdbMovie("603"), /TMDB_API_TOKEN is not configured/);
    await assert.rejects(getTmdbSeason("1399", "season:1"), /TMDB_API_TOKEN is not configured/);
  } finally {
    if (original !== undefined) process.env.TMDB_API_TOKEN = original;
  }
});
