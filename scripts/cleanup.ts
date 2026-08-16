import "dotenv/config";
import { runCli } from "../src/lib/cli";
import { cleanup } from "../src/lib/operations/cleanup";

runCli(async () => {
  const result = await cleanup();
  console.log(`Cleanup complete: ${JSON.stringify(result)}`);
});
