import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { openDatabase } from "../src/db/index";
import { serviceState } from "../src/db/schema";
import { runCli } from "../src/lib/cli";
import { createS3Client, loadS3Config } from "../src/lib/s3";
import { snapshotDatabase } from "../src/lib/sqlite-file";

runCli(async () => {
  const config = loadS3Config();
  const client = createS3Client(config);
  const backupKey = `${config.prefix}latest/media-list.db`;
  const snapshotPath = join(tmpdir(), `media-list-${randomUUID()}.db`);
  const now = new Date();

  await snapshotDatabase(snapshotPath);
  try {
    const body = await readFile(snapshotPath);
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: backupKey,
      Body: body,
      ContentType: "application/vnd.sqlite3",
    }));

    const state = openDatabase();
    try {
      await state.db.insert(serviceState).values({
        id: "global",
        lastBackupAt: now,
        lastBackupKey: backupKey,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: serviceState.id,
        set: { lastBackupAt: now, lastBackupKey: backupKey, updatedAt: now },
      });
    } finally {
      state.sqlite.close();
    }

    console.log(`Backup complete: s3://${config.bucket}/${backupKey}`);
  } finally {
    await rm(snapshotPath, { force: true });
  }
});
