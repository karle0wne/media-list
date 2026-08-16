import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { openDatabase } from "../src/db/index";
import { serviceState } from "../src/db/schema";

const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "auto",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
});
const bucket = process.env.S3_BUCKET!;
const prefix = normalizePrefix(process.env.S3_PREFIX || "media-list/");
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
  await put(snapshotKey, body);
  await put(latestKey, body);
  if (!(await objectExists(monthlyKey))) await put(monthlyKey, body);
  await pruneSnapshots(now);
  await pruneMonthly(now);

  const state = openDatabase();
  try {
    await state.db.insert(serviceState).values({ id: "global", lastBackupAt: now, lastBackupKey: latestKey, updatedAt: now }).onConflictDoUpdate({
      target: serviceState.id,
      set: { lastBackupAt: now, lastBackupKey: latestKey, updatedAt: now },
    });
  } finally {
    state.sqlite.close();
  }
  console.log(`Backup complete: s3://${bucket}/${snapshotKey}; latest=${latestKey}`);
} finally {
  await rm(snapshotPath, { force: true });
}

async function put(key: string, body: Uint8Array) {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "application/vnd.sqlite3" }));
}

async function objectExists(key: string) {
  const result = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: key, MaxKeys: 1 }));
  return result.Contents?.some((item) => item.Key === key) ?? false;
}

async function pruneSnapshots(reference: Date) {
  const cutoff = reference.getTime() - Number(process.env.S3_SNAPSHOT_RETENTION_DAYS || 90) * 86_400_000;
  const objects = await listAll(`${prefix}snapshots/`);
  await deleteKeys(objects.filter((item) => item.Key && item.LastModified && item.LastModified.getTime() < cutoff).map((item) => item.Key!));
}

async function pruneMonthly(reference: Date) {
  const months = Math.max(1, Number(process.env.S3_MONTHLY_RETENTION_MONTHS || 24));
  const cutoff = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - months + 1, 1)).toISOString().slice(0, 7);
  const objects = await listAll(`${prefix}monthly/`);
  const stale = objects.flatMap((item) => {
    if (!item.Key) return [];
    const match = /\/monthly\/(\d{4}-\d{2})\.db$/.exec(item.Key);
    return match && match[1] < cutoff ? [item.Key] : [];
  });
  await deleteKeys(stale);
}

async function listAll(objectPrefix: string) {
  const output: Array<{ Key?: string; LastModified?: Date }> = [];
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

function normalizePrefix(value: string) {
  const trimmed = value.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `${trimmed}/` : "";
}
