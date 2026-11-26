import test from "node:test";
import assert from "node:assert/strict";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import {
  downloadBackup,
  historyKey,
  listBackups,
  resolveBackupKey,
  uploadBackup,
} from "../src/lib/backup";

type Stored = { body: Uint8Array; metadata: Record<string, string>; modified: Date };

/** An in-memory bucket that understands the four commands the backup code uses. */
function fakeBucket(options: { pageSize?: number; failPut?: (key: string) => boolean } = {}) {
  const objects = new Map<string, Stored>();
  const log: string[] = [];
  const client = {
    async send(command: unknown) {
      if (command instanceof PutObjectCommand) {
        const { Key, Body, Metadata } = command.input;
        log.push(`put ${Key}`);
        if (options.failPut?.(Key!)) throw new Error("upload failed");
        objects.set(Key!, {
          body: Body as Uint8Array,
          metadata: Metadata ?? {},
          modified: new Date(),
        });
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const found = objects.get(command.input.Key!);
        if (!found) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
        return {
          Body: { transformToByteArray: async () => found.body },
          Metadata: found.metadata,
        };
      }
      if (command instanceof ListObjectsV2Command) {
        const { Prefix = "", ContinuationToken } = command.input;
        const keys = [...objects.keys()].filter((key) => key.startsWith(Prefix)).sort();
        const start = ContinuationToken ? Number(ContinuationToken) : 0;
        const size = options.pageSize ?? 1000;
        const page = keys.slice(start, start + size);
        return {
          Contents: page.map((Key) => ({
            Key,
            Size: objects.get(Key)!.body.length,
            LastModified: objects.get(Key)!.modified,
          })),
          IsTruncated: start + size < keys.length,
          NextContinuationToken: String(start + size),
        };
      }
      if (command instanceof DeleteObjectsCommand) {
        for (const { Key } of command.input.Delete!.Objects!) {
          log.push(`delete ${Key}`);
          objects.delete(Key!);
        }
        return {};
      }
      throw new Error(`unexpected command ${String(command)}`);
    },
  } as unknown as Pick<S3Client, "send">;
  return { client, objects, log };
}

const target = { bucket: "bucket", prefix: "media-list/" };
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 26, 12, minutes, 0));
const bytes = (text: string) => new TextEncoder().encode(text);

test("a backup is stored as a dated version and as the latest recovery object", async () => {
  const { client, objects } = fakeBucket();
  const result = await uploadBackup(client, target, bytes("state-1"), { keep: 5, now: at(0) });
  assert.match(result.historyKey, /^media-list\/history\/20261126T120000Z-[0-9a-f]{12}\.db$/);
  assert.equal(result.latestKey, "media-list/latest/media-list.db");
  assert.deepEqual([...objects.keys()].sort(), [result.historyKey, result.latestKey].sort());
  for (const stored of objects.values()) {
    assert.equal(stored.metadata.sha256, result.sha256);
    assert.deepEqual(stored.body, bytes("state-1"));
  }
});

test("a failed upload of the version leaves the previous latest object untouched", async () => {
  const { client, objects, log } = fakeBucket({ failPut: (key) => key.includes("/history/") });
  objects.set("media-list/latest/media-list.db", {
    body: bytes("good"),
    metadata: {},
    modified: at(0),
  });
  await assert.rejects(uploadBackup(client, target, bytes("bad"), { keep: 5 }), /upload failed/);
  assert.deepEqual(objects.get("media-list/latest/media-list.db")?.body, bytes("good"));
  assert.ok(!log.some((entry) => entry.includes("latest")), "latest was never written");
});

test("only the newest versions are kept, across several pages of listing", async () => {
  const { client, objects } = fakeBucket({ pageSize: 2 });
  for (let minute = 0; minute < 7; minute++)
    await uploadBackup(client, target, bytes(`state-${minute}`), { keep: 3, now: at(minute) });
  const versions = await listBackups(client, target);
  assert.equal(versions.length, 3);
  assert.deepEqual(
    versions.map((v) => v.key.match(/T12(\d\d)00Z/)?.[1]),
    ["06", "05", "04"],
    "newest first",
  );
  assert.ok(objects.has("media-list/latest/media-list.db"), "the recovery object is never pruned");
  assert.equal(objects.size, 4);
});

test("a failure while pruning does not fail the backup", async () => {
  const { client } = fakeBucket();
  const warn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => void warnings.push(args);
  const original = client.send.bind(client);
  (client as { send: unknown }).send = async (command: unknown) => {
    if (command instanceof DeleteObjectsCommand) throw new Error("delete denied");
    return original(command as never);
  };
  try {
    await uploadBackup(client, target, bytes("a"), { keep: 1, now: at(0) });
    const result = await uploadBackup(client, target, bytes("b"), { keep: 1, now: at(1) });
    assert.deepEqual(result.pruned, []);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = warn;
  }
});

test("restore returns the latest backup and checks its checksum", async () => {
  const { client, objects } = fakeBucket();
  await uploadBackup(client, target, bytes("state-1"), { keep: 5, now: at(0) });
  const restored = await downloadBackup(client, target);
  assert.deepEqual(restored?.bytes, bytes("state-1"));

  // A body that no longer matches the recorded checksum must never reach the database file.
  objects.get("media-list/latest/media-list.db")!.body = bytes("tampered");
  await assert.rejects(downloadBackup(client, target), /is corrupt: checksum/);
});

test("a missing latest object is a first bootstrap, a missing version is an error", async () => {
  const { client } = fakeBucket();
  assert.equal(await downloadBackup(client, target), null);
  assert.equal(await downloadBackup(client, target, "latest"), null);
  const key = historyKey("", at(0), "0".repeat(64));
  await assert.rejects(downloadBackup(client, target, key), /missing/);
});

test("an older version can be restored by name, and arbitrary keys are refused", async () => {
  const { client } = fakeBucket();
  const first = await uploadBackup(client, target, bytes("old"), { keep: 5, now: at(0) });
  await uploadBackup(client, target, bytes("new"), { keep: 5, now: at(1) });
  const relative = first.historyKey.slice(target.prefix.length);
  assert.deepEqual((await downloadBackup(client, target, relative))?.bytes, bytes("old"));
  assert.deepEqual((await downloadBackup(client, target, first.historyKey))?.bytes, bytes("old"));
  assert.deepEqual((await downloadBackup(client, target, "latest"))?.bytes, bytes("new"));

  for (const bad of ["../secrets.db", "history/../latest.db", "other/key.db", "history/x.db"])
    assert.throws(() => resolveBackupKey(target.prefix, bad), /Unknown backup/, bad);
});

test("an object without a checksum, or a version whose name does not match, is refused", async () => {
  const { client, objects } = fakeBucket();
  objects.set("media-list/latest/media-list.db", {
    body: bytes("foreign"),
    metadata: {},
    modified: at(0),
  });
  await assert.rejects(downloadBackup(client, target), /has no checksum/);

  const first = await uploadBackup(client, target, bytes("state"), { keep: 5, now: at(1) });
  const stored = objects.get(first.historyKey)!;
  // A consistent object stored under another version's name was copied or renamed by hand.
  const forged = historyKey(target.prefix, at(2), "f".repeat(64));
  objects.set(forged, stored);
  await assert.rejects(
    downloadBackup(client, target, forged.slice(target.prefix.length)),
    /does not match the checksum in its name/,
  );
});

test("a backup stamped older than the retained ones (a clock stepped back) is not pruned", async () => {
  const { client, objects } = fakeBucket();
  for (const minute of [10, 11, 12])
    await uploadBackup(client, target, bytes(`state-${minute}`), { keep: 3, now: at(minute) });
  const stepped = await uploadBackup(client, target, bytes("after-clock-change"), {
    keep: 3,
    now: at(1),
  });
  assert.ok(objects.has(stepped.historyKey), "the version `latest` now equals survives");
  assert.equal(stepped.pruned.length, 1, "the oldest of the others was pruned instead");
  const remaining = (await listBackups(client, target)).map(
    (v) => v.key.match(/T12(\d\d)00Z/)?.[1],
  );
  assert.deepEqual(remaining, ["12", "11", "01"]);
});

test("a partial failure reported by DeleteObjects is a warning, not a failed backup", async () => {
  const { client } = fakeBucket();
  const original = client.send.bind(client);
  (client as { send: unknown }).send = async (command: unknown) => {
    if (command instanceof DeleteObjectsCommand)
      return { Errors: [{ Key: "media-list/history/x", Code: "AccessDenied" }] };
    return original(command as never);
  };
  const warn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => void warnings.push(args);
  try {
    await uploadBackup(client, target, bytes("a"), { keep: 1, now: at(0) });
    const result = await uploadBackup(client, target, bytes("b"), { keep: 1, now: at(1) });
    assert.deepEqual(result.pruned, []);
    assert.equal(warnings.length, 1);
    assert.match(String((warnings[0][1] as Error).message), /could not be deleted/);
  } finally {
    console.warn = warn;
  }
});
