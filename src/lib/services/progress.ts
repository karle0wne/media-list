import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/db";
import { userMedia } from "@/db/schema";

export async function updateUserProgress(db: AppDb, userId: string, id: string, progressCurrent: number) {
  const row = (await db.select({ status: userMedia.status, progressTotal: userMedia.progressTotal })
    .from(userMedia)
    .where(and(eq(userMedia.id, id), eq(userMedia.userId, userId)))
    .limit(1))[0];
  if (!row) return;
  if (row.progressTotal != null && progressCurrent > row.progressTotal) throw new Error(`Progress cannot exceed the known total (${row.progressTotal})`);
  const status = row.status === "COMPLETED" && row.progressTotal != null && progressCurrent !== row.progressTotal ? "IN_PROGRESS" as const : row.status;
  await db.update(userMedia).set({ progressCurrent, status, updatedAt: new Date() }).where(and(eq(userMedia.id, id), eq(userMedia.userId, userId)));
}
