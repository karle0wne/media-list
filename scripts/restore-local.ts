import "dotenv/config";
import { copyFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { databasePath } from "../src/db/index";

const source = resolve(process.argv[2] || "./data/pre-deploy.db");
const target = resolve(databasePath());
if (source === target) throw new Error("Snapshot source must differ from database path");
await rm(`${target}-wal`, { force: true });
await rm(`${target}-shm`, { force: true });
await copyFile(source, target);
console.log(`Restored local snapshot ${source} to ${target}`);
