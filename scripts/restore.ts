import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { databasePath } from "../src/db/index";
import { runCli } from "../src/lib/cli";
import { createS3Client, isMissingS3Object, loadS3Config } from "../src/lib/s3";
import { replaceDatabase } from "../src/lib/sqlite-file";

runCli(async () => {
  const config = loadS3Config();
  const client = createS3Client(config);
  const dbPath = databasePath();
  const backupKey = `${config.prefix}latest/media-list.db`;

  let object;
  try {
    object = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: backupKey }));
  } catch (error) {
    if (isMissingS3Object(error)) {
      console.log(`No backup at s3://${config.bucket}/${backupKey}; treating this as first bootstrap`);
      return;
    }
    throw error;
  }

  if (!object.Body) throw new Error("Backup object has no body");

  const bytes = await object.Body.transformToByteArray();
  await mkdir(dirname(dbPath), { recursive: true });
  const downloaded = `${dbPath}.download-${randomUUID()}`;
  try {
    await writeFile(downloaded, bytes);
    const target = await replaceDatabase(downloaded, dbPath);
    console.log(`Restored s3://${config.bucket}/${backupKey} to ${target}`);
  } finally {
    await rm(downloaded, { force: true });
  }
});
