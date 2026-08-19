import "dotenv/config";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { databasePath } from "../src/db/index";

const dbPath = databasePath();
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
const sqlite = new DatabaseSync(dbPath);
try {
  const hasTable = (name: string) => Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  if (hasTable("app_migrations") && hasTable("users") && !hasTable("__drizzle_migrations")) {
    const legacyInitial = sqlite.prepare("SELECT 1 FROM app_migrations WHERE id='0000_init'").get();
    if (!legacyInitial) throw new Error("Legacy database detected without 0000_init marker; refusing automatic baseline");
    sqlite.exec("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)");
    sqlite.prepare("INSERT INTO __drizzle_migrations(hash, created_at) VALUES (?, ?)").run("legacy-0000-baseline", 1786890906000);
    console.log("Bridged legacy 0000_init into Drizzle migration history.");
  }
} finally {
  sqlite.close();
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["drizzle-kit", "migrate"], { stdio: "inherit", env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

removeLegacyTimeColumns(dbPath);
console.log("Database migrations applied.");

function removeLegacyTimeColumns(path: string) {
  const db = new DatabaseSync(path);
  try {
    dropColumnIfPresent(db, "media", "runtime_minutes");
    dropColumnIfPresent(db, "user_media", "time_spent_override_minutes");
  } finally {
    db.close();
  }
}

function dropColumnIfPresent(db: DatabaseSync, table: string, column: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  console.log(`Removed legacy ${table}.${column}.`);
}
