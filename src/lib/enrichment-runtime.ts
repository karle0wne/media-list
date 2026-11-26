import { after } from "next/server";
import { getDatabase } from "@/db";
import {
  enrichMediaMetadata,
  enrichPendingBacklog,
  enrichPendingMedia,
} from "./services/enrichment";

declare global {
  var __mediaListBacklogDrain: Promise<unknown> | undefined;
  var __mediaListTotalQueue: Set<string> | undefined;
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

/**
 * Works through the pending backlog and the queued total lookups after a bulk add. One drain
 * runs at a time; a request made while it runs adds its lookups to the queue it keeps reading.
 */
export function scheduleEnrichmentBacklog(totalLookups: string[] = []) {
  const queue = (globalThis.__mediaListTotalQueue ??= new Set<string>());
  for (const id of totalLookups) queue.add(id);
  after(async () => {
    if (globalThis.__mediaListBacklogDrain) return;
    const drain = (async () => {
      try {
        // A lookup queued while a pass runs gets its own pass instead of being lost.
        do {
          const lookups = [...queue];
          queue.clear();
          await enrichPendingBacklog(getDatabase().db, { totalLookups: lookups });
        } while (queue.size > 0);
      } catch (error) {
        console.error("metadata backlog enrichment failed", error);
      } finally {
        globalThis.__mediaListBacklogDrain = undefined;
      }
    })();
    globalThis.__mediaListBacklogDrain = drain;
    await drain;
  });
}
