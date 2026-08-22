import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { users } from "../src/db/schema";
import { hashPassword } from "../src/lib/crypto";
import { resolveExternalUser } from "../src/lib/services/external-users";
import { openTestDatabase } from "./db";

function legacyUser(overrides: Partial<typeof users.$inferInsert> = {}): typeof users.$inferInsert {
  return {
    id: "legacy-user",
    username: "legacy",
    passwordHash: hashPassword("long-enough-password"),
    role: "USER",
    active: true,
    createdAt: new Date(),
    ...overrides,
  };
}

test("links a legacy user by verified IAM email and syncs role", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    await db.insert(users).values(legacyUser({ email: "person@example.com" }));
    const id = await resolveExternalUser(db, { subject: "https://auth.example|sub-1", email: "person@example.com", preferredUsername: "person", role: "USER" });
    assert.equal(id, "legacy-user");
    const row = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    assert.equal(row.externalSubject, "https://auth.example|sub-1");
  } finally { sqlite.close(); }
});

test("migrates the single legacy admin to trusted IAM admin identity", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    await db.insert(users).values(legacyUser({ id: "admin", username: "admin", role: "ADMIN" }));
    const id = await resolveExternalUser(db, { subject: "https://auth.example|admin-sub", email: "admin@example.com", preferredUsername: "admin", role: "ADMIN" });
    assert.equal(id, "admin");
    const row = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    assert.equal(row.email, "admin@example.com");
    assert.equal(row.externalSubject, "https://auth.example|admin-sub");
    assert.equal(row.role, "ADMIN");
  } finally { sqlite.close(); }
});

test("creates a local business user only for an allowed IAM identity", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const id = await resolveExternalUser(db, { subject: "https://auth.example|new-sub", email: "new.user@example.com", preferredUsername: "new.user", role: "USER" });
    const row = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    assert.equal(row.username, "new.user");
    assert.equal(row.role, "USER");
    assert.equal(row.externalSubject, "https://auth.example|new-sub");
  } finally { sqlite.close(); }
});
