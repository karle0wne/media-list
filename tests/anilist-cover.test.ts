import test from "node:test";
import assert from "node:assert/strict";
import { searchAniList } from "../src/lib/providers/anilist";

test("AniList requests and stores the medium cover variant", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let requestBody = "";
    globalThis.fetch = async (_input, init) => {
      requestBody = String(init?.body ?? "");
      return Response.json({ data: { Page: { media: [{
        id: 1,
        title: { romaji: "Example", english: "Example", native: "例" },
        episodes: 12,
        duration: 24,
        startDate: { year: 2026 },
        coverImage: { medium: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/example.jpg" },
      }] } } });
    };

    const results = await searchAniList("example", 1);
    assert.match(requestBody, /coverImage \{ medium \}/);
    assert.equal(results[0].coverUrl, "https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/example.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
