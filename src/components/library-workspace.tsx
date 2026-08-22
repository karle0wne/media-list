"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { MediaSort, SortDirection } from "@/lib/services/media";
import type { MediaStatus, MediaType } from "@/lib/types";
import { LibraryGrid } from "./library-grid";
import { LibrarySettings } from "./library-settings";
import { LibraryTable, type LibraryRow } from "./library-table";

type StatusLink = {
  label: string;
  status: MediaStatus | null;
  active: boolean;
  href: string;
};

type ViewMode = "table" | "grid";

const VIEW_MODE_STORAGE_KEY = "media-list:view-mode:v1";
const VIEW_MODE_EVENT = "media-list:view-mode-change";

export function LibraryWorkspace({
  items,
  returnTo,
  visibleColumns,
  sort,
  direction,
  sortLinks,
  selectedTypes,
  scoreMin,
  hasNotes,
  statusLinks,
  query,
  hiddenSearchParams,
}: {
  items: LibraryRow[];
  returnTo: string;
  visibleColumns: string[];
  sort: MediaSort;
  direction: SortDirection;
  sortLinks: Record<MediaSort, Record<SortDirection, string>>;
  selectedTypes: MediaType[];
  scoreMin?: number;
  hasNotes: boolean;
  statusLinks: StatusLink[];
  query: string;
  hiddenSearchParams: Array<[string, string]>;
}) {
  const viewMode = useSyncExternalStore(
    subscribeToViewMode,
    readViewMode,
    defaultViewMode,
  );

  function chooseView(mode: ViewMode) {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    window.dispatchEvent(new Event(VIEW_MODE_EVENT));
  }

  return (
    <>
      <div className="libraryCommandBar">
        <Link className="button addMediaButton" href="/media/new">
          + Add media
        </Link>

        <nav className="statusTabs libraryStatusTabs" aria-label="List status">
          {statusLinks.map((item) => (
            <Link
              key={item.status ?? "all"}
              className={`statusTab ${statusClass(item.status)} ${item.active ? "active" : ""}`}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="libraryCommandControls">
          <LibrarySettings
            selectedTypes={selectedTypes}
            scoreMin={scoreMin}
            hasNotes={hasNotes}
            sort={sort}
            direction={direction}
            visibleColumns={visibleColumns}
          />
          <div className="viewSwitch" role="group" aria-label="View mode">
            <button
              type="button"
              className={`secondary viewModeButton ${viewMode === "table" ? "active" : ""}`}
              aria-label="Table view"
              aria-pressed={viewMode === "table"}
              onClick={() => chooseView("table")}
              title="Table view"
            >
              ▤
            </button>
            <button
              type="button"
              className={`secondary viewModeButton ${viewMode === "grid" ? "active" : ""}`}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              onClick={() => chooseView("grid")}
              title="Grid view"
            >
              ▦
            </button>
          </div>
        </div>
      </div>

      <form method="get" className="librarySearch">
        {hiddenSearchParams.map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <input
          name="q"
          defaultValue={query}
          placeholder="Search your list"
          aria-label="Search your list"
        />
        <button className="secondary" type="submit">
          Search
        </button>
      </form>

      {items.length === 0 ? (
        <div className="empty">
          <p>No positions match these filters.</p>
          <Link href="/media/new">Add a position</Link>
        </div>
      ) : viewMode === "grid" ? (
        <LibraryGrid items={items} />
      ) : (
        <LibraryTable
          items={items}
          returnTo={returnTo}
          visibleColumns={visibleColumns}
          sort={sort}
          direction={direction}
          sortLinks={sortLinks}
        />
      )}
    </>
  );
}

function subscribeToViewMode(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(VIEW_MODE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(VIEW_MODE_EVENT, onChange);
  };
}

function readViewMode(): ViewMode {
  const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === "grid" ? "grid" : "table";
}

function defaultViewMode(): ViewMode {
  return "table";
}

function statusClass(status: MediaStatus | null) {
  if (!status) return "status-all";
  return `status-${status.toLowerCase().replaceAll("_", "-")}`;
}
