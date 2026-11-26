import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { databasePath } from "../src/db/index";

// The migration history is a single baseline plus whatever Drizzle generates after it, so
// applying it is all drizzle-kit has to do. The resolved path is exported because drizzle-kit
// reads DATABASE_PATH on its own and must see the same file the application will open.
const dbPath = databasePath();
process.env.DATABASE_PATH = dbPath;
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: process.env,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Database migrations applied.");
