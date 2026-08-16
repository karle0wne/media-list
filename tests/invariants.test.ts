import test from "node:test";
import assert from "node:assert/strict";
import { count } from "drizzle-orm";
import { media, userMedia } from "../src/db/schema";
import { createAdmin, createInvite, registerWithInvite } from "../src/lib/services/users";
import { addMediaToUser, listUserMedia, updateUserMedia } from "../src/lib/services/media";
import type { MediaCandidate } from "../src/lib/types";
import { parseCsv, stringifyCsv } from "../src/lib/csv";
import { openTestDatabase } from "./db";

const synthetic: MediaCandidate = { key: "ANILIST:999001:", type: "ANIME", source: "ANILIST", externalId: "999001", externalSubId: "", title: "Synthetic Anime", originalTitle: "Synthetic Original", countryCode: "JP", year: 2026, episodeCount: 12, runtimeMinutes: 288 };
async function twoUsers() { process.env.MAX_USERS = "5"; const bundle = openTestDatabase(); const admin = await createAdmin(bundle.db, "admin_user", "correct-horse-battery"); const invite = await createInvite(bundle.db, admin); const user = await registerWithInvite(bundle.db, invite, "second_user", "another-good-password"); return { ...bundle, admin, user }; }

test("user-media state is isolated by user id", async () => { const { db, sqlite, admin, user } = await twoUsers(); try { await addMediaToUser(db, admin, synthetic, { status: "COMPLETED", score: 9 }); const adminList = await listUserMedia(db, admin); assert.equal(adminList.length, 1); await updateUserMedia(db, user, adminList[0].userMediaId, { status: "DROPPED", score: 1, progressCurrent: 1, progressTotal: 12, notes: "should not apply", timeSpentOverrideMinutes: null }); const after = await listUserMedia(db, admin); assert.equal(after[0].status, "COMPLETED"); assert.equal(after[0].score, 9); assert.equal((await listUserMedia(db, user)).length, 0); } finally { sqlite.close(); } });

test("external identity is globally deduplicated while user state stays separate", async () => { const { db, sqlite, admin, user } = await twoUsers(); try { await addMediaToUser(db, admin, synthetic, { score: 8 }); await addMediaToUser(db, user, synthetic, { score: 5 }); const mediaCount = (await db.select({ value: count() }).from(media))[0].value; const stateCount = (await db.select({ value: count() }).from(userMedia))[0].value; assert.equal(mediaCount, 1); assert.equal(stateCount, 2); assert.equal((await listUserMedia(db, admin))[0].score, 8); assert.equal((await listUserMedia(db, user))[0].score, 5); } finally { sqlite.close(); } });

test("registration is invite-only, invite is one-time, and MAX_USERS is enforced", async () => { process.env.MAX_USERS = "2"; const { db, sqlite } = openTestDatabase(); try { const admin = await createAdmin(db, "admin_user", "correct-horse-battery"); const token = await createInvite(db, admin); await registerWithInvite(db, token, "invited_user", "another-good-password"); await assert.rejects(() => registerWithInvite(db, token, "third_user", "third-good-password")); await assert.rejects(() => createInvite(db, admin)); } finally { sqlite.close(); process.env.MAX_USERS = "5"; } });

test("CSV serializer round-trips provider identity and quoted user text", () => { const rows = [["external_source","external_id","notes"],["TMDB","1396","comma, quote \" and\nnewline"]]; const encoded = stringifyCsv(rows); assert.deepEqual(parseCsv(encoded), rows); });
