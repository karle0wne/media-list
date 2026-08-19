import test from "node:test";
import assert from "node:assert/strict";
import { providerFetch, providerResponseError, ProviderResponseError } from "../src/lib/providers/http";

test("providerFetch aborts a stalled provider at the configured deadline", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, init) => await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return reject(new Error("missing signal"));
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    await assert.rejects(() => providerFetch("https://provider.invalid/test", {}, 15), /Provider request timed out after 15ms/);
  } finally { globalThis.fetch = originalFetch; }
});

test("providerFetch preserves a normal provider response", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, init) => { assert.ok(init?.signal); return new Response("ok", { status: 200 }); };
    const response = await providerFetch("https://provider.invalid/test", {}, 50);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok");
  } finally { globalThis.fetch = originalFetch; }
});

test("rate limits become explicit retry-later provider errors without retries", () => {
  const error = providerResponseError("Example", new Response("limited", { status: 429, headers: { "retry-after": "60" } }));
  assert.ok(error instanceof ProviderResponseError);
  assert.equal(error.status, 429);
  assert.equal(error.retryAfterSeconds, 60);
  assert.match(error.message, /rate limit reached/);
  assert.match(error.message, /saved list is unaffected/);
});
