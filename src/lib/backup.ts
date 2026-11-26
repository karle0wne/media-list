import { createHash } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { isMissingS3Object } from "./s3";

/**
 * Backup layout under the configured prefix:
 *
 *   latest/media-list.db            the recovery object restore uses by default
 *   history/<UTC stamp>-<sha>.db    one object per backup, newest `keep` retained
 *
 * Overwriting a single object would let one bad backup (an empty database after a faulty
 * deploy, say) replace the only good copy. The history keeps earlier states restorable.
 */
export const LATEST_BACKUP = "latest/media-list.db";
const HISTORY_DIR = "history/";
const HISTORY_NAME = /^history\/\d{8}T\d{6}Z-[0-9a-f]{12}\.db$/;
const SQLITE_TYPE = "application/vnd.sqlite3";

type Store = Pick<S3Client, "send">;
type Target = { bucket: string; prefix: string };

export function historyKey(prefix: string, now: Date, sha256: string) {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `${prefix}${HISTORY_DIR}${stamp}-${sha256.slice(0, 12)}.db`;
}

export type BackupResult = {
  latestKey: string;
  historyKey: string;
  sha256: string;
  pruned: string[];
};

/** Uploads a verified snapshot as a new version and as the latest recovery object. */
export async function uploadBackup(
  client: Store,
  target: Target,
  snapshot: Uint8Array,
  options: { keep: number; now?: Date },
): Promise<BackupResult> {
  const sha256 = createHash("sha256").update(snapshot).digest("hex");
  const latestKey = `${target.prefix}${LATEST_BACKUP}`;
  const versionKey = historyKey(target.prefix, options.now ?? new Date(), sha256);
  const put = (key: string) =>
    client.send(
      new PutObjectCommand({
        Bucket: target.bucket,
        Key: key,
        Body: snapshot,
        ContentType: SQLITE_TYPE,
        Metadata: { sha256 },
      }),
    );
  // The version goes first: if it cannot be stored, `latest` still points at the previous
  // good backup instead of at something that has no history behind it.
  await put(versionKey);
  await put(latestKey);

  let pruned: string[] = [];
  try {
    pruned = await pruneHistory(client, target, options.keep, versionKey);
  } catch (error) {
    // The backup itself succeeded; failing to tidy old versions must not turn it into an error.
    console.warn("Could not prune old backup versions:", error);
  }
  return { latestKey, historyKey: versionKey, sha256, pruned };
}

export type BackupVersion = { key: string; size: number | null; lastModified: Date | null };

/** Stored versions, newest first. */
export async function listBackups(client: Store, target: Target): Promise<BackupVersion[]> {
  const versions: BackupVersion[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: target.bucket,
        Prefix: `${target.prefix}${HISTORY_DIR}`,
        ContinuationToken: token,
      }),
    );
    for (const object of page.Contents ?? [])
      if (object.Key && HISTORY_NAME.test(object.Key.slice(target.prefix.length)))
        versions.push({
          key: object.Key,
          size: object.Size ?? null,
          lastModified: object.LastModified ?? null,
        });
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  // Stamps are UTC and fixed-width, so the key order is the chronological order.
  return versions.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

async function pruneHistory(client: Store, target: Target, keep: number, protectedKey: string) {
  const versions = await listBackups(client, target);
  // Names sort by the clock of the host that made the backup. A host whose clock stepped back
  // would otherwise see its brand-new backup (the one `latest` now equals) pruned at once.
  const others = versions.filter((version) => version.key !== protectedKey);
  const kept = new Set(others.slice(0, Math.max(0, keep - 1)).map((version) => version.key));
  kept.add(protectedKey);
  const stale = versions.map((version) => version.key).filter((key) => !kept.has(key));
  for (let start = 0; start < stale.length; start += 1000) {
    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: target.bucket,
        Delete: { Objects: stale.slice(start, start + 1000).map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (result.Errors?.length)
      throw new Error(`${result.Errors.length} backup version(s) could not be deleted`);
  }
  return stale;
}

/** `latest` (or nothing) selects the recovery object; a `history/...` name selects a version. */
export function resolveBackupKey(prefix: string, requested?: string) {
  if (!requested || requested === "latest")
    return { key: `${prefix}${LATEST_BACKUP}`, latest: true };
  const relative =
    prefix && requested.startsWith(prefix) ? requested.slice(prefix.length) : requested;
  if (!HISTORY_NAME.test(relative))
    throw new Error(
      `Unknown backup "${requested}": use "latest" or a name from the list (history/<stamp>-<sha>.db)`,
    );
  return { key: `${prefix}${relative}`, latest: false };
}

/**
 * Downloads a backup and checks it against the checksum recorded at upload. Returns `null`
 * only when the latest object does not exist (first bootstrap); any other problem throws,
 * including an object without a checksum (it was not made by this tool) and a version whose
 * name does not match its content.
 */
export async function downloadBackup(client: Store, target: Target, requested?: string) {
  const { key, latest } = resolveBackupKey(target.prefix, requested);
  let object;
  try {
    object = await client.send(new GetObjectCommand({ Bucket: target.bucket, Key: key }));
  } catch (error) {
    if (latest && isMissingS3Object(error)) return null;
    throw error;
  }
  if (!object.Body) throw new Error("Backup object has no body");
  const bytes = await object.Body.transformToByteArray();
  const expected = object.Metadata?.sha256;
  if (!expected) throw new Error(`Backup ${key} has no checksum and is refused`);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected)
    throw new Error(`Backup ${key} is corrupt: checksum ${actual} does not match ${expected}`);
  const named = key.match(/-([0-9a-f]{12})\.db$/)?.[1];
  if (!latest && named && !actual.startsWith(named))
    throw new Error(`Backup ${key} does not match the checksum in its name`);
  return { key, bytes };
}
