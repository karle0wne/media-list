import test from "node:test";
import assert from "node:assert/strict";
import { decodeCandidateToken, encodeCandidateToken } from "../src/lib/candidate-token";
import type { MediaCandidate } from "../src/lib/types";

const candidate: MediaCandidate = {
  key: "ANILIST:123:",
  type: "ANIME",
  source: "ANILIST",
  externalId: "123",
  externalSubId: "",
  title: "Fast Add",
  year: 2026,
  coverUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/test.jpg",
};

test("signed candidate round-trips for the same session", () => {
  const token = encodeCandidateToken(candidate, "session-a", 1_000, 5_000);
  assert.deepEqual(decodeCandidateToken(token, "session-a", 2_000), { ...candidate, originalTitle: null, countryCode: null, runtimeMinutes: null, episodeCount: null, pageCount: null, description: null });
});

test("candidate cannot be reused in another session or after expiry", () => {
  const token = encodeCandidateToken(candidate, "session-a", 1_000, 5_000);
  assert.equal(decodeCandidateToken(token, "session-b", 2_000), null);
  assert.equal(decodeCandidateToken(token, "session-a", 6_001), null);
});

test("candidate payload tampering invalidates the signature", () => {
  const token = encodeCandidateToken(candidate, "session-a", 1_000, 5_000);
  const [payload, signature] = token.split(".");
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  parsed.candidate.title = "tampered";
  const tamperedPayload = Buffer.from(JSON.stringify(parsed)).toString("base64url");
  assert.equal(decodeCandidateToken(`${tamperedPayload}.${signature}`, "session-a", 2_000), null);
});
