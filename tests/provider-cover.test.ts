import test from "node:test";
import assert from "node:assert/strict";
import { ProviderCover, normalizeProviderCoverUrl } from "../src/components/provider-cover";

test("provider covers bypass the server image optimizer and right-size stored TMDB posters", () => {
  const element = ProviderCover({ src: "https://image.tmdb.org/t/p/w500/poster.jpg", width: 84, height: 118 });
  assert.equal(element.props.src, "https://image.tmdb.org/t/p/w185/poster.jpg");
  assert.equal(element.props.unoptimized, true);
});

test("stored TMDB poster variants normalize to w185", () => {
  assert.equal(normalizeProviderCoverUrl("https://image.tmdb.org/t/p/original/nested/poster.jpg"), "https://image.tmdb.org/t/p/w185/nested/poster.jpg");
  assert.equal(normalizeProviderCoverUrl("https://image.tmdb.org/t/p/w92/poster.jpg"), "https://image.tmdb.org/t/p/w185/poster.jpg");
});

test("cover normalization leaves other providers and unknown paths untouched", () => {
  const anilist = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/example.jpg";
  const rawg = "https://media.rawg.io/media/games/example.jpg";
  const unknownTmdb = "https://image.tmdb.org/not-a-poster/example.jpg";
  assert.equal(normalizeProviderCoverUrl(anilist), anilist);
  assert.equal(normalizeProviderCoverUrl(rawg), rawg);
  assert.equal(normalizeProviderCoverUrl(unknownTmdb), unknownTmdb);
});
