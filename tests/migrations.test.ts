import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const migrationDirs = readdirSync("drizzle", { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();

function runMigrate(path: string) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["tsx", "scripts/migrate.ts"], { env: { ...process.env, DATABASE_PATH: path }, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}
function names(db: DatabaseSync, table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(column => column.name);
}
function hasTable(db: DatabaseSync, table: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}
function assertOperationalSchema(path: string) {
  const db = new DatabaseSync(path);
  try {
    assert.ok(hasTable(db, "service_state"));
    for (const table of ["sessions", "password_reset_tokens", "magic_login_tokens", "invites"])
      assert.equal(hasTable(db, table), false, `${table} must be removed`);
    const userColumns = names(db, "users");
    for (const name of ["id", "username", "email", "external_subject", "created_at"]) assert.ok(userColumns.includes(name), name);
    for (const name of ["password_hash", "role", "active"]) assert.equal(userColumns.includes(name), false, name);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='users_email_uq'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='users_external_subject_uq'").get());
    const mediaColumns = names(db, "media");
    for (const name of ["romanized_title", "external_url", "metadata_refreshed_at", "metadata_status", "metadata_error"]) assert.ok(mediaColumns.includes(name), name);
    for (const name of ["runtime_minutes", "country_code", "episode_count", "page_count", "metadata_json", "created_at"]) assert.equal(mediaColumns.includes(name), false, name);
    const stateColumns = names(db, "user_media");
    assert.ok(stateColumns.includes("updated_at"), "updated_at");
    assert.equal(stateColumns.includes("time_spent_override_minutes"), false, "time_spent_override_minutes");
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='media_metadata_status_idx'").get());
    assert.ok(hasTable(db, "__drizzle_migrations"));
  } finally { db.close(); }
}

test("empty database is created as business/data-owner state only", () => {
  const dir = mkdtempSync(join(tmpdir(), "media-list-migrate-"));
  const path = join(dir, "db.sqlite");
  try { runMigrate(path); assertOperationalSchema(path); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("legacy database is baselined and cleaned without losing user state", () => {
  const dir = mkdtempSync(join(tmpdir(), "media-list-legacy-"));
  const path = join(dir, "db.sqlite");
  const db = new DatabaseSync(path);
  try {
    db.exec(readFileSync(join("drizzle", migrationDirs[0], "migration.sql"), "utf8"));
    db.exec("CREATE TABLE app_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)");
    db.prepare("INSERT INTO app_migrations(id, applied_at) VALUES (?, ?)").run("0000_init", Date.now());
    db.prepare("INSERT INTO users(id, username, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, ?)").run("legacy-user", "legacy_user", "legacy-hash", "ADMIN", 1, Date.now());
  } finally { db.close(); }
  try {
    runMigrate(path);
    assertOperationalSchema(path);
    const migrated = new DatabaseSync(path);
    try {
      const user = migrated.prepare("SELECT id, username FROM users WHERE id=?").get("legacy-user") as { id: string; username: string } | undefined;
      assert.ok(user);
      assert.equal(user.id, "legacy-user");
      assert.equal(user.username, "legacy_user");
      const history = migrated.prepare("SELECT created_at FROM __drizzle_migrations ORDER BY created_at").all() as Array<{ created_at: number }>;
      assert.ok(history.length >= 3);
      assert.equal(Number(history[0].created_at), 1786890906000);
    } finally { migrated.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
