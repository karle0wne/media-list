import "dotenv/config";
import { resolve } from "node:path";
import { databasePath } from "../src/db/index";
import { runCli } from "../src/lib/cli";
import { replaceDatabase } from "../src/lib/sqlite-file";

runCli(async () => {
  const source = resolve(process.argv[2] || "./data/pre-deploy.db");
  const target = await replaceDatabase(source, databasePath());
  console.log(`Restored local snapshot ${source} to ${target}`);
});
