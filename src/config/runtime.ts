import { existsSync, readFileSync } from "node:fs";

const DEFAULT_CONFIG_FILE = "/config/application.json";

type TmdbRuntimeConfig = {
  metadataTtlDays?: number;
  refreshLimit?: number;
};

export type RuntimeConfig = {
  databasePath?: string;
  tmdb?: TmdbRuntimeConfig;
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
  assertKnownFields(root, ["databasePath", "tmdb"], "runtime config");

  let tmdb: TmdbRuntimeConfig | undefined;
  if (root.tmdb !== undefined) {
    const rawTmdb = object(root.tmdb, "runtime config.tmdb");
    assertKnownFields(rawTmdb, ["metadataTtlDays", "refreshLimit"], "runtime config.tmdb");
    tmdb = {
      metadataTtlDays: optionalPositiveInteger(rawTmdb.metadataTtlDays, "runtime config.tmdb.metadataTtlDays"),
      refreshLimit: optionalPositiveInteger(rawTmdb.refreshLimit, "runtime config.tmdb.refreshLimit", 500),
    };
  }

  return {
    databasePath: optionalString(root.databasePath, "runtime config.databasePath"),
    tmdb,
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
