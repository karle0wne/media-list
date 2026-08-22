import { randomUUID } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import type { AppDb } from "@/db";
import { users } from "@/db/schema";
import type { OidcIdentity } from "@/lib/oidc";
import { hashPassword, randomToken } from "@/lib/crypto";
import { maxUsers } from "@/lib/env";

export async function resolveExternalUser(db: AppDb, identity: OidcIdentity) {
  const bySubject = (await db.select().from(users).where(eq(users.externalSubject, identity.subject)).limit(1))[0];
  if (bySubject) {
    if (!bySubject.active) throw new Error("This account is disabled");
    await synchronizeIdentity(db, bySubject.id, identity);
    return bySubject.id;
  }

  const byEmail = (await db.select().from(users).where(eq(users.email, identity.email)).limit(1))[0];
  if (byEmail) {
    if (!byEmail.active) throw new Error("This account is disabled");
    if (byEmail.externalSubject && byEmail.externalSubject !== identity.subject) throw new Error("This email is already linked to another identity");
    await synchronizeIdentity(db, byEmail.id, identity);
    return byEmail.id;
  }

  if (identity.role === "ADMIN") {
    const unlinkedAdmins = await db.select().from(users).where(and(eq(users.role, "ADMIN"), eq(users.active, true), isNull(users.externalSubject)));
    if (unlinkedAdmins.length === 1) {
      await synchronizeIdentity(db, unlinkedAdmins[0].id, identity);
      return unlinkedAdmins[0].id;
    }
    if (unlinkedAdmins.length > 1) throw new Error("Administrator identity migration is ambiguous");
  }

  const userCount = (await db.select({ value: count() }).from(users))[0]?.value ?? 0;
  if (userCount >= maxUsers()) throw new Error(`User limit (${maxUsers()}) reached`);
  const id = randomUUID();
  await db.insert(users).values({
    id,
    username: await uniqueUsername(db, identity.preferredUsername || identity.email.split("@")[0]),
    email: identity.email,
    externalSubject: identity.subject,
    passwordHash: hashPassword(randomToken()),
    role: identity.role,
    active: true,
    createdAt: new Date(),
  });
  return id;
}

async function synchronizeIdentity(db: AppDb, userId: string, identity: OidcIdentity) {
  const emailOwner = (await db.select({ id: users.id }).from(users).where(eq(users.email, identity.email)).limit(1))[0];
  if (emailOwner && emailOwner.id !== userId) throw new Error("This email is already assigned to another user");
  await db.update(users).set({ externalSubject: identity.subject, email: identity.email, role: identity.role }).where(eq(users.id, userId));
}

async function uniqueUsername(db: AppDb, preferred: string) {
  const stem = sanitizeUsername(preferred);
  for (let index = 0; index < 100; index++) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const candidate = `${stem.slice(0, 32 - suffix.length)}${suffix}`;
    const existing = (await db.select({ id: users.id }).from(users).where(eq(users.username, candidate)).limit(1))[0];
    if (!existing) return candidate;
  }
  return `oidc-${randomUUID().slice(0, 8)}`;
}

function sanitizeUsername(value: string) {
  const clean = value.trim().replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return clean.length >= 3 ? clean : `user-${randomUUID().slice(0, 8)}`;
}
