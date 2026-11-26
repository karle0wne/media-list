import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function runMigrate(path: string) {
  const result = spawnSync(npx, ["tsx", "scripts/migrate.ts"], {
    env: { ...process.env, DATABASE_PATH: path },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}
function names(db: DatabaseSync, table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (column) => column.name,
  );
}
function tables(db: DatabaseSync) {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY name",
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}
function indexNames(db: DatabaseSync) {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{ name: string }>
  ).map((row) => row.name);
}

test("a new installation gets the whole schema from one baseline migration", () => {
  assert.equal(
    readdirSync("drizzle", { withFileTypes: true }).filter((entry) => entry.isDirectory()).length,
    1,
    "history is a single baseline until the first real deployment exists",
  );
  const dir = mkdtempSync(join(tmpdir(), "media-list-migrate-"));
  const path = join(dir, "db.sqlite");
  try {
    runMigrate(path);
    runMigrate(path); // applying again is a no-op, which is what every container start does
    const db = new DatabaseSync(path);
    try {
      assert.deepEqual(tables(db), [
        "import_batches",
        "import_rows",
        "media",
        "service_state",
        "user_media",
        "users",
      ]);
      const userColumns = names(db, "users");
      for (const name of ["id", "username", "email", "external_subject", "created_at"])
        assert.ok(userColumns.includes(name), name);
      for (const name of ["password_hash", "role", "active"])
        assert.equal(userColumns.includes(name), false, `${name} is gateway territory`);
      for (const name of [
        "metadata_refreshed_at",
        "metadata_status",
        "metadata_error",
        "romanized_title",
        "external_url",
      ])
        assert.ok(names(db, "media").includes(name), name);
      assert.ok(names(db, "user_media").includes("updated_at"));
      for (const index of [
        "users_email_uq",
        "users_external_subject_uq",
        "media_external_identity_uq",
        "media_metadata_status_idx",
        "user_media_user_media_uq",
      ])
        assert.ok(indexNames(db).includes(index), index);
      const applied = db.prepare("SELECT COUNT(*) AS n FROM __drizzle_migrations").get() as {
        n: number;
      };
      assert.equal(applied.n, 1);
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the migration history matches schema.ts, so nothing is left to generate", () => {
  const dir = mkdtempSync(join(tmpdir(), "media-list-drift-"));
  try {
    cpSync("drizzle", join(dir, "drizzle"), { recursive: true });
    writeFileSync(
      join(dir, "drizzle.config.ts"),
      `export default {
  schema: ${JSON.stringify(resolve("src/db/schema.ts"))},
  out: ${JSON.stringify(join(dir, "drizzle"))},
  dialect: "sqlite",
};
`,
    );
    const result = spawnSync(
      npx,
      ["drizzle-kit", "generate", "--config", join(dir, "drizzle.config.ts")],
      {
        encoding: "utf8",
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, output);
    assert.match(output, /No schema changes/, "run `npm run db:generate` and commit the result");
    assert.equal(readdirSync(join(dir, "drizzle")).length, 1, "no new migration was written");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
