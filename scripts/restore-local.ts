import "dotenv/config";
import { resolve } from "node:path";
import { databasePath } from "../src/db/index";
import { replaceDatabase } from "../src/lib/sqlite-file";

const source = resolve(process.argv[2] || "./data/pre-deploy.db");
const target = await replaceDatabase(source, databasePath());
console.log(`Restored local snapshot ${source} to ${target}`);
