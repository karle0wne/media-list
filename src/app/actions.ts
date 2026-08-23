"use server";

import { redirect } from "next/navigation";
import { getDatabase } from "@/db";
import { requireIdentity } from "@/lib/identity";
import { scheduleMediaEnrichment } from "@/lib/enrichment-runtime";
import { parseCandidateKey, resolveExact } from "@/lib/providers";
import { addSelectedMediaToUser, deleteUserMediaMany, retryMediaMetadata, updateUserMedia } from "@/lib/services/media";
import { updateUserProgress } from "@/lib/services/progress";
import { createQuickImport, confirmBatch } from "@/lib/services/imports";
import { importCanonical } from "@/lib/services/canonical";
import { isMediaType, parseMediaStatus, parseOptionalNonNegativeInteger } from "@/lib/user-media";

function str(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function goError(path: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "Unexpected error";
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

function returnTo(form: FormData) {
  const value = str(form, "returnTo");
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function addCandidateAction(form: FormData) {
  const user = await requireIdentity();
  try {
    const key = parseCandidateKey(str(form, "candidateKey"));
    const type = str(form, "candidateType");
    if (!key || !isMediaType(type)) throw new Error("Candidate is invalid; search again");
    const candidate = await resolveExact(key.source, key.externalId, key.externalSubId, type);
    if (!candidate) throw new Error("Candidate could not be revalidated; search again");
    const result = await addSelectedMediaToUser(getDatabase().db, user.id, candidate);
    if (result.needsEnrichment) scheduleMediaEnrichment(result.item.id);
  } catch (error) {
    goError("/media/new", error);
  }
  redirect("/");
}

export async function retryMetadataAction(form: FormData) {
  const user = await requireIdentity();
  const mediaId = str(form, "mediaId");
  if (await retryMediaMetadata(getDatabase().db, user.id, mediaId)) scheduleMediaEnrichment(mediaId);
  redirect(returnTo(form));
}

export async function quickStatusAction(form: FormData) {
  const user = await requireIdentity();
  try {
    const status = parseMediaStatus(str(form, "status"), true)!;
    await updateUserMedia(getDatabase().db, user.id, str(form, "id"), { status });
  } catch (error) {
    goError(returnTo(form), error);
  }
  redirect(returnTo(form));
}

export async function quickScoreAction(form: FormData) {
  const user = await requireIdentity();
  try {
    const score = parseOptionalNonNegativeInteger(str(form, "score"), "score", 10);
    await updateUserMedia(getDatabase().db, user.id, str(form, "id"), { score });
  } catch (error) {
    goError(returnTo(form), error);
  }
  redirect(returnTo(form));
}

export async function quickProgressAction(form: FormData) {
  const user = await requireIdentity();
  try {
    const progressCurrent = parseOptionalNonNegativeInteger(str(form, "progressCurrent"), "progress_current") ?? 0;
    await updateUserProgress(getDatabase().db, user.id, str(form, "id"), progressCurrent);
  } catch (error) {
    goError(returnTo(form), error);
  }
  redirect(returnTo(form));
}

export async function quickNotesAction(form: FormData) {
  const user = await requireIdentity();
  try {
    await updateUserMedia(getDatabase().db, user.id, str(form, "id"), { notes: str(form, "notes") || null });
  } catch (error) {
    goError(returnTo(form), error);
  }
  redirect(returnTo(form));
}

export async function deleteMediaManyAction(form: FormData) {
  const user = await requireIdentity();
  const ids = form.getAll("id").filter((value): value is string => typeof value === "string");
  await deleteUserMediaMany(getDatabase().db, user.id, ids);
  redirect(returnTo(form));
}

export async function quickImportAction(form: FormData) {
  const user = await requireIdentity();
  let batchId: string;
  try {
    batchId = await createQuickImport(getDatabase().db, user.id, str(form, "text"));
  } catch (error) {
    goError("/import", error);
  }
  redirect(`/import/review/${batchId}`);
}

export async function canonicalImportAction(form: FormData) {
  const user = await requireIdentity();
  let summary: string;
  try {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a canonical CSV file");
    if (file.size > 2_000_000) throw new Error("Canonical CSV is too large (2 MB max)");
    const report = await importCanonical(getDatabase().db, user.id, await file.text());
    summary = `Imported ${report.imported}; duplicates ${report.duplicates}; invalid ${report.invalid}${report.errors[0] ? `; ${report.errors[0]}` : ""}`;
  } catch (error) {
    goError("/import", error);
  }
  redirect(`/import?result=${encodeURIComponent(summary)}`);
}

export async function confirmImportAction(form: FormData) {
  const user = await requireIdentity();
  const batchId = str(form, "batchId");
  const selections: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (key.startsWith("row:") && typeof value === "string") selections[key.slice(4)] = value;
  const report = await confirmBatch(getDatabase().db, user.id, batchId, selections);
  redirect(`/import?result=${encodeURIComponent(`Imported ${report.imported}; skipped ${report.skipped}; invalid ${report.invalid}`)}`);
}
