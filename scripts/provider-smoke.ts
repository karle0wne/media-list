import "dotenv/config";
import { searchAniList } from "../src/lib/providers/anilist";
import { searchOpenLibrary } from "../src/lib/providers/openlibrary";
import { searchTmdbMovies } from "../src/lib/providers/tmdb";
import { rawgConfigured, searchRawgGames } from "../src/lib/providers/rawg";

const checks: Array<[string, () => Promise<unknown[]>]> = [
  ["AniList", () => searchAniList("Naruto", 2)],
  ["Open Library", () => searchOpenLibrary("The Hobbit", 2)],
];
if (process.env.TMDB_API_TOKEN?.trim()) checks.push(["TMDB", () => searchTmdbMovies("The Matrix", 2)]);
if (rawgConfigured()) checks.push(["RAWG", () => searchRawgGames("post", 5)]);

let failed = false;
for (const [name, run] of checks) {
  try {
    const results = await run();
    if (!results.length) throw new Error("returned no results");
    console.log(`${name}: ok (${results.length} results)`);
  } catch (error) {
    failed = true;
    console.error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (failed) process.exitCode = 1;
