import type { MediaStatus, MediaType } from "@/lib/types";
import { ProviderCover } from "./provider-cover";
import type { LibraryRow } from "./library-table";

export function LibraryGrid({ items }: { items: LibraryRow[] }) {
  return (
    <div className="libraryGrid" aria-label="Media grid">
      {items.map((item) => {
        const progress = progressLabel(item);
        const status = statusLabel(item.status);

        return (
          <article
            className={`mediaGridCard status-${item.status.toLowerCase().replaceAll("_", "-")}`}
            key={item.userMediaId}
          >
            <a
              className="mediaGridCoverLink"
              href={item.externalUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${item.title}`}
            >
              {item.coverUrl ? (
                <ProviderCover
                  className="mediaGridCover"
                  src={item.coverUrl}
                  alt=""
                  width={320}
                  height={480}
                />
              ) : (
                <div className="mediaGridCover mediaGridCoverPlaceholder">
                  {typeLabel(item.type)}
                </div>
              )}
            </a>

            <div className="mediaGridBody">
              <a
                className="mediaGridTitle"
                href={item.externalUrl}
                target="_blank"
                rel="noreferrer"
              >
                {item.title}
              </a>

              <div className="mediaGridMeta">
                {typeLabel(item.type)}
                {item.year ? ` · ${item.year}` : ""}
              </div>

              <div className="mediaGridMetrics">
                <span className={`gridStatusBadge ${statusClass(item.status)}`}>
                  {status}
                </span>
                <span className="gridScore">
                  {item.score == null ? "—" : `★ ${item.score}/10`}
                </span>
              </div>

              <div className="mediaGridProgress">{progress ?? "\u00a0"}</div>
              <time
                className="mediaGridUpdated"
                dateTime={item.updatedAt}
                title={item.updatedAt}
              >
                Updated {formatDate(item.updatedAt)}
              </time>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function progressLabel(item: LibraryRow) {
  if (item.type === "GAME") return null;

  const suffix = item.type === "BOOK" ? " pages" : "";
  if (item.progressTotal != null) {
    return `${item.progressCurrent} / ${item.progressTotal}${suffix}`;
  }
  if (item.progressCurrent > 0) {
    return `${item.progressCurrent}${suffix}`;
  }
  return null;
}

function statusLabel(status: MediaStatus) {
  return (
    {
      IN_PROGRESS: "In progress",
      COMPLETED: "Completed",
      ON_HOLD: "On hold",
      DROPPED: "Dropped",
      PLANNED: "Planned",
    } as const
  )[status];
}

function typeLabel(type: MediaType) {
  return (
    {
      ANIME: "Anime",
      MOVIE: "Movie",
      SERIES: "Series",
      BOOK: "Book",
      GAME: "Game",
    } as const
  )[type];
}

function statusClass(status: MediaStatus) {
  return `status-${status.toLowerCase().replaceAll("_", "-")}`;
}

function formatDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}
