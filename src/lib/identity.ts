import { createHash, randomUUID } from "node:crypto";
import { cache } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDatabase, type AppDb } from "@/db";
import { users } from "@/db/schema";

export type TrustedIdentity = {
  subject: string;
  email: string;
  name: string;
};

export type DataOwner = { id: string; username: string };

type UserRow = typeof users.$inferSelect;

// Resolved once per server render: the layout and the page both ask for the identity, and
// they run concurrently on a user's very first visit.
export const requireIdentity = cache(async (): Promise<DataOwner> => {
  const requestHeaders = await headers();
  const subject = requiredHeader(requestHeaders.get("x-auth-subject"), "X-Auth-Subject", 512);
  return resolveTrustedIdentity(getDatabase().db, {
    subject,
    email: normalizeEmail(requiredHeader(requestHeaders.get("x-auth-email"), "X-Auth-Email", 254)),
    name: sanitizeUsername(
      requiredHeader(requestHeaders.get("x-auth-name"), "X-Auth-Name", 128),
      subject,
    ),
  });
});

/**
 * Maps the gateway identity to a local data owner. `username` is only a unique display label
 * chosen when the owner is created; it is never rewritten afterwards, so two people with the
 * same gateway name cannot collide on later requests.
 */
export async function resolveTrustedIdentity(
  db: AppDb,
  identity: TrustedIdentity,
): Promise<DataOwner> {
  const bySubject = await findOwner(db, "externalSubject", identity.subject);
  if (bySubject) return linkOwner(db, bySubject, identity);

  // Existing production data can be linked once by the unique verified email that
  // the trusted gateway supplies. This is data ownership migration, not access logic.
  const byEmail = await findOwner(db, "email", identity.email);
  if (byEmail) return linkOwner(db, byEmail, identity);

  return createOwner(db, identity);
}

async function findOwner(db: AppDb, column: "externalSubject" | "email", value: string) {
  return (await db.select().from(users).where(eq(users[column], value)).limit(1))[0] ?? null;
}

async function linkOwner(db: AppDb, owner: UserRow, identity: TrustedIdentity): Promise<DataOwner> {
  if (owner.externalSubject !== identity.subject || owner.email !== identity.email) {
    if (owner.email !== identity.email) {
      const emailOwner = await findOwner(db, "email", identity.email);
      if (emailOwner && emailOwner.id !== owner.id)
        throw new Error("Trusted identity email is already linked to another data owner");
    }
    await db
      .update(users)
      .set({ externalSubject: identity.subject, email: identity.email })
      .where(eq(users.id, owner.id));
  }
  return { id: owner.id, username: owner.username };
}

async function createOwner(db: AppDb, identity: TrustedIdentity): Promise<DataOwner> {
  // Concurrent first requests (or a taken username) make the insert a no-op instead of an
  // error; the row for this subject then exists either way and is re-read below.
  for (let attempt = 0; attempt < 5; attempt++) {
    await db
      .insert(users)
      .values({
        id: randomUUID(),
        username: await uniqueUsername(db, identity.name),
        email: identity.email,
        externalSubject: identity.subject,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    const created =
      (await findOwner(db, "externalSubject", identity.subject)) ??
      (await findOwner(db, "email", identity.email));
    if (created) return linkOwner(db, created, identity);
  }
  throw new Error("Could not allocate a data owner for the trusted identity");
}

async function uniqueUsername(db: AppDb, preferred: string) {
  for (let index = 0; index < 100; index++) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const candidate = `${preferred.slice(0, 32 - suffix.length)}${suffix}`;
    const existing = (
      await db.select({ id: users.id }).from(users).where(eq(users.username, candidate)).limit(1)
    )[0];
    if (!existing) return candidate;
  }
  return `user-${randomUUID().slice(0, 8)}`;
}

function requiredHeader(value: string | null, name: string, max: number) {
  const clean = value?.trim() ?? "";
  if (!clean || clean.length > max || /[\r\n]/.test(clean))
    throw new Error(`Missing or invalid trusted identity header ${name}`);
  return clean;
}

function normalizeEmail(value: string) {
  const clean = value.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))
    throw new Error("Trusted identity has invalid email");
  return clean;
}

/** Reduces a display name to the label alphabet; non-Latin names fall back to a stable id. */
export function sanitizeUsername(value: string, subject: string) {
  const clean = value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return clean.length >= 3
    ? clean
    : `user-${createHash("sha256").update(subject).digest("hex").slice(0, 8)}`;
}
