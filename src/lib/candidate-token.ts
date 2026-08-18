import { createHmac, timingSafeEqual } from "node:crypto";
import { EXTERNAL_SOURCES, MEDIA_TYPES, type MediaCandidate } from "./types";

type Payload = { candidate: unknown; expiresAt: number };
const DEFAULT_TTL_MS = 60 * 60 * 1000;

export function encodeCandidateToken(candidate: MediaCandidate, sessionToken: string, now = Date.now(), ttlMs = DEFAULT_TTL_MS) {
  const payload = Buffer.from(JSON.stringify({ candidate, expiresAt: now + ttlMs } satisfies Payload)).toString("base64url");
  return `${payload}.${signature(payload, sessionToken).toString("base64url")}`;
}

export function decodeCandidateToken(token: string, sessionToken: string, now = Date.now()): MediaCandidate | null {
  const [payload, encodedSignature, extra] = token.split(".");
  if (!payload || !encodedSignature || extra) return null;
  let provided: Buffer;
  try { provided = Buffer.from(encodedSignature, "base64url"); } catch { return null; }
  const expected = signature(payload, sessionToken);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let parsed: Payload;
  try { parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Payload; } catch { return null; }
  if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt < now) return null;
  return parseCandidate(parsed.candidate);
}

function signature(payload: string, sessionToken: string) {
  return createHmac("sha256", sessionToken).update(payload).digest();
}

function parseCandidate(value: unknown): MediaCandidate | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!EXTERNAL_SOURCES.includes(item.source as never) || !MEDIA_TYPES.includes(item.type as never)) return null;
  if (!shortString(item.externalId, 128) || !optionalString(item.externalSubId, 128) || !shortString(item.title, 500)) return null;
  if (!optionalString(item.originalTitle, 500) || !optionalString(item.countryCode, 16) || !optionalString(item.coverUrl, 2_000) || !optionalString(item.description, 8_000)) return null;
  for (const name of ["year", "runtimeMinutes", "episodeCount", "pageCount"] as const) {
    if (!optionalNonNegativeNumber(item[name])) return null;
  }
  if (typeof item.coverUrl === "string") {
    try { if (new URL(item.coverUrl).protocol !== "https:") return null; } catch { return null; }
  }
  const source = item.source as MediaCandidate["source"];
  const externalId = item.externalId as string;
  const externalSubId = typeof item.externalSubId === "string" ? item.externalSubId : "";
  return {
    key: `${source}:${externalId}:${externalSubId}`,
    type: item.type as MediaCandidate["type"],
    source,
    externalId,
    externalSubId,
    title: item.title as string,
    originalTitle: typeof item.originalTitle === "string" ? item.originalTitle : null,
    countryCode: typeof item.countryCode === "string" ? item.countryCode : null,
    year: numberOrNull(item.year),
    runtimeMinutes: numberOrNull(item.runtimeMinutes),
    episodeCount: numberOrNull(item.episodeCount),
    pageCount: numberOrNull(item.pageCount),
    coverUrl: typeof item.coverUrl === "string" ? item.coverUrl : null,
    description: typeof item.description === "string" ? item.description : null,
  };
}

function shortString(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
function optionalString(value: unknown, max: number) { return value == null || (typeof value === "string" && value.length <= max); }
function optionalNonNegativeNumber(value: unknown) { return value == null || (typeof value === "number" && Number.isFinite(value) && value >= 0); }
function numberOrNull(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
