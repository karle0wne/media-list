import test from "node:test";
import assert from "node:assert/strict";
import {
  adoptProviderTotal,
  applyProgress,
  completionProgress,
  defaultProgressTotal,
  initialProgress,
} from "../src/lib/domain/progress";

test("default totals come from the provider by medium", () => {
  assert.equal(defaultProgressTotal({ type: "MOVIE" }), 1);
  assert.equal(defaultProgressTotal({ type: "BOOK", pageCount: 300 }), 300);
  assert.equal(defaultProgressTotal({ type: "BOOK" }), null);
  assert.equal(defaultProgressTotal({ type: "ANIME", episodeCount: 12 }), 12);
  assert.equal(defaultProgressTotal({ type: "GAME" }), null);
});

test("new positions prefer imported totals and complete up to the total", () => {
  const anime = { type: "ANIME", episodeCount: 12 } as const;
  assert.deepEqual(initialProgress({ status: "COMPLETED" }, anime), {
    progressCurrent: 12,
    progressTotal: 12,
  });
  assert.deepEqual(initialProgress({ status: "COMPLETED", progressTotal: 24 }, anime), {
    progressCurrent: 24,
    progressTotal: 24,
  });
  assert.deepEqual(initialProgress({ progressCurrent: 3 }, anime), {
    progressCurrent: 3,
    progressTotal: 12,
  });
  assert.deepEqual(initialProgress({ status: "COMPLETED", progressCurrent: 5 }, { type: "GAME" }), {
    progressCurrent: 5,
    progressTotal: null,
  });
});

test("completing needs a known total to move progress", () => {
  assert.deepEqual(completionProgress({ progressTotal: 12 }), {
    progressTotal: 12,
    progressCurrent: 12,
  });
  assert.deepEqual(completionProgress({ progressTotal: 12 }, 24), {
    progressTotal: 24,
    progressCurrent: 24,
  });
  assert.equal(completionProgress({ progressTotal: null }), null);
});

test("manual progress cannot pass the total and reopens a completed position", () => {
  assert.deepEqual(applyProgress({ status: "COMPLETED", progressTotal: 12 }, 7), {
    progressCurrent: 7,
    status: "IN_PROGRESS",
  });
  assert.deepEqual(applyProgress({ status: "COMPLETED", progressTotal: 12 }, 12), {
    progressCurrent: 12,
    status: "COMPLETED",
  });
  assert.deepEqual(applyProgress({ status: "PLANNED", progressTotal: null }, 99), {
    progressCurrent: 99,
    status: "PLANNED",
  });
  assert.throws(
    () => applyProgress({ status: "IN_PROGRESS", progressTotal: 12 }, 13),
    /cannot exceed the known total/,
  );
});

test("a provider total never replaces or overruns what the user has", () => {
  const row = { status: "COMPLETED", progressCurrent: 12, progressTotal: 12 } as const;
  assert.equal(adoptProviderTotal(row, 24), null);
  assert.equal(adoptProviderTotal({ ...row, progressTotal: null, progressCurrent: 30 }, 24), null);
  assert.deepEqual(adoptProviderTotal({ ...row, progressTotal: null, progressCurrent: 0 }, 24), {
    progressTotal: 24,
    progressCurrent: 24,
  });
  assert.deepEqual(
    adoptProviderTotal({ status: "IN_PROGRESS", progressCurrent: 4, progressTotal: null }, 24),
    { progressTotal: 24 },
  );
});
