export type MediaType = "ANIME" | "MOVIE" | "SERIES" | "BOOK";
export type MediaStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD" | "DROPPED";
export type ExternalSource = "ANILIST" | "TMDB" | "OPENLIBRARY";
export type MediaCandidate = { key: string; type: MediaType; source: ExternalSource; externalId: string; externalSubId: string; title: string; originalTitle?: string | null; countryCode?: string | null; year?: number | null; runtimeMinutes?: number | null; episodeCount?: number | null; pageCount?: number | null; coverUrl?: string | null; description?: string | null; };
export type ImportedUserData = { status?: MediaStatus; score?: number | null; progressCurrent?: number; progressTotal?: number | null; notes?: string | null; timeSpentOverrideMinutes?: number | null; };
