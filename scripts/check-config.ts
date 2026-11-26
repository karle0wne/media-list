import "dotenv/config";
import { assertServerConfig } from "../src/lib/server-config";

// Run before the server starts (container entrypoint, `npm start`): a bad installation stops
// here with one readable message instead of serving errors.
try {
  assertServerConfig();
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
