import type { MediaCandidate } from "../types";

const ENDPOINT = "https://graphql.anilist.co";
const fields = `
  id
  idMal
  title { romaji english native }
  countryOfOrigin
  episodes
  duration
  startDate { year }
  coverImage { large }
  description(asHtml: false)
`;
type AniMedia = { id: number; idMal?: number | null; title: { romaji?: string | null; english?: string | null; native?: string | null }; countryOfOrigin?: string | null; episodes?: number | null; duration?: number | null; startDate?: { year?: number | null } | null; coverImage?: { large?: string | null } | null; description?: string | null; };
async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> { const response = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ query, variables }), cache: "no-store" }); if (!response.ok) throw new Error(`AniList request failed: ${response.status}`); const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> }; if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; ")); if (!body.data) throw new Error("AniList returned no data"); return body.data; }
function toCandidate(item: AniMedia): MediaCandidate { const title = item.title.english || item.title.romaji || item.title.native || `AniList #${item.id}`; const episodes = item.episodes ?? null; const perEpisode = item.duration ?? null; return { key: `ANILIST:${item.id}:`, type: "ANIME", source: "ANILIST", externalId: String(item.id), externalSubId: "", title, originalTitle: item.title.native ?? item.title.romaji ?? null, countryCode: item.countryOfOrigin ?? null, year: item.startDate?.year ?? null, runtimeMinutes: episodes && perEpisode ? episodes * perEpisode : null, episodeCount: episodes, coverUrl: item.coverImage?.large ?? null, description: item.description?.replace(/<[^>]+>/g, "") ?? null }; }
export async function searchAniList(query: string, limit = 5): Promise<MediaCandidate[]> { const data = await gql<{ Page: { media: AniMedia[] } }>(`query ($search: String!, $perPage: Int!) { Page(page: 1, perPage: $perPage) { media(type: ANIME, search: $search, isAdult: false, sort: [SEARCH_MATCH]) { ${fields} } } }`, { search: query, perPage: limit }); return data.Page.media.map(toCandidate); }
export async function getAniListById(id: string): Promise<MediaCandidate | null> { const numeric = Number(id); if (!Number.isInteger(numeric)) return null; const data = await gql<{ Media: AniMedia | null }>(`query ($id: Int!) { Media(id: $id, type: ANIME) { ${fields} } }`, { id: numeric }); return data.Media ? toCandidate(data.Media) : null; }
export async function getAniListByMalId(id: string): Promise<MediaCandidate | null> { const numeric = Number(id); if (!Number.isInteger(numeric)) return null; const data = await gql<{ Media: AniMedia | null }>(`query ($idMal: Int!) { Media(idMal: $idMal, type: ANIME) { ${fields} } }`, { idMal: numeric }); return data.Media ? toCandidate(data.Media) : null; }
