import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";

function makeDb(sqlite: DatabaseSync) {
  return drizzle({ client: sqlite });
}

export type AppDb = ReturnType<typeof makeDb>;
type DbBundle = { sqlite: DatabaseSync; db: AppDb };

declare global {
  var __mediaListDb: DbBundle | undefined;
}

export function databasePath() {
  return process.env.DATABASE_PATH || "./data/media-list.db";
}

export function openDatabase(path = databasePath()): DbBundle {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec("PRAGMA busy_timeout = 5000");
  if (path !== ":memory:") sqlite.exec("PRAGMA journal_mode = WAL");
  return { sqlite, db: makeDb(sqlite) };
}

export function getDatabase(): DbBundle {
  if (!globalThis.__mediaListDb) globalThis.__mediaListDb = openDatabase();
  return globalThis.__mediaListDb;
}
