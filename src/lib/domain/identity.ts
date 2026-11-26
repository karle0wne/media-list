import { SOURCES } from "../providers/catalog";
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
 * an enrichment that is certain to fail. The per-provider rules live in the provider catalog.
 */
export function assertWellFormedIdentity(identity: MediaIdentity) {
  const { source, externalId, externalSubId } = identity;
  const info = SOURCES[source];
  if (!info) throw new Error(`Unsupported source ${String(source)}`);
  const problem = info.identityProblem(identity);
  if (problem)
    throw new Error(
      `${source} ${externalId}${externalSubId ? `/${externalSubId}` : ""}: ${problem}`,
    );
}
