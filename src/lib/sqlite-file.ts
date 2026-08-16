import { randomUUID } from "node:crypto";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { databasePath, openDatabase } from "../db";

export async function snapshotDatabase(targetPath: string, sourcePath = databasePath()) {
  const source = resolve(sourcePath);
  const target = resolve(targetPath);
  if (source === target) throw new Error("Snapshot target must differ from database path");
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
    await rm(`${target}-wal`, { force: true });
    await rm(`${target}-shm`, { force: true });
    await rename(staged, target);
  } finally {
    await rm(staged, { force: true });
  }
  return target;
}

export function assertHealthySqlite(path: string) {
  const sqlite = new DatabaseSync(path);
  try {
    const row = sqlite.prepare("PRAGMA quick_check").get() as Record<string, unknown> | undefined;
    const result = row ? Object.values(row)[0] : null;
    if (result !== "ok") throw new Error(`SQLite quick_check failed for ${path}: ${String(result ?? "no result")}`);
  } finally {
    sqlite.close();
  }
}
