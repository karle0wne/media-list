export const MEDIA_TYPES = ["ANIME", "MOVIE", "SERIES", "BOOK", "GAME"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "ON_HOLD", "DROPPED"] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const EXTERNAL_SOURCES = ["ANILIST", "TMDB", "OPENLIBRARY", "RAWG"] as const;
export type ExternalSource = (typeof EXTERNAL_SOURCES)[number];

export const METADATA_STATUSES = ["PENDING", "READY", "ERROR"] as const;
export type MetadataStatus = (typeof METADATA_STATUSES)[number];

export type MediaIdentity = { source: ExternalSource; externalId: string; externalSubId: string; type: MediaType };

export type MediaCandidate = MediaIdentity & {
  key: string;
  title: string;
  originalTitle?: string | null;
  countryCode?: string | null;
  year?: number | null;
  episodeCount?: number | null;
  pageCount?: number | null;
  coverUrl?: string | null;
  description?: string | null;
};

export type ImportedUserData = {
  status?: MediaStatus;
  score?: number | null;
  progressCurrent?: number;
  progressTotal?: number | null;
  notes?: string | null;
};
