import test from "node:test";
import assert from "node:assert/strict";
import { parseExternalSource, parseMediaType, parseUserMediaInput } from "../src/lib/user-media";

test("user media parser accepts the shared canonical shape", () => {
  assert.deepEqual(parseUserMediaInput({
    status: "COMPLETED",
    score: "9",
    progressCurrent: "12",
    progressTotal: "12",
    notes: " done ",
    timeSpentOverrideMinutes: "288",
  }, { requireStatus: true }), {
    status: "COMPLETED",
    score: 9,
    progressCurrent: 12,
    progressTotal: 12,
    notes: "done",
    timeSpentOverrideMinutes: 288,
  });
});

test("user media parser rejects values that used to be silently normalized", () => {
  assert.throws(() => parseUserMediaInput({ status: "COMPLETED", score: "-1" }, { requireStatus: true }), /score must be a non-negative integer/);
  assert.throws(() => parseUserMediaInput({ status: "COMPLETED", progressCurrent: "1.5" }, { requireStatus: true }), /progress_current must be a non-negative integer/);
  assert.throws(() => parseUserMediaInput({ status: "INVALID" }, { requireStatus: true }), /unsupported status/);
  assert.throws(() => parseUserMediaInput({ score: "11" }), /score must be 0\.\.10/);
});

test("media identity enums share one parser contract", () => {
  assert.equal(parseMediaType(" SERIES "), "SERIES");
  assert.equal(parseExternalSource("TMDB"), "TMDB");
  assert.throws(() => parseMediaType("VIDEO"), /unsupported type/);
  assert.throws(() => parseExternalSource("IMDB"), /unsupported external_source/);
});
