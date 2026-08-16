import assert from "node:assert/strict";
import test from "node:test";
import { formatBytes, parseOptionalGiB, projectStorageBytes } from "../src/lib/storage-budget";

test("storage projection counts retained objects and replaces existing keys", () => {
  const existing = [
    { key: "media-list/latest/media-list.db", size: 100 },
    { key: "media-list/monthly/2026-08.db", size: 90 },
    { key: "media-list/snapshots/old.db", size: 80 },
  ];
  const projected = projectStorageBytes(existing, [
    { key: "media-list/snapshots/new.db", size: 120 },
    { key: "media-list/monthly/2026-08.db", size: 120, enabled: false },
    { key: "media-list/latest/media-list.db", size: 120 },
  ]);
  assert.equal(projected, 410);
});

test("optional GiB limits validate input", () => {
  assert.equal(parseOptionalGiB("LIMIT", ""), null);
  assert.equal(parseOptionalGiB("LIMIT", "1.5"), Math.floor(1.5 * 1024 ** 3));
  assert.throws(() => parseOptionalGiB("LIMIT", "0"), /positive number/);
  assert.throws(() => parseOptionalGiB("LIMIT", "wat"), /positive number/);
});

test("byte formatting stays compact for operator logs", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024 ** 3), "1.00 GiB");
  assert.equal(formatBytes(12 * 1024 ** 3), "12.0 GiB");
});
