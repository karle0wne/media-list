import test from "node:test";
import assert from "node:assert/strict";
import { getRawgGame, rawgConfigured, searchRawgGames } from "../src/lib/providers/rawg";
import { resolveExternalUrl } from "../src/lib/providers";

test("RAWG discovery is fuzzy and exact lookups normalize slugs to numeric identity", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RAWG_API_KEY;
  process.env.RAWG_API_KEY = "test-key";
  try {
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input); calls.push(url);
      if (url.includes("/games?")) return Response.json({ results: [{ id: 3498, name: "Postal 2", released: "2003-04-14", background_image: "https://media.rawg.io/media/games/456/example.jpg" }] });
      if (url.includes("/games/postal-2")) return Response.json({ id: 3498, slug: "postal-2", name: "Postal 2", released: "2003-04-14", background_image: "https://media.rawg.io/media/games/456/example.jpg", description_raw: "Game details" });
      if (url.includes("/games/3498")) return Response.json({ id: 3498, slug: "postal-2", name: "Postal 2", released: "2003-04-14" });
      return new Response("unexpected", { status: 500 });
    };

    assert.equal(rawgConfigured(), true);
    const results = await searchRawgGames("post", 5);
    assert.equal(results[0].externalId, "3498");
    assert.match(calls[0], /search=post/);
    assert.doesNotMatch(calls[0], /search_precise/);

    const exact = await getRawgGame("postal-2");
    assert.equal(exact?.externalId, "3498");
    assert.equal(exact?.description, "Game details");

    const fromUrl = await resolveExternalUrl("https://rawg.io/games/postal-2");
    assert.equal(fromUrl[0]?.externalId, "3498");
    assert.equal(fromUrl[0]?.source, "RAWG");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RAWG_API_KEY; else process.env.RAWG_API_KEY = originalKey;
  }
});

test("RAWG configuration is optional", () => {
  const originalKey = process.env.RAWG_API_KEY;
  try { delete process.env.RAWG_API_KEY; assert.equal(rawgConfigured(), false); }
  finally { if (originalKey === undefined) delete process.env.RAWG_API_KEY; else process.env.RAWG_API_KEY = originalKey; }
});
