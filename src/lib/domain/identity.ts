import type { MediaIdentity, MediaType } from "../types";

type ExternalIdentity = Pick<MediaIdentity, "source" | "externalId" | "externalSubId">;

/** A provider answer must describe exactly the work that was asked for. */
export function assertSameIdentity(
  candidate: ExternalIdentity & { type: MediaType },
  identity: ExternalIdentity & { type?: MediaType },
) {
  if (
    candidate.source !== identity.source ||
    candidate.externalId !== identity.externalId ||
    candidate.externalSubId !== identity.externalSubId
  )
    throw new Error("Provider returned a different media identity");
  if (identity.type && candidate.type !== identity.type)
    throw new Error(`Provider item type is ${candidate.type}, expected ${identity.type}`);
}

/**
 * Offline shape check of an identity that arrives without provider data (canonical CSV). It
 * rejects ids that can never exist, so garbage does not become a saved position waiting for
 * an enrichment that is certain to fail.
 */
export function assertWellFormedIdentity(identity: MediaIdentity) {
  const { source, externalId, externalSubId, type } = identity;
  const fail = (reason: string): never => {
    throw new Error(
      `${source} ${externalId}${externalSubId ? `/${externalSubId}` : ""}: ${reason}`,
    );
  };
  if (source === "ANILIST") {
    if (type !== "ANIME") fail("type must be ANIME");
    if (!/^\d+$/.test(externalId)) fail("external_id must be numeric");
    if (externalSubId) fail("external_sub_id must be empty");
  } else if (source === "OPENLIBRARY") {
    if (type !== "BOOK") fail("type must be BOOK");
    if (!/^OL\d+W$/.test(externalId)) fail("external_id must look like OL123W");
    if (externalSubId) fail("external_sub_id must be empty");
  } else if (source === "RAWG") {
    if (type !== "GAME") fail("type must be GAME");
    if (!/^\d+$/.test(externalId)) fail("external_id must be numeric");
    if (externalSubId) fail("external_sub_id must be empty");
  } else if (source === "TMDB") {
    if (!/^\d+$/.test(externalId)) fail("external_id must be numeric");
    if (type === "MOVIE") {
      if (externalSubId) fail("external_sub_id must be empty for movies");
    } else if (type === "SERIES") {
      if (!/^season:\d+$/.test(externalSubId)) fail("external_sub_id must look like season:1");
    } else fail("type must be MOVIE or SERIES");
  }
}
