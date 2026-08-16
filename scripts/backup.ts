import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { openDatabase } from "../src/db/index";
import { serviceState } from "../src/db/schema";
import { formatBytes, parseOptionalGiB, projectStorageBytes } from "../src/lib/storage-budget";

const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "auto",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
});
const bucket = process.env.S3_BUCKET!;
const prefix = normalizePrefix(process.env.S3_PREFIX ?? "media-list/");
const storageWarnBytes = parseOptionalGiB("S3_STORAGE_WARN_GIB", process.env.S3_STORAGE_WARN_GIB);
const storageHardLimitBytes = parseOptionalGiB("S3_STORAGE_HARD_LIMIT_GIB", process.env.S3_STORAGE_HARD_LIMIT_GIB);
if (storageWarnBytes && storageHardLimitBytes && storageWarnBytes > storageHardLimitBytes) {
  throw new Error("S3_STORAGE_WARN_GIB must not exceed S3_STORAGE_HARD_LIMIT_GIB");
}

const snapshotPath = join(tmpdir(), `media-list-${randomUUID()}.db`);
const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, "-");
const month = now.toISOString().slice(0, 7);
const snapshotKey = `${prefix}snapshots/${stamp}.db`;
const latestKey = `${prefix}latest/media-list.db`;
const monthlyKey = `${prefix}monthly/${month}.db`;

const source = openDatabase();
try {
  source.sqlite.prepare("VACUUM INTO ?").run(snapshotPath);
} finally {
  source.sqlite.close();
}

try {
  const body = await readFile(snapshotPath);
  const objects = await listAll(prefix);
  const staleKeys = new Set([...staleSnapshotKeys(objects, now), ...staleMonthlyKeys(objects, now)]);
  await deleteKeys([...staleKeys]);

  const retained = objects.flatMap((item) => item.Key && !staleKeys.has(item.Key)
    ? [{ key: item.Key, size: Math.max(0, item.Size ?? 0) }]
    : []);
  const monthlyExists = retained.some((item) => item.key === monthlyKey);
  const projectedStorageBytes = projectStorageBytes(retained, [
    { key: snapshotKey, size: body.byteLength },
    { key: monthlyKey, size: body.byteLength, enabled: !monthlyExists },
    { key: latestKey, size: body.byteLength },
  ]);

  reportStorageBudget(projectedStorageBytes);
  if (storageHardLimitBytes && projectedStorageBytes > storageHardLimitBytes) {
    throw new Error(`Backup aborted before upload: projected storage ${formatBytes(projectedStorageBytes)} exceeds hard limit ${formatBytes(storageHardLimitBytes)}`);
  }

  await put(snapshotKey, body);
  if (!monthlyExists) await put(monthlyKey, body);
  await put(latestKey, body);

  const state = openDatabase();
  try {
    await state.db.insert(serviceState).values({ id: "global", lastBackupAt: now, lastBackupKey: latestKey, updatedAt: now }).onConflictDoUpdate({
      target: serviceState.id,
      set: { lastBackupAt: now, lastBackupKey: latestKey, updatedAt: now },
    });
  } finally {
    state.sqlite.close();
  }
  console.log(`Backup complete: s3://${bucket}/${snapshotKey}; latest=${latestKey}; storage=${formatBytes(projectedStorageBytes)} under prefix ${prefix || "<bucket-root>"}`);
} finally {
  await rm(snapshotPath, { force: true });
}

async function put(key: string, body: Uint8Array) {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "application/vnd.sqlite3" }));
}

function staleSnapshotKeys(objects: ListedObject[], reference: Date) {
  const cutoff = reference.getTime() - Number(process.env.S3_SNAPSHOT_RETENTION_DAYS || 90) * 86_400_000;
  return objects.filter((item) => item.Key?.startsWith(`${prefix}snapshots/`) && item.LastModified && item.LastModified.getTime() < cutoff).map((item) => item.Key!);
}

function staleMonthlyKeys(objects: ListedObject[], reference: Date) {
  const months = Math.max(1, Number(process.env.S3_MONTHLY_RETENTION_MONTHS || 24));
  const cutoff = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - months + 1, 1)).toISOString().slice(0, 7);
  return objects.flatMap((item) => {
    if (!item.Key) return [];
    const relativeKey = item.Key.slice(prefix.length);
    const match = /^monthly\/(\d{4}-\d{2})\.db$/.exec(relativeKey);
    return match && match[1] < cutoff ? [item.Key] : [];
  });
}

type ListedObject = { Key?: string; LastModified?: Date; Size?: number };

async function listAll(objectPrefix: string) {
  const output: ListedObject[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: objectPrefix, ContinuationToken: token }));
    output.push(...(page.Contents ?? []));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return output;
}

async function deleteKeys(keys: string[]) {
  for (let offset = 0; offset < keys.length; offset += 1000) {
    const batch = keys.slice(offset, offset + 1000);
    if (!batch.length) continue;
    await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }));
  }
}

function reportStorageBudget(projectedBytes: number) {
  console.log(`Backup storage projected after retention: ${formatBytes(projectedBytes)} (${projectedBytes} bytes)`);
  if (storageWarnBytes && projectedBytes >= storageWarnBytes) {
    console.warn(`Backup storage warning: projected usage ${formatBytes(projectedBytes)} reached warning threshold ${formatBytes(storageWarnBytes)}`);
  }
}

function normalizePrefix(value: string) {
  const trimmed = value.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `${trimmed}/` : "";
}
