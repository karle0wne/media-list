import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { importBatches, importRows, media, userMedia } from "../src/db/schema";
import { signCandidate, verifyCandidate } from "../src/lib/candidate-token";
import { exportCanonical, importCanonical } from "../src/lib/services/canonical";
import {
  ProviderNetworkError,
  ProviderResponseError,
  ProviderTimeoutError,
} from "../src/lib/providers/http";
import {
  adoptTotalsForMedia,
  applyProviderCandidate,
  enrichMediaMetadata,
  enrichPendingBacklog,
  resetEnrichmentCooldowns,
} from "../src/lib/services/enrichment";
import { confirmBatch } from "../src/lib/services/imports";
import {
  addMediaToUser,
  addSelectedMediaToUser,
  listUserMedia,
  searchKey,
} from "../src/lib/services/media";
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
    assert.equal(processed.processed, 3);
    assert.deepEqual(processed.unfinished, []);
    assert.equal(calls, 3);
    assert.equal(
      (await db.select().from(media)).every((m) => m.metadataStatus === "READY"),
      true,
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

test("programmatic adds reject progress that cannot fit the total before writing anything", async () => {
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
    // A file with disagreeing numbers is restored, not rejected (see the reconcile test below).
    assert.deepEqual([report.imported, report.invalid], [2, 0]);
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

function threePending(db: ReturnType<typeof openTestDatabase>["db"], userId: string) {
  return Promise.all(
    ["1", "2", "3"].map((id) =>
      addSelectedMediaToUser(db, userId, { ...anime, externalId: id, key: `ANILIST:${id}:` }),
    ),
  );
}
const states = async (db: ReturnType<typeof openTestDatabase>["db"]) =>
  (await db.select().from(media)).map((m) => m.metadataStatus).sort();

test("a rate limit leaves records pending and the drain waits out a short pause", async () => {
  resetEnrichmentCooldowns();
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    await threePending(db, a);
    let calls = 0;
    const slept: number[] = [];
    await enrichPendingBacklog(db, {
      batch: 3,
      pauseMs: 0,
      sleep: async (ms) => {
        slept.push(ms);
        resetEnrichmentCooldowns(); // time passes
      },
      resolver: async (source, externalId) => {
        calls += 1;
        if (calls === 1) throw new ProviderResponseError("AniList", 429, 30);
        return { ...exact, source, externalId, key: `${source}:${externalId}:` };
      },
    });
    assert.equal(slept.length, 1);
    assert.ok(slept[0] > 29_000 && slept[0] <= 30_000, `waited ${slept[0]}ms`);
    assert.deepEqual(await states(db), ["READY", "READY", "READY"]);
  } finally {
    sqlite.close();
    resetEnrichmentCooldowns();
  }
});

test("a long provider pause is not waited out: records stay pending and later runs skip it", async () => {
  resetEnrichmentCooldowns();
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    await threePending(db, a);
    let calls = 0;
    const slept: number[] = [];
    const resolver = async () => {
      calls += 1;
      throw new ProviderResponseError("AniList", 429, 900);
    };
    await enrichPendingBacklog(db, {
      pauseMs: 0,
      resolver,
      sleep: async (ms) => void slept.push(ms),
    });
    assert.equal(calls, 1);
    assert.deepEqual(slept, []);
    assert.deepEqual(await states(db), ["PENDING", "PENDING", "PENDING"]);
    // The page-view recovery path leaves the provider alone while its pause lasts.
    const { enrichPendingMedia } = await import("../src/lib/services/enrichment");
    assert.deepEqual(await enrichPendingMedia(db, 3, resolver), []);
    assert.equal(calls, 1);
  } finally {
    sqlite.close();
    resetEnrichmentCooldowns();
  }
});

test("outages, timeouts and unreachable networks never turn a record into an error", async () => {
  for (const failure of [
    new ProviderResponseError("TMDB", 503, null),
    new ProviderTimeoutError(5000),
    new ProviderNetworkError("fetch failed"),
  ]) {
    resetEnrichmentCooldowns();
    const { db, sqlite } = openTestDatabase();
    try {
      const a = await createTestDataOwner(db);
      await threePending(db, a);
      let calls = 0;
      await enrichPendingBacklog(db, {
        pauseMs: 0,
        maxWaitMs: 0,
        resolver: async () => {
          calls += 1;
          throw failure;
        },
      });
      assert.equal(calls, 1, `${failure.name}: the provider is not hammered`);
      assert.deepEqual(await states(db), ["PENDING", "PENDING", "PENDING"], failure.name);
    } finally {
      sqlite.close();
      resetEnrichmentCooldowns();
    }
  }
});

test("a failure that will repeat is recorded as an error, and one provider's pause spares another", async () => {
  resetEnrichmentCooldowns();
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    await addSelectedMediaToUser(db, a, anime);
    await addSelectedMediaToUser(db, a, {
      ...anime,
      key: "OPENLIBRARY:OL1W:",
      source: "OPENLIBRARY",
      externalId: "OL1W",
      type: "BOOK",
    });
    await enrichPendingBacklog(db, {
      pauseMs: 0,
      maxWaitMs: 0,
      resolver: async (source, externalId) => {
        if (source === "ANILIST") throw new ProviderResponseError("AniList", 429, 900);
        return { ...exact, source, externalId, type: "BOOK", key: `${source}:${externalId}:` };
      },
    });
    const byStatus = Object.fromEntries(
      (await db.select().from(media)).map((m) => [m.externalSource, m.metadataStatus]),
    );
    assert.deepEqual(byStatus, { ANILIST: "PENDING", OPENLIBRARY: "READY" });

    const item = (await db.select().from(media).where(eq(media.externalSource, "ANILIST")))[0];
    resetEnrichmentCooldowns();
    const result = await enrichMediaMetadata(db, item.id, async () => {
      throw new Error("TMDB_API_TOKEN is not configured");
    });
    assert.equal(result.state, "error");
  } finally {
    sqlite.close();
    resetEnrichmentCooldowns();
  }
});

test("a CSV row for a record that is already READY still gets its total in the background", async () => {
  resetEnrichmentCooldowns();
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db, "user_a");
    const b = await createTestDataOwner(db, "user_b");
    await addMediaToUser(db, a, { ...exact, episodeCount: 220 });
    const report = await importCanonical(
      db,
      b,
      "external_source,external_id,type,status\nANILIST,777001,ANIME,COMPLETED\n",
    );
    assert.equal(report.needsEnrichment, false);
    assert.equal(report.totalLookups.length, 1);
    let [row] = await rows(db, b);
    assert.deepEqual([row.progressCurrent, row.progressTotal], [0, null]);

    await enrichPendingBacklog(db, {
      pauseMs: 0,
      totalLookups: report.totalLookups,
      resolver: async () => ({ ...exact, episodeCount: 220 }),
    });
    [row] = await rows(db, b);
    assert.deepEqual([row.progressCurrent, row.progressTotal], [220, 220]);
  } finally {
    sqlite.close();
  }
});

test("maintenance refresh goes through the same rules as enrichment", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    const added = await addSelectedMediaToUser(db, a, anime, { status: "COMPLETED" });
    await assert.rejects(
      applyProviderCandidate(db, added.item, { ...exact, externalId: "other" }),
      /identity/i,
    );
    await applyProviderCandidate(db, added.item, exact);
    const [row] = await rows(db, a);
    assert.deepEqual([row.progressCurrent, row.progressTotal], [12, 12]);
    assert.equal((await db.select().from(media))[0].metadataStatus, "READY");
  } finally {
    sqlite.close();
  }
});

test("a signed search result repairs an unverified shared record that a CSV created", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db, "user_a");
    const b = await createTestDataOwner(db, "user_b");
    await importCanonical(
      db,
      a,
      "external_source,external_id,type,title\nANILIST,777001,ANIME,Typo\n",
    );
    await addSelectedMediaToUser(db, b, { ...exact, title: "Real Title" }, {}, { trust: "signed" });
    const [item] = await db.select().from(media);
    assert.equal(item.title, "Real Title");
    assert.equal(item.metadataStatus, "PENDING", "enrichment still validates it");
  } finally {
    sqlite.close();
  }
});

test("a CSV row whose progress exceeds its total keeps the progress and drops the total", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    const report = await importCanonical(
      db,
      a,
      [
        "external_source,external_id,type,status,progress_current,progress_total",
        "ANILIST,21,ANIME,IN_PROGRESS,30,12",
        "TMDB,603,MOVIE,IN_PROGRESS,5,",
      ].join("\n"),
    );
    assert.deepEqual([report.imported, report.invalid, report.adjusted], [2, 0, 2]);
    const list = await listUserMedia(db, a);
    const onePiece = list.find((x) => x.externalId === "21")!;
    assert.deepEqual([onePiece.progressCurrent, onePiece.progressTotal], [30, null]);
    // The provider's total is adopted later only if the saved progress still fits it.
    const [row] = (await rows(db, a)).filter((r) => r.progressCurrent === 30);
    await enrichMediaMetadata(db, onePiece.mediaId, async () => ({ ...exact, episodeCount: 12 }));
    assert.equal((await rows(db, a)).find((r) => r.id === row.id)!.progressTotal, null);
  } finally {
    sqlite.close();
  }
});

test("a big CSV import hands control back to other work and has a row limit", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    const lines = ["external_source,external_id,type"];
    for (let i = 1; i <= 300; i += 1) lines.push(`ANILIST,${i},ANIME`);
    let ticks = 0;
    const timer = setInterval(() => (ticks += 1), 0);
    const report = await importCanonical(db, a, lines.join("\n"));
    clearInterval(timer);
    assert.equal(report.imported, 300);
    assert.ok(ticks > 0, "timers ran while the import was in progress");

    const tooMany = ["external_source,external_id,type"];
    for (let i = 1; i <= 5001; i += 1) tooMany.push(`ANILIST,${i},ANIME`);
    await assert.rejects(importCanonical(db, a, tooMany.join("\n")), /too many rows/);
  } finally {
    sqlite.close();
  }
});

test("records of an unconfigured provider fail at once without pacing, since nothing is sent", async () => {
  resetEnrichmentCooldowns();
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    for (const id of ["1", "2", "3", "4"])
      await addSelectedMediaToUser(db, a, {
        ...anime,
        key: `TMDB:${id}:`,
        source: "TMDB",
        externalId: id,
        type: "MOVIE",
      });
    const { ProviderNotConfiguredError } = await import("../src/lib/providers/http");
    const started = Date.now();
    await enrichPendingBacklog(db, {
      batch: 4,
      pauseMs: 400,
      resolver: async () => {
        throw new ProviderNotConfiguredError("TMDB_API_TOKEN");
      },
    });
    assert.ok(Date.now() - started < 800, "four records would take 1.2s if each were paced");
    assert.deepEqual(await states(db), ["ERROR", "ERROR", "ERROR", "ERROR"]);
    const [item] = await db.select().from(media);
    assert.equal(item.metadataError, "TMDB_API_TOKEN is not configured");
  } finally {
    sqlite.close();
  }
});

test("a record the provider keeps failing on becomes an error after a few attempts", async () => {
  resetEnrichmentCooldowns();
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    const added = await addSelectedMediaToUser(db, a, anime);
    let now = 1_000_000;
    const clock = () => now;
    const resolver = async () => {
      throw new ProviderResponseError("AniList", 503, null);
    };
    const results = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      results.push((await enrichMediaMetadata(db, added.item.id, resolver, clock)).state);
      now += 60 * 60_000; // the provider's pause is over before the next attempt
    }
    assert.deepEqual(results, ["deferred", "deferred", "deferred", "deferred", "error"]);
    const [item] = await db.select().from(media);
    assert.equal(item.metadataStatus, "ERROR");
    assert.match(item.metadataError ?? "", /temporarily unavailable/);
  } finally {
    sqlite.close();
    resetEnrichmentCooldowns();
  }
});

test("a single record is not sent to a provider that asked to be left alone", async () => {
  resetEnrichmentCooldowns();
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    const added = await addSelectedMediaToUser(db, a, anime);
    let calls = 0;
    const clock = () => 1_000_000;
    const limited = async () => {
      calls += 1;
      throw new ProviderResponseError("AniList", 429, 900);
    };
    assert.equal((await enrichMediaMetadata(db, added.item.id, limited, clock)).state, "deferred");
    assert.equal((await enrichMediaMetadata(db, added.item.id, limited, clock)).state, "deferred");
    assert.equal(calls, 1, "the second call respects the pause");
    assert.equal((await db.select().from(media))[0].metadataStatus, "PENDING");
  } finally {
    sqlite.close();
    resetEnrichmentCooldowns();
  }
});

test("a signed add puts a failed shared record back to pending", async () => {
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db, "user_a");
    const b = await createTestDataOwner(db, "user_b");
    await addSelectedMediaToUser(db, a, anime);
    await db.update(media).set({ metadataStatus: "ERROR", metadataError: "old failure" });
    const result = await addSelectedMediaToUser(db, b, exact, {}, { trust: "signed" });
    assert.equal(result.needsEnrichment, true);
    const [item] = await db.select().from(media);
    assert.deepEqual([item.metadataStatus, item.metadataError], ["PENDING", null]);
    assert.equal(item.title, "Canonical");
  } finally {
    sqlite.close();
  }
});

test("total lookups the provider could not serve are handed back, not dropped", async () => {
  resetEnrichmentCooldowns();
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db, "user_a");
    const b = await createTestDataOwner(db, "user_b");
    await addMediaToUser(db, a, { ...exact, episodeCount: 220 });
    const report = await importCanonical(
      db,
      b,
      "external_source,external_id,type,status\nANILIST,777001,ANIME,COMPLETED\n",
    );
    assert.equal(report.totalLookups.length, 1);

    const down = await enrichPendingBacklog(db, {
      pauseMs: 0,
      maxWaitMs: 0,
      totalLookups: report.totalLookups,
      resolver: async () => {
        throw new ProviderResponseError("AniList", 503, null);
      },
    });
    assert.deepEqual(down.unfinished, report.totalLookups);
    let [row] = await rows(db, b);
    assert.deepEqual([row.progressCurrent, row.progressTotal], [0, null]);

    resetEnrichmentCooldowns(); // the provider is back
    const up = await enrichPendingBacklog(db, {
      pauseMs: 0,
      totalLookups: down.unfinished,
      resolver: async () => ({ ...exact, episodeCount: 220 }),
    });
    assert.deepEqual(up.unfinished, []);
    [row] = await rows(db, b);
    assert.deepEqual([row.progressCurrent, row.progressTotal], [220, 220]);
  } finally {
    sqlite.close();
    resetEnrichmentCooldowns();
  }
});

test("a total lookup the provider keeps failing on is given up after a few attempts", async () => {
  resetEnrichmentCooldowns();
  const { db, sqlite } = openTestDatabase();
  try {
    const a = await createTestDataOwner(db);
    const added = await addMediaToUser(db, a, exact);
    let now = 1_000_000;
    const clock = () => now;
    const resolver = async () => {
      throw new ProviderResponseError("AniList", 503, null);
    };
    const states: string[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      states.push((await adoptTotalsForMedia(db, added.item.id, resolver, clock)).state);
      now += 60 * 60_000;
    }
    assert.deepEqual(states, ["deferred", "deferred", "deferred", "deferred", "error"]);
  } finally {
    sqlite.close();
    resetEnrichmentCooldowns();
  }
});
