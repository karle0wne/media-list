import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "../src/proxy";

const SECRET = "0123456789abcdef0123456789abcdef";

function withGatewayEnv(env: Record<string, string | undefined>, run: () => void) {
  const saved = { ...process.env };
  try {
    for (const [key, value] of Object.entries(env))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    run();
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}
const request = (headers: Record<string, string> = {}) =>
  new NextRequest("http://127.0.0.1:3000/", { headers });

test("a request without the gateway secret is answered 401 and never reaches the application", () => {
  withGatewayEnv({ NODE_ENV: "production", GATEWAY_SHARED_SECRET: SECRET }, () => {
    const rejected: Array<Record<string, string>> = [
      {},
      { "x-auth-subject": "someone", "x-auth-email": "a@example.test", "x-auth-name": "someone" },
      { "x-gateway-secret": "wrong".repeat(8) },
    ];
    for (const headers of rejected) {
      const response = proxy(request(headers));
      assert.equal(response.status, 401, JSON.stringify(headers));
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-middleware-next"), null, "the request is not forwarded");
    }
  });
});

test("a request carrying the gateway secret is passed on", () => {
  withGatewayEnv({ NODE_ENV: "production", GATEWAY_SHARED_SECRET: SECRET }, () => {
    const response = proxy(request({ "x-gateway-secret": SECRET }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
  });
});

test("a production server without a secret fails loudly instead of letting requests through", () => {
  withGatewayEnv(
    {
      NODE_ENV: "production",
      GATEWAY_SHARED_SECRET: undefined,
      ALLOW_UNSIGNED_GATEWAY_HEADERS: undefined,
    },
    () => assert.throws(() => proxy(request()), /GATEWAY_SHARED_SECRET is not configured/),
  );
});

test("everything is behind the proxy except the health probe", () => {
  const matches = (path: string) => unstable_doesMiddlewareMatch({ config, url: path });
  for (const path of [
    "/",
    "/import",
    "/import/review/abc",
    "/media/new",
    "/api/export",
    "/api/export/markdown",
    "/_next/image?url=x&w=64&q=75",
    "/_next/static/chunks/app.js",
    "/icon.svg",
    "/api/health/extra",
    "/api/healthz",
  ])
    assert.equal(matches(path), true, path);
  assert.equal(matches("/api/health"), false);
});
