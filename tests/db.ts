import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, type AppDb } from "../src/db/index";
import { applySchemaCompatibility } from "../src/db/compat";
import { resolveTrustedIdentity } from "../src/lib/identity";

const drizzleDir = fileURLToPath(new URL("../drizzle", import.meta.url));

export function openTestDatabase() {
  const bundle = openDatabase(":memory:");
  for (const dir of readdirSync(drizzleDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
    bundle.sqlite.exec(readFileSync(join(drizzleDir, dir, "migration.sql"), "utf8"));
  }
  applySchemaCompatibility(bundle.sqlite);
  return bundle;
}

export async function createTestDataOwner(db: AppDb, username = "admin_user") {
  const identity = await resolveTrustedIdentity(db, {
    subject: `central-auth:media-list:${username}`,
    email: `${username}@example.test`,
    name: username,
  });
  return identity.id;
}
