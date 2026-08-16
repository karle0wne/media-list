import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle, type NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import * as schema from "./schema";
import { runMigrations } from "./migrations";

export type AppDb = NodeSQLiteDatabase<typeof schema>;
type DbBundle = { sqlite: DatabaseSync; db: AppDb };

declare global {
  // eslint-disable-next-line no-var
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
  runMigrations(sqlite);
  return { sqlite, db: drizzle({ client: sqlite, schema }) };
}

export function getDatabase(): DbBundle {
  if (!globalThis.__mediaListDb) globalThis.__mediaListDb = openDatabase();
  return globalThis.__mediaListDb;
}
