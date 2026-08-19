import type { MediaCandidate } from "../types";
import { providerFetch } from "./http";

const API = "https://api.rawg.io/api";
const COVER_HOST = "media.rawg.io";

type RawgGame = {
  id: number;
  name: string;
  name_original?: string | null;
  released?: string | null;
  background_image?: string | null;
  description?: string | null;
  description_raw?: string | null;
};

type RawgList = { results: RawgGame[] };

export function rawgConfigured() { return Boolean(process.env.RAWG_API_KEY?.trim()); }

export async function searchRawgGames(query: string, limit = 10): Promise<MediaCandidate[]> {
  const result = await rawg<RawgList>("/games", { search: query, search_precise: "true", page_size: String(limit) });
  return result.results.slice(0, limit).map(candidate);
}

export async function getRawgGame(id: string): Promise<MediaCandidate | null> {
  if (!/^\d+$/.test(id)) return null;
  try { return candidate(await rawg<RawgGame>(`/games/${id}`)); }
  catch { return null; }
}

async function rawg<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = process.env.RAWG_API_KEY?.trim();
  if (!key) throw new Error("RAWG_API_KEY is not configured");
  const url = new URL(`${API}${path}`);
  url.searchParams.set("key", key);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await providerFetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (response.status === 404) throw new Error("RAWG game not found");
  if (!response.ok) throw new Error(`RAWG request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function candidate(item: RawgGame): MediaCandidate {
  return {
    key: `RAWG:${item.id}:`,
    type: "GAME",
    source: "RAWG",
    externalId: String(item.id),
    externalSubId: "",
    title: item.name,
    originalTitle: item.name_original || null,
    year: year(item.released),
    coverUrl: coverUrl(item.background_image),
    description: item.description_raw || stripHtml(item.description) || null,
  };
}

function year(date?: string | null) { const match = date?.match(/^(\d{4})/); return match ? Number(match[1]) : null; }
function coverUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === COVER_HOST && url.pathname.startsWith("/media/") ? url.toString() : null;
  } catch { return null; }
}
function stripHtml(value?: string | null) { return value?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || null; }
