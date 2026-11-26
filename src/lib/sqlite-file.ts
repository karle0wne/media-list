import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { databasePath, openDatabase } from "../db";

export async function snapshotDatabase(targetPath: string, sourcePath = databasePath()) {
  const source = resolve(sourcePath);
  const target = resolve(targetPath);
  if (source === target) throw new Error("Snapshot target must differ from database path");
  if (sourcePath !== ":memory:" && !existsSync(source))
    throw new Error(`SQLite source does not exist: ${source}`);
  await mkdir(dirname(target), { recursive: true });
  await rm(target, { force: true });
  const { sqlite } = openDatabase(sourcePath);
  try {
    sqlite.prepare("VACUUM INTO ?").run(target);
  } finally {
    sqlite.close();
  }
  assertHealthySqlite(target);
  return target;
}

/**
 * Replaces the database with a validated copy of `sourcePath`. The database it replaces is not
 * thrown away: it is kept next to the target as `<target>.before-restore-<stamp>` (a consistent
 * snapshot, or the raw files when it is too damaged to read), so a restore of the wrong backup
 * can be undone. Returns where the new database lives and where the old one went.
 */
export async function replaceDatabase(sourcePath: string, targetPath = databasePath()) {
  const source = resolve(sourcePath);
  const target = resolve(targetPath);
  if (source === target) throw new Error("Restore source must differ from database path");
  assertHealthySqlite(source);
  await mkdir(dirname(target), { recursive: true });
  const staged = `${target}.replace-${randomUUID()}`;
  try {
    await copyFile(source, staged);
    assertHealthySqlite(staged);
    const previous = await keepPrevious(target);
    await rm(`${target}-wal`, { force: true });
    await rm(`${target}-shm`, { force: true });
    await rename(staged, target);
    return { target, previous };
  } finally {
    await rm(staged, { force: true });
  }
}

async function keepPrevious(target: string) {
  if (!existsSync(target)) return null;
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  const previous = `${target}.before-restore-${stamp}`;
  try {
    await snapshotDatabase(previous, target);
  } catch {
    // Too damaged to read: keep the raw files, which is what a repair would start from.
    await copyFile(target, previous);
    for (const suffix of ["-wal", "-shm"])
      if (existsSync(`${target}${suffix}`))
        await copyFile(`${target}${suffix}`, `${previous}${suffix}`);
  }
  return previous;
}

const REQUIRED_TABLES = ["users", "media", "user_media"];

/** A valid SQLite file that is not a media-list database (empty, foreign) must not replace one. */
export function assertMediaListDatabase(path: string) {
  const sqlite = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[];
    const present = new Set(rows.map((row) => row.name));
    const missing = REQUIRED_TABLES.filter((name) => !present.has(name));
    if (missing.length)
      throw new Error(
        `${path} is not a media-list database (missing tables: ${missing.join(", ")})`,
      );
  } finally {
    sqlite.close();
  }
}

export function assertHealthySqlite(path: string) {
  if (!existsSync(path)) throw new Error(`SQLite file does not exist: ${path}`);
  const sqlite = new DatabaseSync(path);
  try {
    const row = sqlite.prepare("PRAGMA quick_check").get() as Record<string, unknown> | undefined;
    const result = row ? Object.values(row)[0] : null;
    if (result !== "ok")
      throw new Error(`SQLite quick_check failed for ${path}: ${String(result ?? "no result")}`);
  } finally {
    sqlite.close();
  }
}
