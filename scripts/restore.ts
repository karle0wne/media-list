import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { databasePath } from "../src/db/index";
import { createS3Client, loadS3Config } from "../src/lib/s3";
import { replaceDatabase } from "../src/lib/sqlite-file";

const config = loadS3Config();
const client = createS3Client(config);
const dbPath = databasePath();
const key = process.argv[2] || `${config.prefix}latest/media-list.db`;
const object = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
if (!object.Body) throw new Error("Backup object has no body");
const bytes = await object.Body.transformToByteArray();
await mkdir(dirname(dbPath), { recursive: true });
const downloaded = `${dbPath}.download-${randomUUID()}`;
try {
  await writeFile(downloaded, bytes);
  const target = await replaceDatabase(downloaded, dbPath);
  console.log(`Restored ${key} to ${target}. Restart the application before use.`);
} finally {
  await rm(downloaded, { force: true });
}
