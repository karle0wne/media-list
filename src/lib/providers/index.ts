import type { ExternalSource, MediaCandidate, MediaType } from "../types";
import { getAniListById, getAniListByMalId, searchAniList } from "./anilist";
import {
  findTmdbByImdb,
  getTmdbMovie,
  getTmdbSeason,
  getTmdbShowSeasons,
  searchTmdb,
  searchTmdbMovies,
  searchTmdbShows,
  type TmdbShowCandidate,
} from "./tmdb";
import { getOpenLibraryWork, searchOpenLibrary } from "./openlibrary";
import { getRawgGame, rawgConfigured, searchRawgGames } from "./rawg";
import { englishAliasesFor } from "./wikidata";

export { rawgConfigured } from "./rawg";
const CYRILLIC = /[\u0400-\u04ff]/;
const ALIAS_DISCOVERY_THRESHOLD = 3;

export async function searchMediaByType(type: MediaType, query: string): Promise<MediaCandidate[]> {
  if (type === "ANIME") return searchAnime(query, 10);
  if (type === "MOVIE") return searchTmdbMovies(query, 10);
  if (type === "BOOK") return searchOpenLibrary(query, 10);
  if (type === "GAME") return searchGames(query, 10);
  return [];
}
export async function searchSeriesShows(query: string): Promise<TmdbShowCandidate[]> {
  return searchTmdbShows(query, 10);
}
export async function getSeriesSeasons(seriesId: string): Promise<MediaCandidate[]> {
  return getTmdbShowSeasons(seriesId);
}

export async function searchAllProviders(query: string): Promise<MediaCandidate[]> {
  const isCyrillic = CYRILLIC.test(query);
  const tasks: Array<Promise<MediaCandidate[]>> = isCyrillic
    ? [searchTmdb(query, 4), searchOpenLibrary(query, 4)]
    : [searchAniList(query, 4), searchTmdb(query, 4), searchOpenLibrary(query, 4)];
  if (rawgConfigured()) tasks.push(searchGames(query, 4));
  const direct = await Promise.allSettled(tasks);
  const candidates = direct.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (isCyrillic) {
    const aliases = await englishAliasesFor(query);
    for (const alias of aliases.slice(0, 1)) {
      try {
        candidates.push(...(await searchAniList(alias, 3)));
      } catch {}
    }
  }
  return dedupeCandidates(candidates).slice(0, 18);
}

type ExactLookup = (
  externalId: string,
  externalSubId: string,
  type?: MediaType,
) => Promise<MediaCandidate | null>;

// One entry per source; `satisfies` makes the table exhaustive (see providers/catalog.ts).
const exactLookups = {
  ANILIST: (externalId) => getAniListById(externalId),
  OPENLIBRARY: (externalId) => getOpenLibraryWork(externalId),
  RAWG: (externalId) => getRawgGame(externalId),
  TMDB: async (externalId, externalSubId, type) => {
    if (externalSubId) return getTmdbSeason(externalId, externalSubId);
    return type === "MOVIE" ? getTmdbMovie(externalId) : null;
  },
} satisfies Record<ExternalSource, ExactLookup>;

export async function resolveExact(
  source: ExternalSource,
  externalId: string,
  externalSubId = "",
  type?: MediaType,
): Promise<MediaCandidate | null> {
  return (await exactLookups[source]?.(externalId, externalSubId, type)) ?? null;
}

type UrlHandler = (url: URL) => Promise<MediaCandidate[]>;
const single = async (lookup: Promise<MediaCandidate | null>) => {
  const item = await lookup;
  return item ? [item] : [];
};

// Pasted links, by site. Each handler knows only its own URL shapes.
const urlHandlers = new Map<string, UrlHandler>([
  [
    "anilist.co",
    async (url) => {
      const id = url.pathname.match(/\/anime\/(\d+)/)?.[1];
      return id ? single(getAniListById(id)) : [];
    },
  ],
  [
    "myanimelist.net",
    async (url) => {
      const id = url.pathname.match(/\/anime\/(\d+)/)?.[1];
      return id ? single(getAniListByMalId(id)) : [];
    },
  ],
  [
    "themoviedb.org",
    async (url) => {
      const movie = url.pathname.match(/\/movie\/(\d+)/)?.[1];
      if (movie) return single(getTmdbMovie(movie));
      const tv = url.pathname.match(/\/tv\/(\d+)/)?.[1];
      const season = url.pathname.match(/\/season\/(\d+)/)?.[1];
      if (tv && season) return single(getTmdbSeason(tv, `season:${season}`));
      return tv ? getTmdbShowSeasons(tv) : [];
    },
  ],
  [
    "imdb.com",
    async (url) => {
      const id = url.pathname.match(/\/title\/(tt\d+)/)?.[1];
      return id ? findTmdbByImdb(id) : [];
    },
  ],
  [
    "openlibrary.org",
    async (url) => {
      const id = url.pathname.match(/\/works\/(OL\d+W)/i)?.[1];
      return id ? single(getOpenLibraryWork(id)) : [];
    },
  ],
  [
    "rawg.io",
    async (url) => {
      const slug = url.pathname.match(/^\/games\/([a-z0-9][a-z0-9-]*)\/?$/i)?.[1];
      return slug && rawgConfigured() ? single(getRawgGame(slug)) : [];
    },
  ],
]);

export async function resolveExternalUrl(raw: string): Promise<MediaCandidate[]> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return [];
  }
  const handler = urlHandlers.get(url.hostname.replace(/^www\./, "").toLowerCase());
  return handler ? handler(url) : [];
}
async function searchAnime(query: string, limit: number) {
  const direct = await searchAniList(query, limit);
  if (!CYRILLIC.test(query) || direct.length >= ALIAS_DISCOVERY_THRESHOLD) return direct;
  return enrichSparseCyrillicResults(direct, query, limit, searchAniList, 2);
}
async function searchGames(query: string, limit: number) {
  const direct = await searchRawgGames(query, limit);
  if (!CYRILLIC.test(query) || direct.length >= ALIAS_DISCOVERY_THRESHOLD) return direct;
  return enrichSparseCyrillicResults(direct, query, limit, searchRawgGames, 2);
}
async function enrichSparseCyrillicResults(
  direct: MediaCandidate[],
  query: string,
  limit: number,
  search: (query: string, limit?: number) => Promise<MediaCandidate[]>,
  aliasLimit: number,
) {
  const candidates = [...direct];
  const aliases = await englishAliasesFor(query);
  for (const alias of aliases.slice(0, aliasLimit)) {
    try {
      candidates.push(...(await search(alias, limit)));
    } catch {}
    if (dedupeCandidates(candidates).length >= limit) break;
  }
  return dedupeCandidates(candidates).slice(0, limit);
}
function dedupeCandidates(items: MediaCandidate[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}
