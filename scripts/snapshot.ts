import "dotenv/config";
import { resolve } from "node:path";
import { snapshotDatabase } from "../src/lib/sqlite-file";

const target = resolve(process.argv[2] || "./data/pre-deploy.db");
console.log(await snapshotDatabase(target));
