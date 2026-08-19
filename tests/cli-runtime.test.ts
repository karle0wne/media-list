import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const tsx = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");

function run(script: string, args: string[] = [], extraEnv: Record<string, string | undefined> = {}) {
  const env = { ...process.env, ...extraEnv };
  delete env.S3_ENDPOINT;
  delete env.S3_BUCKET;
  delete env.S3_ACCESS_KEY_ID;
  delete env.S3_SECRET_ACCESS_KEY;
  delete env.TMDB_API_TOKEN;
  delete env.RAWG_API_KEY;
  return spawnSync(tsx, [`scripts/${script}.ts`, ...args], { encoding: "utf8", env });
}

function assertNoTransformFailure(result: ReturnType<typeof run>, script: string) {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  assert.doesNotMatch(output, /Top-level await is currently not supported|TransformError/, `${script} failed before its runtime logic`);
}

test("operational CLI entrypoints execute through the tsx binary used in production", () => {
  const dir = mkdtempSync(join(tmpdir(), "media-list-cli-"));
  try {
    const database = join(dir, "media-list.db");
    const db = new DatabaseSync(database);
    db.exec("CREATE TABLE marker (id INTEGER PRIMARY KEY)");
    db.close();
    const snapshot = join(dir, "snapshot.db");

    const snapshotResult = run("snapshot", [snapshot], { DATABASE_PATH: database });
    assertNoTransformFailure(snapshotResult, "snapshot");
    assert.equal(snapshotResult.status, 0, snapshotResult.stderr);

    const providerSmokeResult = run("provider-smoke", ["--check-runtime"]);
    assertNoTransformFailure(providerSmokeResult, "provider-smoke");
    assert.equal(providerSmokeResult.status, 0, providerSmokeResult.stderr);

    const cases: Array<[string, string[]]> = [
      ["backup", []],
      ["restore", []],
      ["restore-local", [join(dir, "missing.db")]],
      ["create-admin", []],
      ["set-password", []],
      ["cleanup", []],
      ["maintenance", []],
      ["refresh-metadata", []],
    ];
    for (const [script, args] of cases) assertNoTransformFailure(run(script, args, { DATABASE_PATH: database }), script);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
