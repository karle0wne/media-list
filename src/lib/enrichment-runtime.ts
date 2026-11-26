import { after } from "next/server";
import { getDatabase } from "@/db";
import {
  adoptTotalsForMedia,
  enrichMediaMetadata,
  enrichPendingBacklog,
  enrichPendingMedia,
} from "./services/enrichment";

declare global {
  var __mediaListBacklogDrain: Promise<unknown> | undefined;
  var __mediaListTotalQueue: Set<string> | undefined;
}

// Enrichment runs after the response is sent, so no page or action waits for a provider.

function totalQueue() {
  return (globalThis.__mediaListTotalQueue ??= new Set<string>());
}

/**
 * Cheap recovery pass for a page view: a few pending records, and a few queued total lookups
 * that an earlier drain could not finish because their provider was unavailable.
 */
async function recoverSome() {
  const { db } = getDatabase();
  await enrichPendingMedia(db, 3);
  const queue = totalQueue();
  for (const mediaId of [...queue].slice(0, 3)) {
    queue.delete(mediaId);
    try {
      const result = await adoptTotalsForMedia(db, mediaId);
      if (result.state === "deferred") queue.add(mediaId);
    } catch (error) {
      queue.add(mediaId);
      throw error;
    }
  }
}

/** Enriches one record, or a few pending ones when no id is given (cheap recovery path). */
export function scheduleMediaEnrichment(mediaId?: string) {
  after(async () => {
    try {
      if (!mediaId && globalThis.__mediaListBacklogDrain) return;
      if (mediaId) await enrichMediaMetadata(getDatabase().db, mediaId);
      else await recoverSome();
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
  const queue = totalQueue();
  for (const id of totalLookups) queue.add(id);
  after(async () => {
    if (globalThis.__mediaListBacklogDrain) return;
    const drain = (async () => {
      try {
        // A lookup queued while a pass runs gets its own pass instead of being lost.
        do {
          const lookups = [...queue];
          queue.clear();
          try {
            const { unfinished } = await enrichPendingBacklog(getDatabase().db, {
              totalLookups: lookups,
            });
            // The provider is unavailable for longer than a drain waits: keep the lookups for a
            // later pass (a page view or the next import) and stop instead of spinning.
            if (unfinished.length) {
              for (const id of unfinished) queue.add(id);
              break;
            }
          } catch (error) {
            for (const id of lookups) queue.add(id);
            throw error;
          }
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
