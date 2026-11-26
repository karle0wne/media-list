import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { databasePath } from "../src/db/index";
import { downloadBackup, listBackups } from "../src/lib/backup";
import { runCli } from "../src/lib/cli";
import { createS3Client, loadS3Config } from "../src/lib/s3";
import { assertMediaListDatabase, replaceDatabase } from "../src/lib/sqlite-file";

// npm run restore                  restore the latest recovery object (no object = first bootstrap)
// npm run restore -- --list        show the stored versions, newest first
// npm run restore -- <version>     restore one of them, e.g. history/20261126T120000Z-0123456789ab.db
runCli(async () => {
  const config = loadS3Config();
  const client = createS3Client(config);
  const argument = process.argv[2];

  if (argument === "--list") {
    const versions = await listBackups(client, config);
    if (!versions.length) console.log("No stored versions.");
    for (const version of versions)
      console.log(
        `${version.key.slice(config.prefix.length)}\t${version.size ?? "?"} bytes\t${version.lastModified?.toISOString() ?? "?"}`,
      );
    return;
  }

  const backup = await downloadBackup(client, config, argument);
  if (!backup) {
    console.log(
      `No backup at s3://${config.bucket}/${config.prefix}latest/media-list.db; treating this as first bootstrap`,
    );
    return;
  }
  const dbPath = databasePath();
  await mkdir(dirname(dbPath), { recursive: true });
  const downloaded = `${dbPath}.download-${randomUUID()}`;
  try {
    await writeFile(downloaded, backup.bytes);
    assertMediaListDatabase(downloaded);
    const { target, previous } = await replaceDatabase(downloaded, dbPath);
    console.log(`Restored s3://${config.bucket}/${backup.key} to ${target}`);
    if (previous) console.log(`The database it replaced was kept as ${previous}`);
  } finally {
    await rm(downloaded, { force: true });
  }
});
