import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const migrationDirs = readdirSync("drizzle", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

function runMigrate(path: string) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["tsx", "scripts/migrate.ts"], { env: { ...process.env, DATABASE_PATH: path }, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function assertOperationalSchema(path: string) {
  const db = new DatabaseSync(path);
  try {
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='service_state'").get());
    const columns = db.prepare("PRAGMA table_info(media)").all() as Array<{ name: string }>;
    assert.ok(columns.some((column) => column.name === "metadata_refreshed_at"));
    assert.ok(columns.some((column) => column.name === "metadata_status"));
    assert.ok(columns.some((column) => column.name === "metadata_error"));
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='media_metadata_status_idx'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'").get());
  } finally {
    db.close();
  }
}

test("empty database is created from the Drizzle migration chain", () => {
  const dir = mkdtempSync(join(tmpdir(), "media-list-migrate-"));
  const path = join(dir, "db.sqlite");
  try {
    runMigrate(path);
    assertOperationalSchema(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("legacy 0000 database is baselined before later Drizzle migrations", () => {
  const dir = mkdtempSync(join(tmpdir(), "media-list-legacy-"));
  const path = join(dir, "db.sqlite");
  const db = new DatabaseSync(path);
  try {
    db.exec(readFileSync(join("drizzle", migrationDirs[0], "migration.sql"), "utf8"));
    db.exec("CREATE TABLE app_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)");
    db.prepare("INSERT INTO app_migrations(id, applied_at) VALUES (?, ?)").run("0000_init", Date.now());
  } finally {
    db.close();
  }
  try {
    runMigrate(path);
    assertOperationalSchema(path);
    const migrated = new DatabaseSync(path);
    try {
      const history = migrated.prepare("SELECT created_at FROM __drizzle_migrations ORDER BY created_at").all() as Array<{ created_at: number }>;
      assert.ok(history.length >= 3);
      assert.equal(Number(history[0].created_at), 1786890906000);
    } finally {
      migrated.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
