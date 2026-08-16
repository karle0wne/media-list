import "dotenv/config";
import { runCli } from "../src/lib/cli";
import { cleanup } from "../src/lib/operations/cleanup";
import { refreshTmdbMetadata } from "../src/lib/operations/refresh-metadata";

runCli(async () => {
  const cleanupResult = await cleanup();
  const metadataResult = await refreshTmdbMetadata();
  console.log(`Maintenance complete: ${JSON.stringify({ cleanup: cleanupResult, metadata: metadataResult })}`);
});
