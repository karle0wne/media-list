import "dotenv/config";
import { runCli } from "../src/lib/cli";
import { refreshTmdbMetadata } from "../src/lib/operations/refresh-metadata";

runCli(async () => {
  const result = await refreshTmdbMetadata();
  console.log(`TMDB metadata refresh complete: ${JSON.stringify(result)}`);
});
