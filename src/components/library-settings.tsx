"use client";

import { useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MediaType } from "@/lib/types";
import type { MediaSort, SortDirection } from "@/lib/services/media";
import {
  DEFAULT_LIBRARY_DIRECTION,
  DEFAULT_LIBRARY_SORT,
  DEFAULT_VISIBLE_COLUMNS,
  serializeVisibleColumns,
} from "@/lib/library-view";

const types: Array<[MediaType, string]> = [
  ["ANIME", "Anime"],
  ["MOVIE", "Movies"],
  ["SERIES", "Series"],
  ["BOOK", "Books"],
  ["GAME", "Games"],
];

const columns = [
  ["status", "Status"],
  ["score", "Score"],
  ["progress", "Progress"],
  ["type", "Type"],
  ["added", "Date added"],
  ["updated", "Date updated"],
] as const;

export function LibrarySettings({
  selectedTypes,
  scoreMin,
  hasNotes,
  sort,
  direction,
  visibleColumns,
}: {
  selectedTypes: MediaType[];
  scoreMin?: number;
  hasNotes: boolean;
  sort: MediaSort;
  direction: SortDirection;
  visibleColumns: string[];
}) {
  const filterDialog = useRef<HTMLDialogElement>(null);
  const sortDialog = useRef<HTMLDialogElement>(null);
  const displayDialog = useRef<HTMLDialogElement>(null);
  const filterForm = useRef<HTMLFormElement>(null);
  const displayForm = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const effectiveTypes = selectedTypes.length
    ? selectedTypes
    : types.map(([value]) => value);
  const hasActiveFilter =
    selectedTypes.length > 0 || scoreMin !== undefined || hasNotes;

  function navigate(params: URLSearchParams) {
    router.push(params.toString() ? `/?${params}` : "/");
  }

  function applyFilter(form: HTMLFormElement) {
    const data = new FormData(form);
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["types", "scoreMin", "hasNotes"]) params.delete(key);

    const chosenTypes = data.getAll("type").map(String);
    if (chosenTypes.length > 0 && chosenTypes.length < types.length) {
      params.set("types", chosenTypes.join(","));
    }

    const minimumScore = String(data.get("scoreMin") ?? "");
    if (minimumScore) params.set("scoreMin", minimumScore);
    if (data.get("hasNotes")) params.set("hasNotes", "1");

    navigate(params);
    filterDialog.current?.close();
  }

  function applySort(form: HTMLFormElement) {
    const data = new FormData(form);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("sort");
    params.delete("dir");

    const nextSort = String(data.get("sort") ?? DEFAULT_LIBRARY_SORT);
    const nextDirection = String(
      data.get("dir") ?? DEFAULT_LIBRARY_DIRECTION,
    );

    if (nextSort !== DEFAULT_LIBRARY_SORT) params.set("sort", nextSort);
    if (nextDirection !== DEFAULT_LIBRARY_DIRECTION) {
      params.set("dir", nextDirection);
    }

    navigate(params);
    sortDialog.current?.close();
  }

  function applyDisplay(form: HTMLFormElement) {
    const data = new FormData(form);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cols");

    const serialized = serializeVisibleColumns(
      data.getAll("column").map(String),
    );
    if (serialized) params.set("cols", serialized);

    navigate(params);
    displayDialog.current?.close();
  }

  function setChecks(
    form: HTMLFormElement | null,
    name: string,
    values: readonly string[],
  ) {
    if (!form) return;
    for (const input of form.querySelectorAll<HTMLInputElement>(
      `input[name="${name}"]`,
    )) {
      input.checked = values.includes(input.value);
    }
  }

  return (
    <>
      <div className="librarySettingsTriggers">
        <button
          type="button"
          className={`secondary toolbarButton ${hasActiveFilter ? "active" : ""}`}
          onClick={() => filterDialog.current?.showModal()}
        >
          Filter
        </button>
        <button
          type="button"
          className="secondary toolbarButton"
          onClick={() => sortDialog.current?.showModal()}
        >
          Sort
        </button>
        <button
          type="button"
          className="secondary toolbarIconButton"
          onClick={() => displayDialog.current?.showModal()}
          aria-label="Display settings"
          title="Display settings"
        >
          ⚙
        </button>
      </div>

      <dialog
        className="settingsDialog"
        ref={filterDialog}
        aria-labelledby="list-filter-title"
      >
        <form
          ref={filterForm}
          onSubmit={(event) => {
            event.preventDefault();
            applyFilter(event.currentTarget);
          }}
        >
          <div className="dialogHeading">
            <div>
              <h2 id="list-filter-title">Filter list</h2>
              <p className="muted">Limit the current library view.</p>
            </div>
            <button
              className="iconButton secondary"
              type="button"
              onClick={() => filterDialog.current?.close()}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <fieldset>
            <legend>
              Media types{" "}
              <button
                className="textAction legendAction"
                type="button"
                onClick={() =>
                  setChecks(
                    filterForm.current,
                    "type",
                    types.map(([value]) => value),
                  )
                }
              >
                Reset to all
              </button>
            </legend>
            <div className="choiceGrid">
              {types.map(([value, label]) => (
                <label className="checkChoice" key={value}>
                  <input
                    type="checkbox"
                    name="type"
                    value={value}
                    defaultChecked={effectiveTypes.includes(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="settingsGrid">
            <label>
              Minimum score
              <select name="scoreMin" defaultValue={scoreMin ?? ""}>
                <option value="">Any</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
                  <option value={value} key={value}>
                    {value}+
                  </option>
                ))}
              </select>
            </label>
            <label className="checkChoice inlineChoice">
              <input
                type="checkbox"
                name="hasNotes"
                defaultChecked={hasNotes}
              />
              Only items with notes
            </label>
          </div>

          <div className="dialogActions">
            <button
              className="secondary"
              type="button"
              onClick={() => filterDialog.current?.close()}
            >
              Cancel
            </button>
            <button type="submit">Apply filter</button>
          </div>
        </form>
      </dialog>

      <dialog
        className="settingsDialog compactSettingsDialog"
        ref={sortDialog}
        aria-labelledby="list-sort-title"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            applySort(event.currentTarget);
          }}
        >
          <div className="dialogHeading">
            <div>
              <h2 id="list-sort-title">Sort list</h2>
              <p className="muted">Choose ordering for the current view.</p>
            </div>
            <button
              className="iconButton secondary"
              type="button"
              onClick={() => sortDialog.current?.close()}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="settingsGrid">
            <label>
              Sort by
              <select name="sort" defaultValue={sort}>
                <option value="updated">Date updated</option>
                <option value="created">Date added</option>
                <option value="title">Title</option>
                <option value="score">Score</option>
                <option value="progress">Progress</option>
                <option value="type">Type</option>
                <option value="year">Year</option>
              </select>
            </label>
            <label>
              Direction
              <select name="dir" defaultValue={direction}>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
          </div>

          <div className="dialogActions">
            <button
              className="secondary"
              type="button"
              onClick={() => sortDialog.current?.close()}
            >
              Cancel
            </button>
            <button type="submit">Apply sort</button>
          </div>
        </form>
      </dialog>

      <dialog
        className="settingsDialog compactSettingsDialog"
        ref={displayDialog}
        aria-labelledby="list-display-title"
      >
        <form
          ref={displayForm}
          onSubmit={(event) => {
            event.preventDefault();
            applyDisplay(event.currentTarget);
          }}
        >
          <div className="dialogHeading">
            <div>
              <h2 id="list-display-title">Display settings</h2>
              <p className="muted">Choose columns for table view.</p>
            </div>
            <button
              className="iconButton secondary"
              type="button"
              onClick={() => displayDialog.current?.close()}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <fieldset>
            <legend>
              Visible columns{" "}
              <button
                className="textAction legendAction"
                type="button"
                onClick={() =>
                  setChecks(
                    displayForm.current,
                    "column",
                    DEFAULT_VISIBLE_COLUMNS,
                  )
                }
              >
                Reset to default
              </button>
            </legend>
            <div className="choiceGrid">
              {columns.map(([value, label]) => (
                <label className="checkChoice" key={value}>
                  <input
                    type="checkbox"
                    name="column"
                    value={value}
                    defaultChecked={visibleColumns.includes(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="dialogActions">
            <button
              className="secondary"
              type="button"
              onClick={() => displayDialog.current?.close()}
            >
              Cancel
            </button>
            <button type="submit">Apply columns</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
