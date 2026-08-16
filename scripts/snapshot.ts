import "dotenv/config";
import { resolve } from "node:path";
import { runCli } from "../src/lib/cli";
import { snapshotDatabase } from "../src/lib/sqlite-file";

runCli(async () => {
  const target = resolve(process.argv[2] || "./data/pre-deploy.db");
  console.log(await snapshotDatabase(target));
});
