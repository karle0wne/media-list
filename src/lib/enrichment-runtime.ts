import { after } from "next/server";
import { getDatabase } from "@/db";
import {
  enrichMediaMetadata,
  enrichPendingBacklog,
  enrichPendingMedia,
} from "./services/enrichment";

declare global {
  var __mediaListBacklogDrain: Promise<unknown> | undefined;
}

// Enrichment runs after the response is sent, so no page or action waits for a provider.

/** Enriches one record, or a few pending ones when no id is given (cheap recovery path). */
export function scheduleMediaEnrichment(mediaId?: string) {
  after(async () => {
    try {
      if (!mediaId && globalThis.__mediaListBacklogDrain) return;
      const { db } = getDatabase();
      if (mediaId) await enrichMediaMetadata(db, mediaId);
      else await enrichPendingMedia(db, 3);
    } catch (error) {
      console.error("metadata enrichment callback failed", error);
    }
  });
}

/** Works through the whole pending backlog after a bulk add; one drain runs at a time. */
export function scheduleEnrichmentBacklog() {
  after(async () => {
    if (globalThis.__mediaListBacklogDrain) return;
    const drain = enrichPendingBacklog(getDatabase().db)
      .catch((error) => console.error("metadata backlog enrichment failed", error))
      .finally(() => {
        globalThis.__mediaListBacklogDrain = undefined;
      });
    globalThis.__mediaListBacklogDrain = drain;
    await drain;
  });
}
