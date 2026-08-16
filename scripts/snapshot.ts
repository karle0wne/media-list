import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { openDatabase } from "../src/db/index";

const target = resolve(process.argv[2] || "./data/pre-deploy.db");
await mkdir(dirname(target), { recursive: true });
const { sqlite } = openDatabase();
try {
  sqlite.prepare("VACUUM INTO ?").run(target);
} finally {
  sqlite.close();
}
console.log(target);
