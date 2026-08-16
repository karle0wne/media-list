import "dotenv/config";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { openDatabase } from "../src/db/index";

const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const snapshot = join(tmpdir(), `media-list-${randomUUID()}.db`);
const { sqlite } = openDatabase();
try {
  sqlite.prepare("VACUUM INTO ?").run(snapshot);
} finally {
  sqlite.close();
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const prefix = (process.env.S3_PREFIX || "media-list/").replace(/^\/+/, "");
const key = `${prefix}${stamp}.db`;
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "auto",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
});
try {
  await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: await readFile(snapshot), ContentType: "application/vnd.sqlite3" }));
  console.log(`Backup uploaded: s3://${process.env.S3_BUCKET}/${key}`);
} finally {
  await rm(snapshot, { force: true });
}
