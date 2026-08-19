import type { ExternalSource, MediaCandidate, MediaType } from "../types";
import { getAniListById, getAniListByMalId, searchAniList } from "./anilist";
import { findTmdbByImdb, getTmdbMovie, getTmdbSeason, getTmdbShowSeasons, searchTmdb, searchTmdbMovies, searchTmdbShows, type TmdbShowCandidate } from "./tmdb";
import { getOpenLibraryWork, searchOpenLibrary } from "./openlibrary";
import { getRawgGame, rawgConfigured, searchRawgGames } from "./rawg";
import { englishAliasesFor } from "./wikidata";

export { rawgConfigured } from "./rawg";

export async function searchMediaByType(type: MediaType, query: string): Promise<MediaCandidate[]> {
  if (type === "ANIME") return searchAnime(query, 10);
  if (type === "MOVIE") return searchTmdbMovies(query, 10);
  if (type === "BOOK") return searchOpenLibrary(query, 10);
  if (type === "GAME") return searchGames(query, 10);
  return [];
}

export async function searchSeriesShows(query: string): Promise<TmdbShowCandidate[]> { return searchTmdbShows(query, 10); }
export async function getSeriesSeasons(seriesId: string): Promise<MediaCandidate[]> { return getTmdbShowSeasons(seriesId); }

export async function searchAllProviders(query: string): Promise<MediaCandidate[]> {
  const isCyrillic = /[\u0400-\u04ff]/.test(query);
  const tasks: Array<Promise<MediaCandidate[]>> = isCyrillic ? [searchTmdb(query, 4), searchOpenLibrary(query, 4)] : [searchAniList(query, 4), searchTmdb(query, 4), searchOpenLibrary(query, 4)];
  if (rawgConfigured()) tasks.push(searchGames(query, 4));
  const direct = await Promise.allSettled(tasks);
  const candidates = direct.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (isCyrillic) {
    const aliases = await englishAliasesFor(query);
    for (const alias of aliases.slice(0, 1)) {
      try { candidates.push(...await searchAniList(alias, 3)); } catch {}
    }
  }
  return dedupeCandidates(candidates).slice(0, 18);
}

export async function resolveExact(source: ExternalSource, externalId: string, externalSubId = "", type?: MediaType): Promise<MediaCandidate | null> {
  if (source === "ANILIST") return getAniListById(externalId);
  if (source === "OPENLIBRARY") return getOpenLibraryWork(externalId);
  if (source === "RAWG") return getRawgGame(externalId);
  if (source === "TMDB") {
    if (externalSubId) return getTmdbSeason(externalId, externalSubId);
    if (type === "MOVIE") return getTmdbMovie(externalId);
    return null;
  }
  return null;
}

export async function resolveExternalUrl(raw: string): Promise<MediaCandidate[]> {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return []; }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "anilist.co") { const id = url.pathname.match(/\/anime\/(\d+)/)?.[1]; if (!id) return []; const item = await getAniListById(id); return item ? [item] : []; }
  if (host === "myanimelist.net") { const id = url.pathname.match(/\/anime\/(\d+)/)?.[1]; if (!id) return []; const item = await getAniListByMalId(id); return item ? [item] : []; }
  if (host === "themoviedb.org") { const movie = url.pathname.match(/\/movie\/(\d+)/)?.[1]; if (movie) { const item = await getTmdbMovie(movie); return item ? [item] : []; } const tv = url.pathname.match(/\/tv\/(\d+)/)?.[1]; const season = url.pathname.match(/\/season\/(\d+)/)?.[1]; if (tv && season) { const item = await getTmdbSeason(tv, `season:${season}`); return item ? [item] : []; } if (tv) return getTmdbShowSeasons(tv); }
  if (host === "imdb.com") { const id = url.pathname.match(/\/title\/(tt\d+)/)?.[1]; return id ? findTmdbByImdb(id) : []; }
  if (host === "openlibrary.org") { const id = url.pathname.match(/\/works\/(OL\d+W)/i)?.[1]; if (!id) return []; const item = await getOpenLibraryWork(id); return item ? [item] : []; }
  if (host === "rawg.io") { const slug = url.pathname.match(/^\/games\/([a-z0-9][a-z0-9-]*)\/?$/i)?.[1]; if (!slug || !rawgConfigured()) return []; const item = await getRawgGame(slug); return item ? [item] : []; }
  return [];
}

export function parseCandidateKey(key: string) { const [source, externalId, ...rest] = key.split(":"); const externalSubId = rest.join(":"); if (!(["ANILIST", "TMDB", "OPENLIBRARY", "RAWG"] as string[]).includes(source) || !externalId) return null; return { source: source as ExternalSource, externalId, externalSubId }; }

async function searchAnime(query: string, limit: number) {
  const direct = await searchAniList(query, limit);
  if (direct.length || !/[\u0400-\u04ff]/.test(query)) return direct;
  const aliases = await englishAliasesFor(query);
  for (const alias of aliases.slice(0, 1)) {
    try { const resolved = await searchAniList(alias, limit); if (resolved.length) return resolved; } catch {}
  }
  return [];
}

async function searchGames(query: string, limit: number) {
  const direct = await searchRawgGames(query, limit);
  if (direct.length || !/[\u0400-\u04ff]/.test(query)) return direct;
  const aliases = await englishAliasesFor(query);
  for (const alias of aliases.slice(0, 2)) {
    try { const resolved = await searchRawgGames(alias, limit); if (resolved.length) return resolved; } catch {}
  }
  return [];
}

function dedupeCandidates(items: MediaCandidate[]) { const seen = new Set<string>(); return items.filter((item) => { if (seen.has(item.key)) return false; seen.add(item.key); return true; }); }
