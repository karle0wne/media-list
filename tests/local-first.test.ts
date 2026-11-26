import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { importBatches, importRows, media, userMedia } from "../src/db/schema";
import { signCandidate, verifyCandidate } from "../src/lib/candidate-token";
import { exportCanonical, importCanonical } from "../src/lib/services/canonical";
import { ProviderResponseError } from "../src/lib/providers/http";
import { enrichMediaMetadata, enrichPendingBacklog } from "../src/lib/services/enrichment";
import { confirmBatch } from "../src/lib/services/imports";
import { addSelectedMediaToUser, listUserMedia, searchKey } from "../src/lib/services/media";
import type { MediaCandidate } from "../src/lib/types";
import { createTestDataOwner, openTestDatabase } from "./db";

const anime: MediaCandidate = {
  key: "ANILIST:777001:",
  type: "ANIME",
  source: "ANILIST",
  externalId: "777001",
  externalSubId: "",
  title: "Search Result",
};
const exact: MediaCandidate = { ...anime, title: "Canonical", episodeCount: 12 };

function rows(db: ReturnType<typeof openTestDatabase>["db"], userId: string) {
  return db.select().from(userMedia).where(eq(userMedia.userId, userId));
}

test("enrichment adopts a total only for rows without one and leaves other users' data alone", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db, "user_a");
    const b = await createTestDataOwner(db, "user_b");
    const added = await addSelectedMediaToUser(db, a, anime, { status: "COMPLETED" });
    await addSelectedMediaToUser(db, b, anime, {
      status: "COMPLETED",
      progressCurrent: 24,
      progressTotal: 24,
      updatedAt: new Date("2020-01-01T00:00:00Z"),
    });
    await enrichMediaMetadata(db, added.item.id, async () => exact);

    const [rowA] = await rows(db, a);
    assert.deepEqual([rowA.progressCurrent, rowA.progressTotal], [12, 12]);
    const [rowB] = await rows(db, b);
    // The user's own known total (24) must not be replaced by the provider's, nor bumped.
    assert.deepEqual([rowB.progressCurrent, rowB.progressTotal], [24, 24]);
    assert.equal(rowB.updatedAt.toISOString(), "2020-01-01T00:00:00.000Z");
  } finally {
    sqlite.close();
  }
});

test("a user's progress above the provider total is kept instead of being clamped", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db, "user_a");
    const added = await addSelectedMediaToUser(db, a, anime, { progressCurrent: 30 });
    await enrichMediaMetadata(db, added.item.id, async () => exact);
    const [row] = await rows(db, a);
    assert.deepEqual([row.progressCurrent, row.progressTotal], [30, null]);
  } finally {
    sqlite.close();
  }
});

test("another user's CSV cannot retitle a shared record that is not verified yet", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db, "user_a");
    const b = await createTestDataOwner(db, "user_b");
    await addSelectedMediaToUser(db, a, anime);
    await addSelectedMediaToUser(db, b, { ...anime, title: "Evil title" });
    const [item] = await db.select().from(media);
    assert.equal(item.title, "Search Result");
  } finally {
    sqlite.close();
  }
});

test("library search folds Cyrillic case, matches romanized titles and treats % literally", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    await addSelectedMediaToUser(db, a, {
      ...anime,
      externalId: "1",
      key: "ANILIST:1:",
      title: "Наруто",
      romanizedTitle: "Naruto",
    });
    await addSelectedMediaToUser(db, a, {
      ...anime,
      externalId: "2",
      key: "ANILIST:2:",
      title: "100% Pure",
    });
    const titles = async (q: string) => (await listUserMedia(db, a, { q })).map((x) => x.title);
    assert.deepEqual(await titles("наруто"), ["Наруто"]);
    assert.deepEqual(await titles("NARUTO"), ["Наруто"]);
    assert.deepEqual(await titles("%"), ["100% Pure"]);
    assert.deepEqual(await titles("_"), []);
    assert.equal(searchKey("Ёлка"), searchKey("елка"));
    assert.equal(searchKey("Café"), searchKey("cafe"));
    assert.notEqual(searchKey("й"), searchKey("и"));
    assert.notEqual(searchKey("が"), searchKey("か"));
  } finally {
    sqlite.close();
  }
});

test("confirming a quick import saves from staged candidates without calling a provider", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    await db
      .insert(importBatches)
      .values({ id: "batch", userId: a, kind: "QUICK", createdAt: new Date() });
    await db.insert(importRows).values({
      id: "row1",
      batchId: "batch",
      rawInput: "naruto",
      userDataJson: "{}",
      candidatesJson: JSON.stringify([anime]),
      state: "PENDING",
      errorMessage: null,
      createdAt: new Date(),
    });
    const report = await confirmBatch(db, a, "batch", { row1: anime.key });
    assert.deepEqual(report, { imported: 1, skipped: 0, invalid: 0, needsEnrichment: true });
    const [item] = await db.select().from(media);
    assert.equal(item.metadataStatus, "PENDING");
    assert.equal((await rows(db, a)).length, 1);
  } finally {
    sqlite.close();
  }
});

test("canonical CSV restores locally with dates, validates identities and round-trips", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    const csv = [
      "external_source,external_id,external_sub_id,type,title,status,score,progress_current,progress_total,notes,created_at,updated_at",
      "ANILIST,21,,ANIME,One Piece,IN_PROGRESS,9,5,,note,2021-03-04T05:06:07.000Z,2022-01-02T03:04:05.000Z",
      "TMDB,603,,MOVIE,,COMPLETED,,,,,,",
      "ANILIST,abc,,ANIME,Broken,,,,,,,",
      "ANILIST,21,,ANIME,One Piece,,,,,,,",
      "TMDB,1399,season:1,SERIES,Season,,,,,,not-a-date,",
    ].join("\n");
    const report = await importCanonical(db, a, csv);
    assert.equal(report.imported, 2);
    assert.equal(report.duplicates, 1);
    assert.equal(report.invalid, 2);
    assert.equal(report.needsEnrichment, true);

    const list = await listUserMedia(db, a);
    const onePiece = list.find((x) => x.externalId === "21")!;
    assert.equal(onePiece.createdAt.toISOString(), "2021-03-04T05:06:07.000Z");
    assert.equal(onePiece.updatedAt.toISOString(), "2022-01-02T03:04:05.000Z");
    const movie = list.find((x) => x.externalId === "603")!;
    assert.equal(
      movie.title,
      "TMDB:603:",
      "a missing title falls back to the identity until enriched",
    );

    const exported = await exportCanonical(db, a);
    const other = await createTestDataOwner(db, "user_b");
    const again = await importCanonical(db, other, exported);
    assert.equal(again.imported, 2);
    assert.equal(again.invalid, 0);
  } finally {
    sqlite.close();
  }
});

test("the backlog drain completes pending records", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    for (const id of ["1", "2", "3"])
      await addSelectedMediaToUser(db, a, {
        ...anime,
        externalId: id,
        key: `ANILIST:${id}:`,
      });
    let calls = 0;
    const processed = await enrichPendingBacklog(db, {
      batch: 2,
      pauseMs: 0,
      resolver: async (source, externalId) => {
        calls += 1;
        return { ...exact, source, externalId, key: `${source}:${externalId}:`, episodeCount: 1 };
      },
    });
    assert.equal(processed, 3);
    assert.equal(calls, 3);
    assert.equal(
      (await db.select().from(media)).every((m) => m.metadataStatus === "READY"),
      true,
    );
  } finally {
    sqlite.close();
  }
});

test("a rate limit stops the drain and every record stays pending for a later pass", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    for (const id of ["1", "2", "3"])
      await addSelectedMediaToUser(db, a, { ...anime, externalId: id, key: `ANILIST:${id}:` });
    let calls = 0;
    await enrichPendingBacklog(db, {
      batch: 3,
      pauseMs: 0,
      resolver: async () => {
        calls += 1;
        throw new ProviderResponseError("AniList", 429, 30);
      },
    });
    assert.equal(calls, 1);
    const states = (await db.select().from(media)).map((m) => m.metadataStatus).sort();
    assert.deepEqual(
      states,
      ["PENDING", "PENDING", "PENDING"],
      "a rate limit is not an item error",
    );
  } finally {
    sqlite.close();
  }
});

test("candidate tokens are verifiable, tamper-proof and expire", () => {
  const secret = "test-secret";
  const now = 1_000_000;
  const token = signCandidate(anime, now, secret);
  assert.equal(verifyCandidate(token, now + 1000, secret)?.title, "Search Result");
  assert.equal(verifyCandidate(token, now + 2 * 60 * 60 * 1000, secret), null);
  assert.equal(verifyCandidate(token, now, "other-secret"), null);
  const [payload, signature] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({ candidate: { ...anime, title: "Evil" }, exp: now + 1000 }),
  ).toString("base64url");
  assert.equal(verifyCandidate(`${forged}.${signature}`, now, secret), null);
  assert.equal(verifyCandidate(`${payload}`, now, secret), null);
  const malformed = signCandidate({ ...anime, externalId: "not-a-number" }, now, secret);
  assert.equal(verifyCandidate(malformed, now, secret), null);
});

test("progress that cannot fit the known total is rejected before anything is written", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    const movie: MediaCandidate = {
      ...anime,
      key: "TMDB:603:",
      source: "TMDB",
      externalId: "603",
      type: "MOVIE",
    };
    await assert.rejects(
      addSelectedMediaToUser(db, a, movie, { progressCurrent: 5 }),
      /cannot exceed the known total \(1\)/,
    );
    await assert.rejects(
      addSelectedMediaToUser(db, a, anime, { progressCurrent: 30, progressTotal: 12 }),
      /cannot exceed the known total \(12\)/,
    );
    assert.equal((await db.select().from(media)).length, 0, "no shared record is left behind");
    assert.equal((await rows(db, a)).length, 0);

    const report = await importCanonical(
      db,
      a,
      [
        "external_source,external_id,external_sub_id,type,title,progress_current,progress_total",
        "ANILIST,21,,ANIME,One Piece,30,12",
        "ANILIST,22,,ANIME,Fine,3,12",
      ].join("\n"),
    );
    assert.deepEqual([report.imported, report.invalid], [1, 1]);
  } finally {
    sqlite.close();
  }
});

test("a CSV title is flattened and capped before it reaches the shared catalogue", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    const long = "x".repeat(500);
    await importCanonical(
      db,
      a,
      `external_source,external_id,type,title\nANILIST,31,ANIME,"Line one\nline\u0000 two"\nANILIST,32,ANIME,${long}`,
    );
    const titles = (await db.select().from(media)).map((m) => m.title).sort();
    assert.deepEqual(titles, ["Line one line two", long.slice(0, 200)].sort());
  } finally {
    sqlite.close();
  }
});
