import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { assertWellFormedIdentity } from "./domain/identity";
import { isMediaType } from "./user-media";
import { EXTERNAL_SOURCES, type MediaCandidate } from "./types";

// A search result is signed when the page is rendered, so the "Add" action can save it at
// once without asking the provider again. The signature stops a client from submitting
// arbitrary titles for the shared catalogue.
const TTL_MS = 60 * 60 * 1000;

declare global {
  var __mediaListTokenSecret: Buffer | undefined;
}

function defaultSecret() {
  const configured = process.env.CANDIDATE_TOKEN_SECRET?.trim();
  if (configured) return configured;
  // Per-process fallback: a token issued before a restart is simply rejected ("search again").
  return (globalThis.__mediaListTokenSecret ??= randomBytes(32));
}

function sign(payload: string, secret: string | Buffer) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signCandidate(
  candidate: MediaCandidate,
  now = Date.now(),
  secret: string | Buffer = defaultSecret(),
) {
  const slim: MediaCandidate = {
    key: candidate.key,
    source: candidate.source,
    externalId: candidate.externalId,
    externalSubId: candidate.externalSubId,
    type: candidate.type,
    title: candidate.title,
    originalTitle: candidate.originalTitle ?? null,
    romanizedTitle: candidate.romanizedTitle ?? null,
    year: candidate.year ?? null,
    episodeCount: candidate.episodeCount ?? null,
    pageCount: candidate.pageCount ?? null,
    coverUrl: candidate.coverUrl ?? null,
    externalUrl: candidate.externalUrl ?? null,
  };
  const payload = Buffer.from(JSON.stringify({ candidate: slim, exp: now + TTL_MS })).toString(
    "base64url",
  );
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the signed candidate, or null when the token is forged, expired or malformed. */
export function verifyCandidate(
  token: string,
  now = Date.now(),
  secret: string | Buffer = defaultSecret(),
): MediaCandidate | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      candidate?: MediaCandidate;
      exp?: number;
    };
    const candidate = parsed.candidate;
    if (!candidate || typeof parsed.exp !== "number" || parsed.exp < now) return null;
    if (
      !EXTERNAL_SOURCES.includes(candidate.source) ||
      !isMediaType(candidate.type) ||
      typeof candidate.title !== "string" ||
      !candidate.title.trim()
    )
      return null;
    assertWellFormedIdentity(candidate);
    return candidate;
  } catch {
    return null;
  }
}
