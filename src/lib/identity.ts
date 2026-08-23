import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDatabase, type AppDb } from "@/db";
import { users } from "@/db/schema";

export type TrustedIdentity = {
  subject: string;
  email: string;
  name: string;
};

export async function requireIdentity() {
  const requestHeaders = await headers();
  return resolveTrustedIdentity(getDatabase().db, {
    subject: requiredHeader(requestHeaders.get("x-auth-subject"), "X-Auth-Subject", 512),
    email: normalizeEmail(requiredHeader(requestHeaders.get("x-auth-email"), "X-Auth-Email", 254)),
    name: sanitizeUsername(requiredHeader(requestHeaders.get("x-auth-name"), "X-Auth-Name", 128)),
  });
}

export async function resolveTrustedIdentity(db: AppDb, identity: TrustedIdentity) {
  const bySubject = (await db.select().from(users).where(eq(users.externalSubject, identity.subject)).limit(1))[0];
  if (bySubject) {
    await synchronizeIdentity(db, bySubject.id, identity);
    return { id: bySubject.id, username: identity.name };
  }

  // Existing production data can be linked once by the unique verified email that
  // the trusted gateway supplies. This is data ownership migration, not access logic.
  const byEmail = (await db.select().from(users).where(eq(users.email, identity.email)).limit(1))[0];
  if (byEmail) {
    await synchronizeIdentity(db, byEmail.id, identity);
    return { id: byEmail.id, username: identity.name };
  }

  const id = randomUUID();
  const username = await uniqueUsername(db, identity.name);
  await db.insert(users).values({
    id,
    username,
    email: identity.email,
    externalSubject: identity.subject,
    createdAt: new Date(),
  });
  return { id, username };
}

async function synchronizeIdentity(db: AppDb, userId: string, identity: TrustedIdentity) {
  const emailOwner = (await db.select({ id: users.id }).from(users).where(eq(users.email, identity.email)).limit(1))[0];
  if (emailOwner && emailOwner.id !== userId) throw new Error("Trusted identity email is already linked to another data owner");
  await db.update(users).set({ externalSubject: identity.subject, email: identity.email, username: identity.name }).where(eq(users.id, userId));
}

async function uniqueUsername(db: AppDb, preferred: string) {
  for (let index = 0; index < 100; index++) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const candidate = `${preferred.slice(0, 32 - suffix.length)}${suffix}`;
    const existing = (await db.select({ id: users.id }).from(users).where(eq(users.username, candidate)).limit(1))[0];
    if (!existing) return candidate;
  }
  return `user-${randomUUID().slice(0, 8)}`;
}

function requiredHeader(value: string | null, name: string, max: number) {
  const clean = value?.trim() ?? "";
  if (!clean || clean.length > max || /[\r\n]/.test(clean)) throw new Error(`Missing or invalid trusted identity header ${name}`);
  return clean;
}

function normalizeEmail(value: string) {
  const clean = value.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("Trusted identity has invalid email");
  return clean;
}

function sanitizeUsername(value: string) {
  const clean = value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return clean.length >= 3 ? clean : `user-${randomUUID().slice(0, 8)}`;
}
