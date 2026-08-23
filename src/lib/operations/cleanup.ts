import { lt } from "drizzle-orm";
import { openDatabase } from "../../db";
import { importBatches } from "../../db/schema";

export async function cleanup(now = new Date()) {
  const { db, sqlite } = openDatabase();
  const stagingCutoff = new Date(now.getTime() - 7 * 86_400_000);
  try {
    const staleImports = await db.delete(importBatches).where(lt(importBatches.createdAt, stagingCutoff));
    return { importBatches: staleImports.changes };
  } finally {
    sqlite.close();
  }
}
