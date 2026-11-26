import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  assertHealthySqlite,
  assertMediaListDatabase,
  replaceDatabase,
  snapshotDatabase,
} from "../src/lib/sqlite-file";

test("sqlite snapshot is healthy and restore atomically replaces the target", async () => {
  const dir = await mkdtemp(join(tmpdir(), "media-list-sqlite-"));
  const source = join(dir, "source.db");
  const snapshot = join(dir, "snapshot.db");
  const target = join(dir, "target.db");
  try {
    const sourceDb = new DatabaseSync(source);
    sourceDb.exec(
      "CREATE TABLE sample (value TEXT NOT NULL); INSERT INTO sample(value) VALUES ('new-state')",
    );
    sourceDb.close();
    const targetDb = new DatabaseSync(target);
    targetDb.exec(
      "CREATE TABLE sample (value TEXT NOT NULL); INSERT INTO sample(value) VALUES ('old-state')",
    );
    targetDb.close();

    await snapshotDatabase(snapshot, source);
    assert.doesNotThrow(() => assertHealthySqlite(snapshot));
    await replaceDatabase(snapshot, target);

    const restored = new DatabaseSync(target);
    try {
      assert.equal(
        (restored.prepare("SELECT value FROM sample").get() as { value: string }).value,
        "new-state",
      );
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
    targetDb.exec(
      "CREATE TABLE sample (value TEXT NOT NULL); INSERT INTO sample(value) VALUES ('keep-me')",
    );
    targetDb.close();
    const before = await readFile(target);

    await assert.rejects(() => replaceDatabase(source, target));
    assert.deepEqual(await readFile(target), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("sqlite restore rejects a missing source without creating it or replacing the target", async () => {
  const dir = await mkdtemp(join(tmpdir(), "media-list-sqlite-missing-"));
  const source = join(dir, "missing.db");
  const target = join(dir, "target.db");
  try {
    const targetDb = new DatabaseSync(target);
    targetDb.exec(
      "CREATE TABLE sample (value TEXT NOT NULL); INSERT INTO sample(value) VALUES ('keep-me')",
    );
    targetDb.close();
    const before = await readFile(target);

    await assert.rejects(() => replaceDatabase(source, target), /does not exist/);
    await assert.rejects(() => readFile(source));
    assert.deepEqual(await readFile(target), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a restore keeps the database it replaces, and refuses a file that is not a media-list database", async () => {
  const dir = await mkdtemp(join(tmpdir(), "media-list-sqlite-previous-"));
  const source = join(dir, "source.db");
  const empty = join(dir, "empty.db");
  const target = join(dir, "target.db");
  try {
    const sourceDb = new DatabaseSync(source);
    sourceDb.exec(
      "CREATE TABLE users (id TEXT); CREATE TABLE media (id TEXT); CREATE TABLE user_media (id TEXT)",
    );
    sourceDb.close();
    new DatabaseSync(empty).close(); // a valid, empty SQLite file
    const targetDb = new DatabaseSync(target);
    targetDb.exec("CREATE TABLE sample (value TEXT); INSERT INTO sample(value) VALUES ('old')");
    targetDb.close();

    assert.doesNotThrow(() => assertMediaListDatabase(source));
    assert.throws(() => assertMediaListDatabase(empty), /not a media-list database/);

    const { previous } = await replaceDatabase(source, target);
    assert.match(previous ?? "", /target\.db\.before-restore-/);
    const kept = new DatabaseSync(previous!);
    try {
      assert.equal(
        (kept.prepare("SELECT value FROM sample").get() as { value: string }).value,
        "old",
      );
    } finally {
      kept.close();
    }
    assert.equal((await replaceDatabase(source, join(dir, "fresh.db"))).previous, null);

    // A target too damaged to read is kept as raw bytes instead of blocking the restore.
    await writeFile(target, "this is not sqlite");
    const damaged = await replaceDatabase(source, target);
    assert.equal(await readFile(damaged.previous!, "utf8"), "this is not sqlite");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
