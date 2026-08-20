import type { MediaSort, SortDirection } from "./services/media";

export type VisibleColumn = "status" | "score" | "progress" | "type" | "added";

export const DEFAULT_VISIBLE_COLUMNS: VisibleColumn[] = ["status", "score", "progress", "type"];
export const DEFAULT_LIBRARY_SORT: MediaSort = "created";
export const DEFAULT_LIBRARY_DIRECTION: SortDirection = "desc";

const allowedColumns = new Set<VisibleColumn>(["status", "score", "progress", "type", "added"]);

export function parseVisibleColumns(value?: string): VisibleColumn[] {
  if (!value) return [...DEFAULT_VISIBLE_COLUMNS];
  if (value === "none") return [];
  const parsed = value.split(",").filter((item): item is VisibleColumn => allowedColumns.has(item as VisibleColumn));
  return parsed.length ? [...new Set(parsed)] : [...DEFAULT_VISIBLE_COLUMNS];
}

export function serializeVisibleColumns(columns: readonly string[]) {
  if (columns.length === 0) return "none";
  if (columns.length === DEFAULT_VISIBLE_COLUMNS.length && DEFAULT_VISIBLE_COLUMNS.every((column, index) => columns[index] === column)) return undefined;
  return columns.join(",");
}

export function reconcileSelection(selected: ReadonlySet<string>, visibleIds: readonly string[]) {
  const visible = new Set(visibleIds);
  return new Set([...selected].filter((id) => visible.has(id)));
}

export function areAllVisibleSelected(selected: ReadonlySet<string>, visibleIds: readonly string[]) {
  return visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
}
