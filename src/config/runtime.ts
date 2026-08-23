import { existsSync, readFileSync } from "node:fs";

const DEFAULT_CONFIG_FILE = "/config/application.json";

type TmdbRuntimeConfig = {
  metadataTtlDays?: number;
  refreshLimit?: number;
};

type S3RuntimeConfig = {
  endpoint?: string;
  region?: string;
  bucket?: string;
  prefix?: string;
};

export type RuntimeConfig = {
  databasePath?: string;
  tmdb?: TmdbRuntimeConfig;
  backup?: { s3?: S3RuntimeConfig };
};

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertKnownFields(value: Record<string, unknown>, allowed: readonly string[], name: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`${name} contains unsupported fields: ${unknown.sort().join(", ")}`);
}

function optionalString(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  return value.trim();
}

function optionalPositiveInteger(value: unknown, name: string, maximum?: number) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Number(value) < 1 || (maximum !== undefined && Number(value) > maximum)) {
    throw new Error(`${name} must be a positive integer${maximum ? ` <= ${maximum}` : ""}`);
  }
  return Number(value);
}

export function loadRuntimeConfig(path = process.env.MEDIA_LIST_CONFIG_FILE?.trim() || DEFAULT_CONFIG_FILE): RuntimeConfig {
  if (!existsSync(path)) return {};
  const root = object(JSON.parse(readFileSync(path, "utf8")), "runtime config");
  assertKnownFields(root, ["databasePath", "tmdb", "backup"], "runtime config");

  let tmdb: TmdbRuntimeConfig | undefined;
  if (root.tmdb !== undefined) {
    const rawTmdb = object(root.tmdb, "runtime config.tmdb");
    assertKnownFields(rawTmdb, ["metadataTtlDays", "refreshLimit"], "runtime config.tmdb");
    tmdb = {
      metadataTtlDays: optionalPositiveInteger(rawTmdb.metadataTtlDays, "runtime config.tmdb.metadataTtlDays"),
      refreshLimit: optionalPositiveInteger(rawTmdb.refreshLimit, "runtime config.tmdb.refreshLimit", 500),
    };
  }

  let backup: RuntimeConfig["backup"];
  if (root.backup !== undefined) {
    const rawBackup = object(root.backup, "runtime config.backup");
    assertKnownFields(rawBackup, ["s3"], "runtime config.backup");
    if (rawBackup.s3 !== undefined) {
      const rawS3 = object(rawBackup.s3, "runtime config.backup.s3");
      assertKnownFields(rawS3, ["endpoint", "region", "bucket", "prefix"], "runtime config.backup.s3");
      backup = {
        s3: {
          endpoint: optionalString(rawS3.endpoint, "runtime config.backup.s3.endpoint"),
          region: optionalString(rawS3.region, "runtime config.backup.s3.region"),
          bucket: optionalString(rawS3.bucket, "runtime config.backup.s3.bucket"),
          prefix: optionalString(rawS3.prefix, "runtime config.backup.s3.prefix"),
        },
      };
    } else {
      backup = {};
    }
  }

  return {
    databasePath: optionalString(root.databasePath, "runtime config.databasePath"),
    tmdb,
    backup,
  };
}

export function databasePathSetting(config = loadRuntimeConfig()) {
  return process.env.DATABASE_PATH || config.databasePath || "./data/media-list.db";
}

export function tmdbMetadataTtlDaysSetting(config = loadRuntimeConfig()) {
  return Math.max(1, Number(process.env.TMDB_METADATA_TTL_DAYS || config.tmdb?.metadataTtlDays || 30));
}

export function tmdbRefreshLimitSetting(config = loadRuntimeConfig()) {
  return Math.max(1, Math.min(500, Number(process.env.TMDB_REFRESH_LIMIT || config.tmdb?.refreshLimit || 50)));
}

export function s3EndpointSetting(config = loadRuntimeConfig()) {
  return process.env.S3_ENDPOINT?.trim() || config.backup?.s3?.endpoint;
}

export function s3RegionSetting(config = loadRuntimeConfig()) {
  return process.env.S3_REGION?.trim() || config.backup?.s3?.region || "auto";
}

export function s3BucketSetting(config = loadRuntimeConfig()) {
  return process.env.S3_BUCKET?.trim() || config.backup?.s3?.bucket;
}

export function s3PrefixSetting(config = loadRuntimeConfig()) {
  return process.env.S3_PREFIX ?? config.backup?.s3?.prefix ?? "media-list/";
}
