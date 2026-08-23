import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  databasePathSetting,
  loadRuntimeConfig,
  tmdbMetadataTtlDaysSetting,
  tmdbRefreshLimitSetting,
} from "../src/config/runtime";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test("runtime config is optional and application values have environment overrides", () => {
  const dir = mkdtempSync(join(tmpdir(), "media-list-config-"));
  const file = join(dir, "application.json");
  writeFileSync(file, JSON.stringify({
    databasePath: "/data/from-config.db",
    tmdb: { metadataTtlDays: 14, refreshLimit: 25 },
  }));
  try {
    const config = loadRuntimeConfig(file);
    assert.equal(databasePathSetting(config), "/data/from-config.db");
    assert.equal(tmdbMetadataTtlDaysSetting(config), 14);
    assert.equal(tmdbRefreshLimitSetting(config), 25);

    withEnv("DATABASE_PATH", "/data/from-env.db", () => {
      assert.equal(databasePathSetting(config), "/data/from-env.db");
    });
    withEnv("TMDB_REFRESH_LIMIT", "40", () => {
      assert.equal(tmdbRefreshLimitSetting(config), 40);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("missing runtime config falls back without failing startup", () => {
  assert.deepEqual(loadRuntimeConfig("/definitely/missing/media-list-config.json"), {});
});

test("unknown or invalid application config fails closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "media-list-config-"));
  try {
    const unknown = join(dir, "unknown.json");
    writeFileSync(unknown, JSON.stringify({ databsePath: "/data/typo.db" }));
    assert.throws(() => loadRuntimeConfig(unknown), /unsupported fields: databsePath/);

    const invalid = join(dir, "invalid.json");
    writeFileSync(invalid, JSON.stringify({ tmdb: { refreshLimit: 501 } }));
    assert.throws(() => loadRuntimeConfig(invalid), /positive integer <= 500/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
