import test from "node:test";
import assert from "node:assert/strict";
import { addMediaToUser, listUserMedia, updateUserMedia } from "../src/lib/services/media";
import { updateUserProgress } from "../src/lib/services/progress";
import type { MediaCandidate } from "../src/lib/types";
import { createTestDataOwner, openTestDatabase } from "./db";

const anime: MediaCandidate = {
  key: "ANILIST:101:",
  type: "ANIME",
  source: "ANILIST",
  externalId: "101",
  externalSubId: "",
  title: "Anime",
  year: 2024,
  episodeCount: 12,
};
const book: MediaCandidate = {
  key: "OPENLIBRARY:OL101W:",
  type: "BOOK",
  source: "OPENLIBRARY",
  externalId: "OL101W",
  externalSubId: "",
  title: "Book",
  year: 2020,
  pageCount: 300,
};

test("default list sorting follows user updates", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const user = await createTestDataOwner(db);
    await addMediaToUser(db, user, anime, { status: "IN_PROGRESS", progressCurrent: 2 });
    await addMediaToUser(db, user, book, { status: "PLANNED" });
    const rows = await listUserMedia(db, user, { sort: "title", direction: "asc" });
    const animeRow = rows.find((row) => row.title === "Anime")!;
    const bookRow = rows.find((row) => row.title === "Book")!;
    sqlite
      .prepare("UPDATE user_media SET updated_at=? WHERE id=?")
      .run(1_000, animeRow.userMediaId);
    sqlite.prepare("UPDATE user_media SET updated_at=? WHERE id=?").run(2_000, bookRow.userMediaId);
    assert.deepEqual(
      (await listUserMedia(db, user)).map((row) => row.title),
      ["Book", "Anime"],
    );
    await updateUserMedia(db, user, animeRow.userMediaId, { score: 8 });
    assert.equal((await listUserMedia(db, user))[0].title, "Anime");
    sqlite
      .prepare("UPDATE user_media SET updated_at=? WHERE id=?")
      .run(1_000, animeRow.userMediaId);
    await updateUserProgress(db, user, animeRow.userMediaId, 3);
    const updated = sqlite
      .prepare("SELECT updated_at FROM user_media WHERE id=?")
      .get(animeRow.userMediaId) as { updated_at: number };
    assert.ok(updated.updated_at > 1_000);
  } finally {
    sqlite.close();
  }
});
