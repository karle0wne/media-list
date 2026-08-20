import test from "node:test";
import assert from "node:assert/strict";
import { magicLinkMailConfigured, sendMagicLinkEmail } from "../src/lib/mail";

test("Brevo adapter sends the magic link with API-key authentication", async () => {
  const previous = { key: process.env.BREVO_API_KEY, from: process.env.MAGIC_LINK_FROM, base: process.env.APP_BASE_URL };
  process.env.BREVO_API_KEY = "xkeysib-test";
  process.env.MAGIC_LINK_FROM = "login@example.com";
  process.env.APP_BASE_URL = "https://media.example.com";
  try {
    assert.equal(magicLinkMailConfigured(), true);
    let captured: { input?: string; init?: RequestInit } = {};
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      captured = { input: String(input), init };
      return new Response(JSON.stringify({ messageId: "message_1" }), { status: 201, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    await sendMagicLinkEmail("allowed@example.com", "https://media.example.com/login/magic?token=abc", fakeFetch);

    assert.equal(captured.input, "https://api.brevo.com/v3/smtp/email");
    const headers = captured.init?.headers as Record<string, string>;
    assert.equal(headers["api-key"], "xkeysib-test");
    assert.equal(headers.Accept, "application/json");
    const body = JSON.parse(String(captured.init?.body));
    assert.deepEqual(body.sender, { name: "media-list", email: "login@example.com" });
    assert.deepEqual(body.to, [{ email: "allowed@example.com" }]);
    assert.match(body.textContent, /token=abc/);
  } finally {
    if (previous.key === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = previous.key;
    if (previous.from === undefined) delete process.env.MAGIC_LINK_FROM;
    else process.env.MAGIC_LINK_FROM = previous.from;
    if (previous.base === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = previous.base;
  }
});

test("Brevo adapter fails closed on provider errors", async () => {
  const previous = { key: process.env.BREVO_API_KEY, from: process.env.MAGIC_LINK_FROM };
  process.env.BREVO_API_KEY = "xkeysib-test";
  process.env.MAGIC_LINK_FROM = "login@example.com";
  try {
    const fakeFetch = (async () => new Response("provider unavailable", { status: 503 })) as typeof fetch;
    await assert.rejects(() => sendMagicLinkEmail("allowed@example.com", "https://example.com/magic", fakeFetch), /503/);
  } finally {
    if (previous.key === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = previous.key;
    if (previous.from === undefined) delete process.env.MAGIC_LINK_FROM;
    else process.env.MAGIC_LINK_FROM = previous.from;
  }
});
