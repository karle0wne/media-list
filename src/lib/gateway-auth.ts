import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The application trusts `X-Auth-*` headers only from the gateway in front of it. Network
 * placement is the first line of defence; this shared secret is the second: the gateway adds
 * it to every request it forwards (and strips any copy a client sends), so a request that
 * reaches the application by another route carries no valid secret and is refused.
 */
export const GATEWAY_SECRET_HEADER = "x-gateway-secret";
const MIN_SECRET_LENGTH = 32;

/** The request does not come with valid gateway credentials. Maps to HTTP 401. */
export class GatewayAuthError extends Error {
  readonly status = 401;
  constructor(message: string) {
    super(message);
    this.name = "GatewayAuthError";
  }
}

type Env = Record<string, string | undefined>;
let warnedUnsigned = false;
export type HeaderSource = { get(name: string): string | null };

export type GatewayPolicy =
  | { mode: "secret"; secret: string }
  /** Explicit opt-out for development and for installations isolated by the network alone. */
  | { mode: "open" };

/**
 * Fails closed: outside an explicit development/test runtime the secret is mandatory, and a weak
 * one is rejected rather than silently accepted. Only `ALLOW_UNSIGNED_GATEWAY_HEADERS=true` lets
 * requests through without it.
 */
export function gatewayPolicy(env: Env = process.env): GatewayPolicy {
  const secret = env.GATEWAY_SHARED_SECRET?.trim();
  if (secret) {
    if (secret.length < MIN_SECRET_LENGTH)
      throw new Error(`GATEWAY_SHARED_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    return { mode: "secret", secret };
  }
  // Only an explicit development or test runtime is open. An unset or unrecognised NODE_ENV
  // (a typo, "staging") is treated like production: it must not weaken the boundary.
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return { mode: "open" };
  if (env.ALLOW_UNSIGNED_GATEWAY_HEADERS === "true") {
    if (!warnedUnsigned) {
      warnedUnsigned = true;
      console.warn(
        "ALLOW_UNSIGNED_GATEWAY_HEADERS=true: X-Auth-* headers are trusted without a gateway secret.",
      );
    }
    return { mode: "open" };
  }
  throw new Error(
    "GATEWAY_SHARED_SECRET is not configured. Set it (and have the gateway send it as " +
      "X-Gateway-Secret), or set ALLOW_UNSIGNED_GATEWAY_HEADERS=true if the network alone isolates this service.",
  );
}

export function assertGatewayRequest(headers: HeaderSource, policy = gatewayPolicy()) {
  if (policy.mode === "open") return;
  const provided = headers.get(GATEWAY_SECRET_HEADER);
  if (!provided || !secretsMatch(provided, policy.secret))
    throw new GatewayAuthError("Missing or invalid gateway credentials");
}

function secretsMatch(provided: string, expected: string) {
  // Hashing first gives equal-length buffers, so the comparison is constant time for any input.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}
