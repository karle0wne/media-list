import type { MediaStatus, MediaType } from "./types";

export const STATUS_LABELS: Record<MediaStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  ON_HOLD: "On hold",
  DROPPED: "Dropped",
};

export const TYPE_LABELS: Record<MediaType, string> = {
  ANIME: "Anime",
  MOVIE: "Movie",
  SERIES: "Series",
  BOOK: "Book",
  GAME: "Game",
};

/** Order in which statuses are offered in menus and tabs. */
export const STATUS_ORDER: readonly MediaStatus[] = [
  "IN_PROGRESS",
  "COMPLETED",
  "ON_HOLD",
  "DROPPED",
  "PLANNED",
];

/** Plural forms for group headings and filter menus. */
export const TYPE_PLURAL_LABELS: Record<MediaType, string> = {
  ANIME: "Anime",
  MOVIE: "Movies",
  SERIES: "Series",
  BOOK: "Books",
  GAME: "Games",
};
