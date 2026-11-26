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

test("only a real network failure is retried later; other TypeErrors stay visible", async () => {
  const { isTemporaryProviderFailure } = await import("../src/lib/providers/http");
  await withProviders(
    () => Promise.reject(new TypeError("fetch failed")),
    async () => {
      await assert.rejects(getAniListById("1"), (error) => isTemporaryProviderFailure(error));
    },
  );
  await withProviders(
    () => Promise.reject(new TypeError("Invalid URL")),
    async () => {
      await assert.rejects(
        getAniListById("1"),
        (error) => error instanceof TypeError && !isTemporaryProviderFailure(error),
      );
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

test("an Open Library work that was merged is followed and keeps the requested identity", async () => {
  const { getOpenLibraryWork } = await import("../src/lib/providers/openlibrary");
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push(url);
    if (url.endsWith("/works/OL1W.json"))
      return Response.json({ type: { key: "/type/redirect" }, location: "/works/OL2W" });
    if (url.endsWith("/works/OL2W.json")) return Response.json({ title: "Dune", covers: [7] });
    if (url.includes("/search.json"))
      return Response.json({ docs: [{ number_of_pages_median: 412 }] });
    return new Response("", { status: 404 });
  }) as typeof fetch;
  try {
    const book = await getOpenLibraryWork("OL1W");
    assert.equal(book?.title, "Dune");
    assert.equal(book?.externalId, "OL1W");
    assert.equal(book?.pageCount, 412);
    assert.ok(seen.some((url) => url.includes("key%3AOL2W")));

    globalThis.fetch = (async () => Response.json({ key: "/works/OL3W" })) as typeof fetch;
    await assert.rejects(getOpenLibraryWork("OL3W"), /has no title/);
    globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch;
    assert.equal(await getOpenLibraryWork("OL4W"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Open Library follows a short redirect chain, stops at loops, and treats a deleted work as missing", async () => {
  const { getOpenLibraryWork } = await import("../src/lib/providers/openlibrary");
  const originalFetch = globalThis.fetch;
  const redirect = (to: string) =>
    Response.json({ type: { key: "/type/redirect" }, location: `/works/${to}` });
  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/works/OL1W.json")) return redirect("OL2W");
      if (url.endsWith("/works/OL2W.json")) return redirect("OL3W");
      if (url.endsWith("/works/OL3W.json")) return Response.json({ title: "Dune" });
      return Response.json({ docs: [] });
    }) as typeof fetch;
    assert.equal((await getOpenLibraryWork("OL1W"))?.title, "Dune");

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      return url.endsWith("/works/OL5W.json") ? redirect("OL6W") : redirect("OL5W");
    }) as typeof fetch;
    await assert.rejects(getOpenLibraryWork("OL5W"), /redirects too many times/);

    globalThis.fetch = (async () =>
      Response.json({ type: { key: "/type/delete" } })) as typeof fetch;
    assert.equal(await getOpenLibraryWork("OL7W"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
