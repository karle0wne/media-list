import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupKeepVersionsSetting } from "../src/config/runtime";
import { openDatabase } from "../src/db/index";
import { serviceState } from "../src/db/schema";
import { uploadBackup } from "../src/lib/backup";
import { runCli } from "../src/lib/cli";
import { createS3Client, loadS3Config } from "../src/lib/s3";
import { snapshotDatabase } from "../src/lib/sqlite-file";

runCli(async () => {
  const config = loadS3Config();
  const client = createS3Client(config);
  const snapshotPath = join(tmpdir(), `media-list-${randomUUID()}.db`);
  const now = new Date();

  await snapshotDatabase(snapshotPath);
  try {
    const result = await uploadBackup(client, config, await readFile(snapshotPath), {
      keep: backupKeepVersionsSetting(),
      now,
    });

    const state = openDatabase();
    try {
      await state.db
        .insert(serviceState)
        .values({
          id: "global",
          lastBackupAt: now,
          lastBackupKey: result.historyKey,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: serviceState.id,
          set: { lastBackupAt: now, lastBackupKey: result.historyKey, updatedAt: now },
        });
    } finally {
      state.sqlite.close();
    }

    console.log(`Backup complete: s3://${config.bucket}/${result.historyKey}`);
    console.log(`Recovery object updated: s3://${config.bucket}/${result.latestKey}`);
    if (result.pruned.length) console.log(`Removed ${result.pruned.length} old version(s).`);
  } finally {
    await rm(snapshotPath, { force: true });
  }
});
