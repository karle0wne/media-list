import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { assertHealthySqlite, replaceDatabase, snapshotDatabase } from "../src/lib/sqlite-file";

test("sqlite snapshot is healthy and restore atomically replaces the target", async () => {
  const dir = await mkdtemp(join(tmpdir(), "media-list-sqlite-"));
  const source = join(dir, "source.db");
  const snapshot = join(dir, "snapshot.db");
  const target = join(dir, "target.db");
  try {
    const sourceDb = new DatabaseSync(source);
    sourceDb.exec("CREATE TABLE sample (value TEXT NOT NULL); INSERT INTO sample(value) VALUES ('new-state')");
    sourceDb.close();
    const targetDb = new DatabaseSync(target);
    targetDb.exec("CREATE TABLE sample (value TEXT NOT NULL); INSERT INTO sample(value) VALUES ('old-state')");
    targetDb.close();

    await snapshotDatabase(snapshot, source);
    assert.doesNotThrow(() => assertHealthySqlite(snapshot));
    await replaceDatabase(snapshot, target);

    const restored = new DatabaseSync(target);
    try {
      assert.equal((restored.prepare("SELECT value FROM sample").get() as { value: string }).value, "new-state");
    } finally {
      restored.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("sqlite restore rejects a corrupt source without replacing the target", async () => {
  const dir = await mkdtemp(join(tmpdir(), "media-list-sqlite-corrupt-"));
  const source = join(dir, "corrupt.db");
  const target = join(dir, "target.db");
  try {
    await writeFile(source, "not-a-sqlite-database");
    const targetDb = new DatabaseSync(target);
    targetDb.exec("CREATE TABLE sample (value TEXT NOT NULL); INSERT INTO sample(value) VALUES ('keep-me')");
    targetDb.close();
    const before = await readFile(target);

    await assert.rejects(() => replaceDatabase(source, target));
    assert.deepEqual(await readFile(target), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
