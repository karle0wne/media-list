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

export async function providerFetch(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
) {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new Error(`Provider request timed out after ${timeoutMs}ms`, { cause: error });
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
