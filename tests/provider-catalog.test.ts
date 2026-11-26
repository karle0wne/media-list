import test from "node:test";
import assert from "node:assert/strict";
import { assertWellFormedIdentity } from "../src/lib/domain/identity";
import { SOURCES, externalMediaUrl } from "../src/lib/providers/catalog";
import { resolveExact, resolveExternalUrl } from "../src/lib/providers";
import { EXTERNAL_SOURCES, type MediaIdentity } from "../src/lib/types";

test("every provider source is described in the catalog", () => {
  assert.deepEqual(Object.keys(SOURCES).sort(), [...EXTERNAL_SOURCES].sort());
});

test("saved identities are checked by the provider's own rules", () => {
  const valid: MediaIdentity[] = [
    { source: "ANILIST", externalId: "1", externalSubId: "", type: "ANIME" },
    { source: "OPENLIBRARY", externalId: "OL1W", externalSubId: "", type: "BOOK" },
    { source: "RAWG", externalId: "3498", externalSubId: "", type: "GAME" },
    { source: "TMDB", externalId: "603", externalSubId: "", type: "MOVIE" },
    { source: "TMDB", externalId: "1396", externalSubId: "season:2", type: "SERIES" },
  ];
  for (const identity of valid) assert.doesNotThrow(() => assertWellFormedIdentity(identity));

  const invalid: Array<[MediaIdentity, RegExp]> = [
    [{ ...valid[0], type: "MOVIE" }, /ANILIST 1: type must be ANIME/],
    [{ ...valid[0], externalId: "one" }, /external_id must be numeric/],
    [{ ...valid[0], externalSubId: "x" }, /ANILIST 1\/x: external_sub_id must be empty/],
    [{ ...valid[1], externalId: "OL1M" }, /must look like OL123W/],
    [{ ...valid[2], type: "BOOK" }, /type must be GAME/],
    [{ ...valid[3], externalSubId: "season:1" }, /must be empty for movies/],
    [{ ...valid[4], externalSubId: "" }, /must look like season:1/],
    [{ ...valid[3], type: "ANIME" }, /type must be MOVIE or SERIES/],
  ];
  for (const [identity, message] of invalid)
    assert.throws(() => assertWellFormedIdentity(identity), message);
  assert.throws(
    () => assertWellFormedIdentity({ ...valid[0], source: "NOPE" as never }),
    /Unsupported source/,
  );
});

test("each provider knows where its items live", () => {
  assert.equal(externalMediaUrl("ANILIST", "1", ""), "https://anilist.co/anime/1");
  assert.equal(externalMediaUrl("OPENLIBRARY", "OL1W", ""), "https://openlibrary.org/works/OL1W");
  assert.equal(externalMediaUrl("RAWG", "7", ""), "https://rawg.io/games/7");
  assert.equal(externalMediaUrl("TMDB", "603", ""), "https://www.themoviedb.org/movie/603");
  assert.equal(
    externalMediaUrl("TMDB", "1396", "season:2"),
    "https://www.themoviedb.org/tv/1396/season/2",
  );
});

test("links from unknown sites, broken links and odd host names resolve to nothing, without a request", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("no request expected");
  }) as typeof fetch;
  try {
    for (const raw of [
      "https://example.com/anime/1",
      "not a url",
      "https://constructor/",
      "https://anilist.co/",
      "https://anilist.co/manga/5",
      "https://openlibrary.org/authors/OL1A",
      "https://www.themoviedb.org/person/1",
      "https://rawg.io/games/",
    ])
      assert.deepEqual(await resolveExternalUrl(raw), [], raw);
    assert.equal(
      await resolveExact("TMDB", "1396", "", "SERIES"),
      null,
      "a bare show is not a position",
    );
  } finally {
    globalThis.fetch = original;
  }
});
