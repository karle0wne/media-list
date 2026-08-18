import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { media, userMedia } from "../src/db/schema";
import { enrichMediaMetadata } from "../src/lib/services/enrichment";
import { addSelectedMediaToUser, retryMediaMetadata } from "../src/lib/services/media";
import { createAdmin } from "../src/lib/services/users";
import type { MediaCandidate } from "../src/lib/types";
import { openTestDatabase } from "./db";

const provisional: MediaCandidate = {
  key: "ANILIST:999002:",
  type: "ANIME",
  source: "ANILIST",
  externalId: "999002",
  externalSubId: "",
  title: "Search Result",
  year: 2026,
};

const exact: MediaCandidate = {
  ...provisional,
  title: "Provider Canonical Title",
  episodeCount: 12,
  runtimeMinutes: 288,
  coverUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/test.jpg",
};

test("manual selection is durable before provider enrichment and later becomes canonical", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const userId = await createAdmin(db, "admin_user", "correct-horse-battery");
    const added = await addSelectedMediaToUser(db, userId, provisional);
    assert.equal(added.inserted, true);
    assert.equal(added.needsEnrichment, true);

    const before = (await db.select().from(media).where(eq(media.id, added.item.id)).limit(1))[0];
    assert.equal(before.title, "Search Result");
    assert.equal(before.metadataStatus, "PENDING");

    const result = await enrichMediaMetadata(db, added.item.id, async () => exact);
    assert.equal(result.state, "ready");
    const after = (await db.select().from(media).where(eq(media.id, added.item.id)).limit(1))[0];
    assert.equal(after.title, "Provider Canonical Title");
    assert.equal(after.coverUrl, exact.coverUrl);
    assert.equal(after.metadataStatus, "READY");
    assert.equal(after.metadataError, null);
    const state = (await db.select().from(userMedia).where(eq(userMedia.mediaId, added.item.id)).limit(1))[0];
    assert.equal(state.progressTotal, 12);
  } finally {
    sqlite.close();
  }
});

test("provider failure keeps the added item and exposes a durable retry state", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const userId = await createAdmin(db, "admin_user", "correct-horse-battery");
    const added = await addSelectedMediaToUser(db, userId, provisional);
    const result = await enrichMediaMetadata(db, added.item.id, async () => { throw new Error("provider unavailable"); });
    assert.equal(result.state, "error");
    let item = (await db.select().from(media).where(eq(media.id, added.item.id)).limit(1))[0];
    assert.equal(item.metadataStatus, "ERROR");
    assert.equal(item.metadataError, "provider unavailable");
    assert.equal((await db.select().from(userMedia).where(eq(userMedia.mediaId, added.item.id))).length, 1);

    assert.equal(await retryMediaMetadata(db, userId, added.item.id), true);
    item = (await db.select().from(media).where(eq(media.id, added.item.id)).limit(1))[0];
    assert.equal(item.metadataStatus, "PENDING");
    assert.equal(item.metadataError, null);
  } finally {
    sqlite.close();
  }
});
