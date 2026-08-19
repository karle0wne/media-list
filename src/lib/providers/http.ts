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

export async function providerFetch(input: string | URL | Request, init: RequestInit = {}, timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS) {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new Error(`Provider request timed out after ${timeoutMs}ms`, { cause: error });
    throw error;
  }
}

export function providerResponseError(provider: string, response: Response) {
  return new ProviderResponseError(provider, response.status, retryAfterSeconds(response.headers.get("retry-after")));
}

function providerMessage(provider: string, status: number, retryAfter: number | null) {
  if (status === 429) return `${provider} rate limit reached${retryAfter != null ? `; retry in about ${retryAfter}s` : ""}. Your saved list is unaffected; metadata can be retried later.`;
  if (status >= 500) return `${provider} is temporarily unavailable (${status}). Your saved list is unaffected; metadata can be retried later.`;
  return `${provider} request failed: ${status}`;
}

function retryAfterSeconds(value: string | null) {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - Date.now()) / 1000)) : null;
}
