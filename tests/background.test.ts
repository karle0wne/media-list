import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBackgroundWork } from "../src/lib/background";
import { runBacklogDrain, startRecoveryLoop, totalQueue } from "../src/lib/enrichment-worker";
import { openTestDatabase } from "./db";

type Timers = NonNullable<Parameters<typeof startRecoveryLoop>[2]>;
function fakeTimers() {
  const calls: { intervalMs?: number; unref: boolean; cleared: boolean } = {
    unref: false,
    cleared: false,
  };
  const handle = {
    unref() {
      calls.unref = true;
      return handle;
    },
  };
  const timers = {
    setInterval: ((_run: () => void, ms: number) => {
      calls.intervalMs = ms;
      return handle;
    }) as unknown as Timers["setInterval"],
    clearInterval: (() => {
      calls.cleared = true;
    }) as unknown as Timers["clearInterval"],
  };
  return { timers, calls };
}

test("the recovery loop runs passes on its interval without keeping the process alive", async () => {
  const { timers, calls } = fakeTimers();
  let runs = 0;
  const loop = startRecoveryLoop(async () => void (runs += 1), 60_000, timers);
  assert.equal(calls.intervalMs, 60_000);
  assert.equal(calls.unref, true, "a background timer must not block shutdown");
  await loop.tick();
  await loop.tick();
  assert.equal(runs, 2);
  loop.stop();
  assert.equal(calls.cleared, true);
});

test("a recovery pass never overlaps the previous one, and a failure does not end the loop", async () => {
  const { timers } = fakeTimers();
  let release!: () => void;
  let started = 0;
  const original = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    const loop = startRecoveryLoop(
      async () => {
        started += 1;
        if (started === 1) await new Promise<void>((resolve) => (release = resolve));
        if (started === 3) throw new Error("provider exploded");
      },
      1_000,
      timers,
    );
    const first = loop.tick();
    await loop.tick(); // the first pass is still running, so this tick is skipped
    assert.equal(started, 1);
    release();
    await first;
    await loop.tick();
    await loop.tick(); // the third pass throws
    await loop.tick();
    assert.equal(started, 4, "the loop keeps going after a failed pass");
    assert.equal(logged.length, 1);
  } finally {
    console.error = original;
  }
});

test("a drain that cannot reach the database gives its total lookups back", async () => {
  const { db, sqlite } = openTestDatabase();
  sqlite.close(); // every query now fails
  const previous = globalThis.__mediaListDb;
  globalThis.__mediaListDb = { db, sqlite };
  const original = console.error;
  console.error = () => {};
  try {
    totalQueue().clear();
    totalQueue().add("media-1");
    await runBacklogDrain();
    assert.deepEqual([...totalQueue()], ["media-1"], "the lookup is kept for the next pass");
    assert.equal(globalThis.__mediaListBacklogDrain, undefined, "the drain slot is released");
  } finally {
    console.error = original;
    totalQueue().clear();
    globalThis.__mediaListDb = previous;
  }
});

test("a drain that cannot even open the database releases its slot, so the next pass can run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "media-list-drain-"));
  const blocker = join(dir, "not-a-directory");
  await writeFile(blocker, "x");
  const previous = globalThis.__mediaListDb;
  const savedPath = process.env.DATABASE_PATH;
  globalThis.__mediaListDb = undefined;
  process.env.DATABASE_PATH = join(blocker, "sub", "media-list.db"); // opening throws ENOTDIR
  const original = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    await runBacklogDrain();
    assert.equal(logged.length, 1, "the failure was reported");
    assert.equal(globalThis.__mediaListBacklogDrain, undefined, "the slot was released");
    const again = runBacklogDrain();
    assert.notEqual(again, undefined);
    await again;
    assert.equal(logged.length, 2, "a later pass really runs again instead of reusing a stale one");
  } finally {
    console.error = original;
    globalThis.__mediaListDb = previous;
    if (savedPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = savedPath;
    await rm(dir, { recursive: true, force: true });
  }
});

test("a second caller joins the drain that is already running", async () => {
  const { db, sqlite } = openTestDatabase();
  const previous = globalThis.__mediaListDb;
  globalThis.__mediaListDb = { db, sqlite };
  try {
    const first = runBacklogDrain();
    const second = runBacklogDrain();
    assert.equal(first, second);
    await first;
    assert.equal(globalThis.__mediaListBacklogDrain, undefined);
  } finally {
    globalThis.__mediaListDb = previous;
    sqlite.close();
  }
});

test("a production server without gateway credentials refuses to start; a configured one starts once", () => {
  const saved = { ...process.env };
  const current = () => globalThis.__mediaListRecovery;
  process.env.DATABASE_PATH = ":memory:";
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    delete process.env.GATEWAY_SHARED_SECRET;
    delete process.env.ALLOW_UNSIGNED_GATEWAY_HEADERS;
    assert.throws(() => startBackgroundWork(), /GATEWAY_SHARED_SECRET is not configured/);
    assert.equal(current(), undefined, "nothing was started");

    process.env.GATEWAY_SHARED_SECRET = "0123456789abcdef0123456789abcdef";
    startBackgroundWork();
    const started = current();
    assert.ok(started);
    startBackgroundWork();
    assert.equal(current(), started, "a second start changes nothing");
    started.stop();
    assert.equal(current(), undefined);

    process.env.ENRICHMENT_RECOVERY_INTERVAL_SECONDS = "0";
    assert.throws(() => startBackgroundWork(), /ENRICHMENT_RECOVERY_INTERVAL_SECONDS/);
  } finally {
    current()?.stop();
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
