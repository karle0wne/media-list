import "dotenv/config";
import { and, isNotNull, lt, or } from "drizzle-orm";
import { openDatabase } from "../src/db/index";
import { importBatches, invites, sessions } from "../src/db/schema";

export async function cleanup(now = new Date()) {
  const { db, sqlite } = openDatabase();
  const stagingCutoff = new Date(now.getTime() - 7 * 86_400_000);
  const inviteCutoff = new Date(now.getTime() - 30 * 86_400_000);
  try {
    const expiredSessions = await db.delete(sessions).where(lt(sessions.expiresAt, now));
    const staleInvites = await db.delete(invites).where(or(
      lt(invites.expiresAt, inviteCutoff),
      and(isNotNull(invites.usedAt), lt(invites.usedAt, inviteCutoff)),
    ));
    const staleImports = await db.delete(importBatches).where(lt(importBatches.createdAt, stagingCutoff));
    return {
      sessions: expiredSessions.changes,
      invites: staleInvites.changes,
      importBatches: staleImports.changes,
    };
  } finally {
    sqlite.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await cleanup();
  console.log(`Cleanup complete: ${JSON.stringify(result)}`);
}
