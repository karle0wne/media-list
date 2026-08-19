import "dotenv/config";
import { searchAniList } from "../src/lib/providers/anilist";
import { searchOpenLibrary } from "../src/lib/providers/openlibrary";
import { searchTmdbMovies } from "../src/lib/providers/tmdb";
import { rawgConfigured, searchRawgGames } from "../src/lib/providers/rawg";

async function main() {
  // CI uses this only to prove that the production tsx/CJS entrypoint can start.
  // Live provider calls remain explicit operator work so routine CI does not spend API quota.
  if (process.argv.includes("--check-runtime")) return;

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
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
