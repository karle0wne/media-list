import type { MediaCandidate } from "../types";
import { providerFetch, providerResponseError } from "./http";
const API = "https://openlibrary.org";
type SearchDoc = {
  key?: string;
  title?: string;
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
  author_name?: string[];
};
type Work = {
  key?: string;
  type?: { key?: string };
  /** Set on a merged work: `/type/redirect` points here instead of carrying any data. */
  location?: string;
  title?: string;
  covers?: number[];
  first_publish_date?: string;
  description?: string | { value?: string };
};
function workId(key?: string) {
  const match = key?.match(/(?:\/works\/)?(OL\d+W)$/i);
  return match?.[1].toUpperCase() ?? null;
}
export async function searchOpenLibrary(query: string, limit = 5): Promise<MediaCandidate[]> {
  const url = new URL(`${API}/search.json`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", "en");
  url.searchParams.set(
    "fields",
    "key,title,first_publish_year,cover_i,number_of_pages_median,author_name",
  );
  const response = await providerFetch(url, {
    cache: "no-store",
    headers: { "user-agent": "media-list/0.1" },
  });
  if (!response.ok) throw providerResponseError("Open Library", response);
  const body = (await response.json()) as { docs?: SearchDoc[] };
  return (body.docs ?? []).flatMap((doc) => {
    const id = workId(doc.key);
    if (!id || !doc.title) return [];
    return [
      {
        key: `OPENLIBRARY:${id}:`,
        type: "BOOK" as const,
        source: "OPENLIBRARY" as const,
        externalId: id,
        externalSubId: "",
        title: doc.title,
        originalTitle: doc.title,
        year: doc.first_publish_year ?? null,
        pageCount: doc.number_of_pages_median ?? null,
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
        externalUrl: `https://openlibrary.org/works/${id}`,
        credit: doc.author_name?.join(", ") ?? null,
      },
    ];
  });
}
async function fetchWork(id: string): Promise<Work | null> {
  const response = await providerFetch(`${API}/works/${id}.json`, {
    cache: "no-store",
    headers: { "user-agent": "media-list/0.1" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw providerResponseError("Open Library", response);
  return (await response.json()) as Work;
}
export async function getOpenLibraryWork(id: string): Promise<MediaCandidate | null> {
  const normalized = workId(id);
  if (!normalized) return null;
  let target = normalized;
  let work = await fetchWork(target);
  // A merged work answers with a redirect record; follow it once. The identity stays the one
  // that was asked for, so a saved list position keeps pointing at the same work.
  if (work?.type?.key === "/type/redirect") {
    const next = workId(work.location);
    if (!next) return null;
    target = next;
    work = await fetchWork(target);
  }
  if (!work) return null;
  if (!work.title) throw new Error(`Open Library work ${normalized} has no title`);
  const description =
    typeof work.description === "string" ? work.description : work.description?.value;
  let pageCount: number | null = null;
  let canonicalYear: number | null = null;
  let credit: string | null = null;
  try {
    const searchUrl = new URL(`${API}/search.json`);
    searchUrl.searchParams.set("q", `key:${target}`);
    searchUrl.searchParams.set("limit", "1");
    searchUrl.searchParams.set(
      "fields",
      "key,first_publish_year,number_of_pages_median,author_name",
    );
    const pagesResponse = await providerFetch(searchUrl, {
      cache: "no-store",
      headers: { "user-agent": "media-list/0.1" },
    });
    if (pagesResponse.ok) {
      const doc = ((await pagesResponse.json()) as { docs?: SearchDoc[] }).docs?.[0];
      pageCount = doc?.number_of_pages_median ?? null;
      canonicalYear = doc?.first_publish_year ?? null;
      credit = doc?.author_name?.join(", ") ?? null;
    }
  } catch {}
  return {
    key: `OPENLIBRARY:${normalized}:`,
    type: "BOOK",
    source: "OPENLIBRARY",
    externalId: normalized,
    externalSubId: "",
    title: work.title,
    originalTitle: work.title,
    year: canonicalYear ?? parseYear(work.first_publish_date),
    pageCount,
    coverUrl: work.covers?.[0]
      ? `https://covers.openlibrary.org/b/id/${work.covers[0]}-M.jpg`
      : null,
    externalUrl: `https://openlibrary.org/works/${normalized}`,
    description: description ?? null,
    credit,
  };
}
function parseYear(value?: string) {
  const match = value?.match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : null;
}
