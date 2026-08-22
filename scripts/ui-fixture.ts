import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../src/db";
import { sessions, users } from "../src/db/schema";
import { hashToken, randomToken } from "../src/lib/crypto";
import { addMediaToUser } from "../src/lib/services/media";
import type { MediaCandidate } from "../src/lib/types";

export const UI_PROOF_SESSION_TOKEN = "ui-proof-session-token";
const ADMIN_USERNAME = "admin_ui";
const longNotes = [
  "First line of a deliberately long note used by the UI proof.",
  "Second line keeps the preview representative.",
  "Third line exercises multiline wrapping.",
  "Fourth line should still be visible in the collapsed preview.",
  "Fifth line is the collapsed boundary.",
  "Sixth line must stay hidden until the row is expanded.",
  "Seventh line verifies that the editor has real content to resize around.",
].join("\n");

const candidates: Array<{ candidate: MediaCandidate; state: Parameters<typeof addMediaToUser>[3] }> = [
  { candidate: { key: "ANILIST:16498:", type: "ANIME", source: "ANILIST", externalId: "16498", externalSubId: "", title: "Attack on Titan", originalTitle: "進撃の巨人", romanizedTitle: "Shingeki no Kyojin", year: 2013, episodeCount: 25, externalUrl: "https://anilist.co/anime/16498", coverUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/ui-proof.jpg" }, state: { status: "COMPLETED", score: 9 } },
  { candidate: { key: "OPENLIBRARY:OL66554W:", type: "BOOK", source: "OPENLIBRARY", externalId: "OL66554W", externalSubId: "", title: "Pride and Prejudice", originalTitle: "Pride and Prejudice", year: 1813, pageCount: 351, externalUrl: "https://openlibrary.org/works/OL66554W", coverUrl: "https://covers.openlibrary.org/b/id/ui-proof-M.jpg" }, state: { status: "ON_HOLD", score: 8, progressCurrent: 120, notes: longNotes } },
  { candidate: { key: "TMDB:438631:", type: "MOVIE", source: "TMDB", externalId: "438631", externalSubId: "", title: "Dune", year: 2021, externalUrl: "https://www.themoviedb.org/movie/438631", coverUrl: "https://image.tmdb.org/t/p/w185/ui-proof.jpg" }, state: { status: "PLANNED" } },
  { candidate: { key: "TMDB:1396:season:1", type: "SERIES", source: "TMDB", externalId: "1396", externalSubId: "season:1", title: "Breaking Bad — Season 1", originalTitle: "Breaking Bad", year: 2008, episodeCount: 7, externalUrl: "https://www.themoviedb.org/tv/1396/season/1" }, state: { status: "IN_PROGRESS", progressCurrent: 3 } },
  { candidate: { key: "RAWG:972995:", type: "GAME", source: "RAWG", externalId: "972995", externalSubId: "", title: "Grand Theft Auto VI", year: 2026, externalUrl: "https://rawg.io/games/972995", coverUrl: "https://media.rawg.io/media/games/ui-proof.jpg" }, state: { status: "PLANNED" } },
];

async function main() {
  const { db, sqlite } = getDatabase();
  try {
    const adminId = randomUUID();
    const readerId = randomUUID();
    const unreachablePasswordHash = `oidc-only:${randomToken(32)}`;
    const createdAt = new Date();
    await db.insert(users).values([
      { id: adminId, username: ADMIN_USERNAME, email: "admin-ui@example.com", externalSubject: "https://central-auth.example.test|admin-ui", passwordHash: unreachablePasswordHash, role: "ADMIN", active: true, createdAt },
      { id: readerId, username: "reader_ui", email: "reader-ui@example.com", externalSubject: "https://central-auth.example.test|reader-ui", passwordHash: unreachablePasswordHash, role: "USER", active: true, createdAt },
    ]);
    await db.insert(sessions).values({
      tokenHash: hashToken(UI_PROOF_SESSION_TOKEN),
      userId: adminId,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 86_400_000),
    });
    for (const { candidate, state } of candidates) await addMediaToUser(db, adminId, candidate, state);
    console.log(`UI fixture ready: ${ADMIN_USERNAME}`);
  } finally {
    sqlite.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
