const DEFAULT_PROVIDER_TIMEOUT_MS = 5_000;

export class ProviderResponseError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number,
    public readonly retryAfterSeconds: number | null,
  ) {
    super(providerMessage(provider, status, retryAfterSeconds));
    this.name = "ProviderResponseError";
  }
}

/**
 * The provider answered authoritatively that the item does not exist. This is the only failure
 * that exact lookups may turn into `null`; rate limits, outages and timeouts must propagate so
 * callers can show a retry-later state instead of "not found".
 */
export class ProviderNotFoundError extends Error {
  constructor(public readonly provider: string) {
    super(`${provider} item not found`);
    this.name = "ProviderNotFoundError";
  }
}

export async function nullIfNotFound<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProviderNotFoundError) return null;
    throw error;
  }
}

/** The installation has no credentials for this provider; no request was made. */
export class ProviderNotConfiguredError extends Error {
  constructor(variable: string) {
    super(`${variable} is not configured`);
    this.name = "ProviderNotConfiguredError";
  }
}

/** The provider did not answer in time. */
export class ProviderTimeoutError extends Error {
  constructor(timeoutMs: number, options?: ErrorOptions) {
    super(`Provider request timed out after ${timeoutMs}ms`, options);
    this.name = "ProviderTimeoutError";
  }
}

/** The provider could not be reached at all (DNS, connection reset, offline). */
export class ProviderNetworkError extends Error {
  constructor(detail: string, options?: ErrorOptions) {
    super(`Provider unreachable: ${detail}`, options);
    this.name = "ProviderNetworkError";
  }
}

/**
 * Failures that say nothing about the item and are worth trying again later: rate limits,
 * provider outages, timeouts and unreachable networks. Anything else (a missing token, an
 * identity mismatch, a rejected id) will fail the same way next time.
 */
export function isTemporaryProviderFailure(error: unknown) {
  if (error instanceof ProviderResponseError) return error.status === 429 || error.status >= 500;
  return error instanceof ProviderTimeoutError || error instanceof ProviderNetworkError;
}

export async function providerFetch(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
) {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new ProviderTimeoutError(timeoutMs, { cause: error });
    if (error instanceof TypeError) throw new ProviderNetworkError(error.message, { cause: error });
    throw error;
  }
}

export function providerResponseError(provider: string, response: Response) {
  return new ProviderResponseError(
    provider,
    response.status,
    retryAfterSeconds(response.headers.get("retry-after")),
  );
}

function providerMessage(provider: string, status: number, retryAfter: number | null) {
  if (status === 429)
    return `${provider} rate limit reached${retryAfter != null ? `; retry in about ${retryAfter}s` : ""}. Your saved list is unaffected; metadata can be retried later.`;
  if (status >= 500)
    return `${provider} is temporarily unavailable (${status}). Your saved list is unaffected; metadata can be retried later.`;
  return `${provider} request failed: ${status}`;
}

function retryAfterSeconds(value: string | null) {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - Date.now()) / 1000)) : null;
}
