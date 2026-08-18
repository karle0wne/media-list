import type { ExternalSource } from "../types";

export function externalMediaUrl(source: ExternalSource, externalId: string, externalSubId: string) {
  if (source === "ANILIST") return `https://anilist.co/anime/${externalId}`;
  if (source === "OPENLIBRARY") return `https://openlibrary.org/works/${externalId}`;
  if (source === "RAWG") return "https://rawg.io/";
  if (externalSubId.startsWith("season:")) return `https://www.themoviedb.org/tv/${externalId}/season/${externalSubId.slice(7)}`;
  return `https://www.themoviedb.org/movie/${externalId}`;
}
