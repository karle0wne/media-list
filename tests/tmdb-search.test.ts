import test from "node:test";
import assert from "node:assert/strict";
import { getTmdbShowSeasons, searchTmdbMovies, searchTmdbShows } from "../src/lib/providers/tmdb";

test("manual TMDB search stays category-scoped and expands only the chosen show", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TMDB_API_TOKEN;
  process.env.TMDB_API_TOKEN = "test-token";
  try {
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/search/movie")) return Response.json({ results: [{ id: 10, title: "Movie", original_title: "Movie", release_date: "2026-01-01", poster_path: "/movie.jpg" }] });
      if (url.includes("/search/tv")) return Response.json({ results: [{ id: 20, name: "Series", original_name: "Series", first_air_date: "2025-01-01", poster_path: "/show.jpg" }] });
      if (url.includes("/tv/20")) return Response.json({ id: 20, name: "Series", original_name: "Series", first_air_date: "2025-01-01", poster_path: "/show.jpg", seasons: [{ season_number: 0, name: "Specials", episode_count: 2 }, { season_number: 1, name: "Season 1", episode_count: 8, air_date: "2025-01-01", poster_path: "/season.jpg" }] });
      return new Response("unexpected", { status: 500 });
    };

    const movies = await searchTmdbMovies("title");
    assert.equal(movies.length, 1);
    assert.equal(movies[0].coverUrl, "https://image.tmdb.org/t/p/w185/movie.jpg");
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/search\/movie/);

    calls.length = 0;
    const shows = await searchTmdbShows("title");
    assert.equal(shows.length, 1);
    assert.equal(shows[0].externalId, "20");
    assert.equal(shows[0].coverUrl, "https://image.tmdb.org/t/p/w185/show.jpg");
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/search\/tv/);

    calls.length = 0;
    const seasons = await getTmdbShowSeasons(shows[0].externalId);
    assert.equal(seasons.length, 1);
    assert.equal(seasons[0].externalSubId, "season:1");
    assert.equal(seasons[0].coverUrl, "https://image.tmdb.org/t/p/w185/season.jpg");
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/tv\/20/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TMDB_API_TOKEN;
    else process.env.TMDB_API_TOKEN = originalToken;
  }
});
