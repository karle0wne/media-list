import test from "node:test";
import assert from "node:assert/strict";
import { count } from "drizzle-orm";
import { users } from "../src/db/schema";
import { resolveTrustedIdentity, sanitizeUsername } from "../src/lib/identity";
import { openTestDatabase } from "./db";

const alex = { subject: "sub-alex", email: "alex@example.test", name: "alex" };
const otherAlex = { subject: "sub-other", email: "other@example.test", name: "alex" };

function totalChanges(sqlite: ReturnType<typeof openTestDatabase>["sqlite"]) {
  return (sqlite.prepare("SELECT total_changes() AS value").get() as { value: number }).value;
}

test("two people with the same gateway name keep distinct, stable data owners", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const first = await resolveTrustedIdentity(db, alex);
    const second = await resolveTrustedIdentity(db, otherAlex);
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.username, second.username);

    // The failure used to appear on the *second* request of the second person.
    for (let request = 0; request < 3; request++) {
      assert.deepEqual(await resolveTrustedIdentity(db, otherAlex), second);
      assert.deepEqual(await resolveTrustedIdentity(db, alex), first);
    }
  } finally {
    sqlite.close();
  }
});

test("a repeated request for an unchanged identity performs no writes", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    await resolveTrustedIdentity(db, alex);
    const before = totalChanges(sqlite);
    await resolveTrustedIdentity(db, alex);
    assert.equal(totalChanges(sqlite), before);
  } finally {
    sqlite.close();
  }
});

test("concurrent first requests create exactly one data owner", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const [a, b] = await Promise.all([
      resolveTrustedIdentity(db, alex),
      resolveTrustedIdentity(db, alex),
    ]);
    assert.deepEqual(a, b);
    assert.equal((await db.select({ value: count() }).from(users))[0].value, 1);
  } finally {
    sqlite.close();
  }
});

test("an existing owner is linked once by verified email and keeps its username", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    sqlite
      .prepare("INSERT INTO users(id, username, email, created_at) VALUES (?, ?, ?, ?)")
      .run("legacy", "legacy_name", "alex@example.test", Date.now());
    const owner = await resolveTrustedIdentity(db, alex);
    assert.deepEqual(owner, { id: "legacy", username: "legacy_name" });
    const row = sqlite.prepare("SELECT external_subject FROM users WHERE id = 'legacy'").get() as {
      external_subject: string;
    };
    assert.equal(row.external_subject, "sub-alex");
  } finally {
    sqlite.close();
  }
});

test("changing the gateway email to one owned by someone else is rejected", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    await resolveTrustedIdentity(db, alex);
    await resolveTrustedIdentity(db, otherAlex);
    await assert.rejects(
      resolveTrustedIdentity(db, { ...otherAlex, email: alex.email }),
      /already linked to another data owner/,
    );
  } finally {
    sqlite.close();
  }
});

test("non-Latin display names fall back to a label that is stable per subject", () => {
  const first = sanitizeUsername("Анатолий", "subject-1");
  assert.match(first, /^user-[0-9a-f]{8}$/);
  assert.equal(sanitizeUsername("Анатолий", "subject-1"), first);
  assert.notEqual(sanitizeUsername("Анатолий", "subject-2"), first);
  assert.equal(sanitizeUsername("Alex Smith", "subject-1"), "alex-smith");
});
