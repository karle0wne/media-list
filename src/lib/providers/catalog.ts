import type { ExternalSource, MediaIdentity } from "../types";

/**
 * Everything the application knows about a provider without calling it: what a valid saved
 * identity looks like and where the item lives on the provider's site. The table is keyed by
 * `ExternalSource` and `satisfies` makes it exhaustive, so adding a source to
 * `EXTERNAL_SOURCES` fails to compile until it is described here (and, for the network side,
 * in providers/index.ts).
 */
type SourceInfo = {
  /** Why this identity can never exist at the provider, or null when its shape is plausible. */
  identityProblem(identity: MediaIdentity): string | null;
  externalUrl(externalId: string, externalSubId: string): string;
};

const NUMERIC = /^\d+$/;

export const SOURCES = {
  ANILIST: {
    identityProblem: ({ type, externalId, externalSubId }) =>
      type !== "ANIME"
        ? "type must be ANIME"
        : !NUMERIC.test(externalId)
          ? "external_id must be numeric"
          : externalSubId
            ? "external_sub_id must be empty"
            : null,
    externalUrl: (externalId) => `https://anilist.co/anime/${externalId}`,
  },
  OPENLIBRARY: {
    identityProblem: ({ type, externalId, externalSubId }) =>
      type !== "BOOK"
        ? "type must be BOOK"
        : !/^OL\d+W$/.test(externalId)
          ? "external_id must look like OL123W"
          : externalSubId
            ? "external_sub_id must be empty"
            : null,
    externalUrl: (externalId) => `https://openlibrary.org/works/${externalId}`,
  },
  RAWG: {
    identityProblem: ({ type, externalId, externalSubId }) =>
      type !== "GAME"
        ? "type must be GAME"
        : !NUMERIC.test(externalId)
          ? "external_id must be numeric"
          : externalSubId
            ? "external_sub_id must be empty"
            : null,
    externalUrl: (externalId) => `https://rawg.io/games/${externalId}`,
  },
  TMDB: {
    identityProblem: ({ type, externalId, externalSubId }) => {
      if (!NUMERIC.test(externalId)) return "external_id must be numeric";
      if (type === "MOVIE")
        return externalSubId ? "external_sub_id must be empty for movies" : null;
      if (type === "SERIES")
        return /^season:\d+$/.test(externalSubId)
          ? null
          : "external_sub_id must look like season:1";
      return "type must be MOVIE or SERIES";
    },
    externalUrl: (externalId, externalSubId) =>
      externalSubId.startsWith("season:")
        ? `https://www.themoviedb.org/tv/${externalId}/season/${externalSubId.slice(7)}`
        : `https://www.themoviedb.org/movie/${externalId}`,
  },
} as const satisfies Record<ExternalSource, SourceInfo>;

export function externalMediaUrl(
  source: ExternalSource,
  externalId: string,
  externalSubId: string,
) {
  return SOURCES[source].externalUrl(externalId, externalSubId);
}
