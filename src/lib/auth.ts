import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { getDatabase } from "@/db";
import { sessions, users } from "@/db/schema";
import { cookieSecure, sessionTtlDays } from "./env";
import { hashToken, randomToken } from "./crypto";

const COOKIE = "media_list_session";

export async function createSession(userId: string) {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + sessionTtlDays() * 86_400_000);
  const { db } = getDatabase();
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, createdAt: now, expiresAt: expires });
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", expires });
}

export async function deleteCurrentSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await getDatabase().db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  jar.delete(COOKIE);
}

export async function currentUser() {
  const token = await currentSessionToken();
  if (!token) return null;
  const rows = await getDatabase().db.select({ id: users.id, username: users.username, role: users.role, active: users.active }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), eq(users.active, true))).limit(1);
  return rows[0] ?? null;
}

export async function currentSessionToken() { return (await cookies()).get(COOKIE)?.value ?? null; }
export async function requireSessionToken() { const token = await currentSessionToken(); if (!token) redirect("/login"); return token; }
export async function requireUser() { const user = await currentUser(); if (!user) redirect("/login"); return user; }
export async function requireAdmin() { const user = await requireUser(); if (user.role !== "ADMIN") redirect("/"); return user; }
