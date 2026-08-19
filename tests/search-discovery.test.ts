import test from "node:test";
import assert from "node:assert/strict";
import { searchMediaByType } from "../src/lib/providers";

test("sparse Cyrillic anime discovery merges direct and English-alias candidates", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === "https://graphql.anilist.co") {
        const body = JSON.parse(String(init?.body)) as { variables: { search: string } };
        const media = body.variables.search === "бензо"
          ? [{ id: 1, title: { english: "Direct match", romaji: "Direct match", native: "直" }, startDate: { year: 2020 }, coverImage: { medium: null } }]
          : [{ id: 2, title: { english: "Alias match", romaji: "Alias match", native: "別" }, startDate: { year: 2021 }, coverImage: { medium: null } }];
        return Response.json({ data: { Page: { media } } });
      }
      if (url.includes("wikidata.org") && url.includes("wbsearchentities")) return Response.json({ search: [{ id: "Q1" }] });
      if (url.includes("wikidata.org") && url.includes("wbgetentities")) return Response.json({ entities: { Q1: { labels: { en: { value: "Chainsaw Man" } } } } });
      return new Response("unexpected", { status: 500 });
    };
    const results = await searchMediaByType("ANIME", "бензо");
    assert.deepEqual(results.map((item) => item.externalId), ["1", "2"]);
  } finally { globalThis.fetch = originalFetch; }
});
