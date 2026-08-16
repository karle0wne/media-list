import "dotenv/config";
import { cleanup } from "./cleanup";
import { refreshTmdbMetadata } from "./refresh-metadata";

const cleanupResult = await cleanup();
const metadataResult = await refreshTmdbMetadata();
console.log(`Maintenance complete: ${JSON.stringify({ cleanup: cleanupResult, metadata: metadataResult })}`);
