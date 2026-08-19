import test from "node:test";
import assert from "node:assert/strict";
import { getRawgGame, rawgConfigured, searchRawgGames } from "../src/lib/providers/rawg";

test("RAWG search keeps numeric provider identity and trusted cover metadata", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RAWG_API_KEY;
  process.env.RAWG_API_KEY = "test-key";
  try {
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/games?")) return Response.json({ results: [
        { id: 3498, name: "Grand Theft Auto V", released: "2013-09-17", background_image: "https://media.rawg.io/media/games/456/example.jpg" },
        { id: 9999, name: "Untrusted Cover", released: null, background_image: "https://example.com/cover.jpg" },
      ] });
      if (url.includes("/games/3498")) return Response.json({ id: 3498, name: "Grand Theft Auto V", released: "2013-09-17", background_image: "https://media.rawg.io/media/games/456/example.jpg", description_raw: "Game details" });
      return new Response("unexpected", { status: 500 });
    };

    assert.equal(rawgConfigured(), true);
    const results = await searchRawgGames("gta", 2);
    assert.equal(results.length, 2);
    assert.deepEqual({ key: results[0].key, type: results[0].type, source: results[0].source, externalId: results[0].externalId, externalSubId: results[0].externalSubId, year: results[0].year }, {
      key: "RAWG:3498:", type: "GAME", source: "RAWG", externalId: "3498", externalSubId: "", year: 2013,
    });
    assert.equal(results[0].coverUrl, "https://media.rawg.io/media/games/456/example.jpg");
    assert.equal(results[1].coverUrl, null);
    assert.match(calls[0], /\/games\?/);
    assert.match(calls[0], /search=gta/);
    assert.match(calls[0], /key=test-key/);

    const exact = await getRawgGame("3498");
    assert.equal(exact?.externalId, "3498");
    assert.equal(exact?.description, "Game details");

    const callCount = calls.length;
    assert.equal(await getRawgGame("grand-theft-auto-v"), null);
    assert.equal(calls.length, callCount);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RAWG_API_KEY;
    else process.env.RAWG_API_KEY = originalKey;
  }
});

test("RAWG configuration is optional", () => {
  const originalKey = process.env.RAWG_API_KEY;
  try {
    delete process.env.RAWG_API_KEY;
    assert.equal(rawgConfigured(), false);
  } finally {
    if (originalKey === undefined) delete process.env.RAWG_API_KEY;
    else process.env.RAWG_API_KEY = originalKey;
  }
});
