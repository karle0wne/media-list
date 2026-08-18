import { after } from "next/server";
import { getDatabase } from "@/db";
import { enrichMediaMetadata, enrichPendingMedia } from "./services/enrichment";

export function scheduleMediaEnrichment(mediaId?: string) {
  after(async () => {
    try {
      const { db } = getDatabase();
      if (mediaId) await enrichMediaMetadata(db, mediaId);
      else await enrichPendingMedia(db, 3);
    } catch (error) {
      console.error("metadata enrichment callback failed", error);
    }
  });
}
