import { after } from "next/server";
import { getDatabase } from "@/db";
import { runBacklogDrain, totalQueue } from "./enrichment-worker";
import { enrichMediaMetadata } from "./services/enrichment";

// Enrichment runs after the response is sent, so no page or action waits for a provider.
// Records a restart or a rate limit left behind are picked up by the recovery loop that the
// instrumentation hook starts (see background.ts), not by page views.

/** Enriches one record right after it was added or its retry was requested. */
export function scheduleMediaEnrichment(mediaId: string) {
  after(async () => {
    try {
      await enrichMediaMetadata(getDatabase().db, mediaId);
    } catch (error) {
      console.error("metadata enrichment callback failed", error);
    }
  });
}

/** Drains the backlog and the given total lookups after a bulk add. */
export function scheduleEnrichmentBacklog(totalLookups: string[] = []) {
  const queue = totalQueue();
  for (const id of totalLookups) queue.add(id);
  after(async () => {
    await runBacklogDrain();
  });
}
