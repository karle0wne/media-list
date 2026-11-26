import type { ImportedUserData, MediaCandidate, MediaStatus } from "../types";

/**
 * Progress/status rules of a user's list position, kept free of storage so every writer
 * (manual edits, import, provider enrichment) applies the same invariants:
 *
 * - `progressCurrent` never exceeds a known `progressTotal`.
 * - A COMPLETED position with a known total is always at that total.
 * - A total the user or an earlier import already set is never replaced by provider data.
 */
export type ProgressState = {
  status: MediaStatus;
  progressCurrent: number;
  progressTotal: number | null;
};

/** The total a provider implies for a freshly added position, when it publishes one. */
export function defaultProgressTotal(
  candidate: Pick<MediaCandidate, "type" | "pageCount" | "episodeCount">,
): number | null {
  if (candidate.type === "MOVIE") return 1;
  if (candidate.type === "BOOK") return candidate.pageCount ?? null;
  return candidate.episodeCount ?? null;
}

/** Progress for a new position, from imported user data and what the provider knows. */
export function initialProgress(
  userData: ImportedUserData,
  candidate: Pick<MediaCandidate, "type" | "pageCount" | "episodeCount">,
) {
  const progressTotal = userData.progressTotalUnknown
    ? null
    : (userData.progressTotal ?? defaultProgressTotal(candidate));
  const progressCurrent =
    userData.status === "COMPLETED" && progressTotal != null
      ? progressTotal
      : (userData.progressCurrent ?? 0);
  if (progressTotal != null && progressCurrent > progressTotal)
    throw new Error(`Progress cannot exceed the known total (${progressTotal})`);
  return { progressCurrent, progressTotal };
}

/**
 * Restoring a file must not lose a position because its numbers disagree (for example data
 * saved by an older version). Progress above the total is kept and the total becomes unknown;
 * `adjusted` tells the caller to report it.
 */
export function reconcileImportedProgress(
  userData: ImportedUserData,
  candidate: Pick<MediaCandidate, "type" | "pageCount" | "episodeCount">,
): { userData: ImportedUserData; adjusted: boolean } {
  const total = userData.progressTotal ?? defaultProgressTotal(candidate);
  if (total != null && userData.status !== "COMPLETED" && (userData.progressCurrent ?? 0) > total)
    return { userData: { ...userData, progressTotalUnknown: true }, adjusted: true };
  return { userData, adjusted: false };
}

/** Marking a position COMPLETED fills progress up to the known total, if there is one. */
export function completionProgress(
  row: Pick<ProgressState, "progressTotal">,
  explicitTotal?: number | null,
) {
  const progressTotal = explicitTotal ?? row.progressTotal;
  return progressTotal == null ? null : { progressTotal, progressCurrent: progressTotal };
}

/** Manual progress edit: rejects values past the total and reopens a completed position. */
export function applyProgress(
  row: Pick<ProgressState, "status" | "progressTotal">,
  progressCurrent: number,
) {
  if (row.progressTotal != null && progressCurrent > row.progressTotal)
    throw new Error(`Progress cannot exceed the known total (${row.progressTotal})`);
  const status =
    row.status === "COMPLETED" && row.progressTotal != null && progressCurrent !== row.progressTotal
      ? ("IN_PROGRESS" as const)
      : row.status;
  return { progressCurrent, status };
}

/**
 * Provider enrichment learned a total for the work. Only positions without a total adopt it,
 * and only when their recorded progress still fits; a COMPLETED one then moves to the total.
 * Returns null when the position must stay as the user left it.
 */
export function adoptProviderTotal(row: ProgressState, providerTotal: number) {
  if (row.progressTotal != null || row.progressCurrent > providerTotal) return null;
  return row.status === "COMPLETED"
    ? { progressTotal: providerTotal, progressCurrent: providerTotal }
    : { progressTotal: providerTotal };
}
