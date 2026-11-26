import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/db";
import { userMedia } from "@/db/schema";
import { applyProgress } from "../domain/progress";

export async function updateUserProgress(
  db: AppDb,
  userId: string,
  id: string,
  progressCurrent: number,
) {
  const row = (
    await db
      .select({ status: userMedia.status, progressTotal: userMedia.progressTotal })
      .from(userMedia)
      .where(and(eq(userMedia.id, id), eq(userMedia.userId, userId)))
      .limit(1)
  )[0];
  if (!row) return;
  await db
    .update(userMedia)
    .set({ ...applyProgress(row, progressCurrent), updatedAt: new Date() })
    .where(and(eq(userMedia.id, id), eq(userMedia.userId, userId)));
}
