const DEFAULT_PROVIDER_TIMEOUT_MS = 5_000;

export async function providerFetch(input: string | URL | Request, init: RequestInit = {}, timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS) {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new Error(`Provider request timed out after ${timeoutMs}ms`, { cause: error });
    throw error;
  }
}
