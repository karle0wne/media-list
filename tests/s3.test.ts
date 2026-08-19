import test from "node:test";
import assert from "node:assert/strict";
import { isMissingS3Object } from "../src/lib/s3";

test("missing object is recognized only as NoSuchKey", () => {
  assert.equal(isMissingS3Object({ name: "NoSuchKey" }), true);
  assert.equal(isMissingS3Object({ Code: "NoSuchKey" }), true);
  assert.equal(isMissingS3Object({ code: "NoSuchKey" }), true);
  assert.equal(isMissingS3Object({ name: "NoSuchBucket" }), false);
  assert.equal(isMissingS3Object({ name: "AccessDenied" }), false);
  assert.equal(isMissingS3Object(new Error("network failure")), false);
  assert.equal(isMissingS3Object(null), false);
});
