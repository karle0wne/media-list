import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("startup migration passes the resolved application database path to drizzle-kit", () => {
  // Whitespace-insensitive so the check survives formatting changes.
  const script = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8").replace(
    /\s+/g,
    "",
  );
  const resolve = script.indexOf("constdbPath=databasePath()");
  const exportToChild = script.indexOf("process.env.DATABASE_PATH=dbPath");
  const spawn = script.indexOf("spawnSync(command");

  assert.ok(resolve >= 0, "migration must resolve the application database path");
  assert.ok(exportToChild > resolve, "resolved path must be exported for drizzle-kit");
  assert.ok(spawn > exportToChild, "drizzle-kit must run after DATABASE_PATH is synchronized");
});
