import "dotenv/config";
import { resolve } from "node:path";
import { databasePath } from "../src/db/index";
import { runCli } from "../src/lib/cli";
import { assertMediaListDatabase, replaceDatabase } from "../src/lib/sqlite-file";

runCli(async () => {
  const source = resolve(process.argv[2] || "./data/pre-deploy.db");
  assertMediaListDatabase(source);
  const { target, previous } = await replaceDatabase(source, databasePath());
  console.log(`Restored local snapshot ${source} to ${target}`);
  if (previous) console.log(`The database it replaced was kept as ${previous}`);
});
