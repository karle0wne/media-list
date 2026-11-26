import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  backupKeepVersionsSetting,
  databasePathSetting,
  enrichmentRecoveryIntervalSecondsSetting,
  loadRuntimeConfig,
  s3BucketSetting,
  s3EndpointSetting,
  s3PrefixSetting,
  s3RegionSetting,
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
  writeFileSync(
    file,
    JSON.stringify({
      databasePath: "/data/from-config.db",
      tmdb: { metadataTtlDays: 14, refreshLimit: 25 },
      backup: {
        s3: { endpoint: "https://s3.example", region: "auto", bucket: "media", prefix: "backup/" },
      },
    }),
  );
  try {
    const config = loadRuntimeConfig(file);
    assert.equal(databasePathSetting(config), "/data/from-config.db");
    assert.equal(tmdbMetadataTtlDaysSetting(config), 14);
    assert.equal(tmdbRefreshLimitSetting(config), 25);
    assert.equal(s3EndpointSetting(config), "https://s3.example");
    assert.equal(s3RegionSetting(config), "auto");
    assert.equal(s3BucketSetting(config), "media");
    assert.equal(s3PrefixSetting(config), "backup/");

    withEnv("DATABASE_PATH", "/data/from-env.db", () => {
      assert.equal(databasePathSetting(config), "/data/from-env.db");
    });
    withEnv("TMDB_REFRESH_LIMIT", "40", () => {
      assert.equal(tmdbRefreshLimitSetting(config), 40);
    });
    withEnv("S3_BUCKET", "env-bucket", () => {
      assert.equal(s3BucketSetting(config), "env-bucket");
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

    const nested = join(dir, "nested.json");
    writeFileSync(
      nested,
      JSON.stringify({ backup: { s3: { secretAccessKey: "must-not-be-here" } } }),
    );
    assert.throws(() => loadRuntimeConfig(nested), /unsupported fields: secretAccessKey/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("malformed tuning variables fail closed instead of becoming NaN", () => {
  for (const value of ["abc", "0", "-3", "1.5", "501"]) {
    withEnv("TMDB_REFRESH_LIMIT", value, () => {
      assert.throws(() => tmdbRefreshLimitSetting({}), /TMDB_REFRESH_LIMIT must be a positive/);
    });
  }
  withEnv("TMDB_METADATA_TTL_DAYS", "soon", () => {
    assert.throws(() => tmdbMetadataTtlDaysSetting({}), /TMDB_METADATA_TTL_DAYS/);
  });
  withEnv("TMDB_REFRESH_LIMIT", "  ", () => {
    assert.equal(tmdbRefreshLimitSetting({}), 50);
  });
  withEnv("TMDB_METADATA_TTL_DAYS", undefined, () => {
    assert.equal(tmdbMetadataTtlDaysSetting({}), 30);
  });
});

test("backup retention and the recovery interval have defaults, config values and strict overrides", () => {
  withEnv("BACKUP_KEEP_VERSIONS", undefined, () => {
    assert.equal(backupKeepVersionsSetting({}), 30);
    assert.equal(backupKeepVersionsSetting({ backup: { keepVersions: 7 } }), 7);
  });
  withEnv("BACKUP_KEEP_VERSIONS", "14", () => assert.equal(backupKeepVersionsSetting({}), 14));
  for (const bad of ["0", "-1", "abc", "1.5", "1001"])
    withEnv("BACKUP_KEEP_VERSIONS", bad, () =>
      assert.throws(() => backupKeepVersionsSetting({}), /BACKUP_KEEP_VERSIONS/, bad),
    );

  withEnv("ENRICHMENT_RECOVERY_INTERVAL_SECONDS", undefined, () =>
    assert.equal(enrichmentRecoveryIntervalSecondsSetting(), 60),
  );
  withEnv("ENRICHMENT_RECOVERY_INTERVAL_SECONDS", "300", () =>
    assert.equal(enrichmentRecoveryIntervalSecondsSetting(), 300),
  );
  withEnv("ENRICHMENT_RECOVERY_INTERVAL_SECONDS", "0", () =>
    assert.throws(() => enrichmentRecoveryIntervalSecondsSetting(), /ENRICHMENT_RECOVERY/),
  );

  const dir = mkdtempSync(join(tmpdir(), "media-list-config-"));
  try {
    const file = join(dir, "application.json");
    writeFileSync(file, JSON.stringify({ backup: { keepVersions: 12 } }));
    assert.equal(loadRuntimeConfig(file).backup?.keepVersions, 12);
    writeFileSync(file, JSON.stringify({ backup: { keepVersions: 0 } }));
    assert.throws(() => loadRuntimeConfig(file), /keepVersions/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
