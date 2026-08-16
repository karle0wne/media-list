import "dotenv/config";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const dbPath = process.env.DATABASE_PATH || "./data/media-list.db";
const prefix = normalizePrefix(process.env.S3_PREFIX || "media-list/");
const key = process.argv[2] || `${prefix}latest/media-list.db`;
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "auto",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
});

const object = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
if (!object.Body) throw new Error("Backup object has no body");
const bytes = await object.Body.transformToByteArray();
await mkdir(dirname(dbPath), { recursive: true });
const temp = `${dbPath}.restore`;
await writeFile(temp, bytes);
await rm(`${dbPath}-wal`, { force: true });
await rm(`${dbPath}-shm`, { force: true });
await rename(temp, dbPath);
console.log(`Restored ${key} to ${dbPath}. Restart the application before use.`);

function normalizePrefix(value: string) {
  const trimmed = value.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `${trimmed}/` : "";
}
