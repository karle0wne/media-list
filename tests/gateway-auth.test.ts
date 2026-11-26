import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  GATEWAY_SECRET_HEADER,
  GatewayAuthError,
  assertGatewayRequest,
  gatewayPolicy,
} from "../src/lib/gateway-auth";
import { identityFromHeaders } from "../src/lib/identity";

const SECRET = "0123456789abcdef0123456789abcdef";
const headersOf = (values: Record<string, string>) => new Headers(values);
const identity = {
  "x-auth-subject": "central-auth:media-list:alex",
  "x-auth-email": "Alex@Example.test",
  "x-auth-name": "Alex",
};
const withSecret = (secret = SECRET) => ({ ...identity, [GATEWAY_SECRET_HEADER]: secret });
const production = { NODE_ENV: "production", GATEWAY_SHARED_SECRET: SECRET };

test("production refuses to run without a gateway secret unless that is explicitly allowed", () => {
  assert.throws(
    () => gatewayPolicy({ NODE_ENV: "production" }),
    /GATEWAY_SHARED_SECRET is not configured/,
  );
  assert.throws(
    () => gatewayPolicy({ NODE_ENV: "production", GATEWAY_SHARED_SECRET: "   " }),
    /not configured/,
  );
  assert.deepEqual(
    gatewayPolicy({ NODE_ENV: "production", ALLOW_UNSIGNED_GATEWAY_HEADERS: "true" }),
    { mode: "open" },
  );
  // Anything other than the literal "true" is not an opt-out.
  assert.throws(() =>
    gatewayPolicy({ NODE_ENV: "production", ALLOW_UNSIGNED_GATEWAY_HEADERS: "1" }),
  );
  for (const NODE_ENV of [undefined, "", "staging", "prod", "Production"])
    assert.throws(
      () => gatewayPolicy({ NODE_ENV }),
      /GATEWAY_SHARED_SECRET is not configured/,
      `NODE_ENV=${NODE_ENV}`,
    );
  assert.deepEqual(gatewayPolicy({ NODE_ENV: "development" }), { mode: "open" });
  assert.deepEqual(gatewayPolicy({ NODE_ENV: "test" }), { mode: "open" });
});

test("a weak secret is a configuration error, not a quietly accepted setting", () => {
  assert.throws(
    () => gatewayPolicy({ NODE_ENV: "development", GATEWAY_SHARED_SECRET: "short" }),
    /at least 32 characters/,
  );
  assert.deepEqual(
    gatewayPolicy({ NODE_ENV: "production", GATEWAY_SHARED_SECRET: ` ${SECRET} ` }),
    {
      mode: "secret",
      secret: SECRET,
    },
  );
});

test("only the exact gateway secret opens a request", () => {
  const policy = gatewayPolicy(production);
  assertGatewayRequest(headersOf({ [GATEWAY_SECRET_HEADER]: SECRET }), policy);
  const rejected: Array<Record<string, string>> = [
    {},
    { [GATEWAY_SECRET_HEADER]: "" },
    { [GATEWAY_SECRET_HEADER]: SECRET.slice(0, -1) },
    { [GATEWAY_SECRET_HEADER]: `${SECRET}x` },
    { [GATEWAY_SECRET_HEADER]: SECRET.toUpperCase() },
    { "x-auth-subject": "someone" },
  ];
  for (const headers of rejected)
    assert.throws(
      () => assertGatewayRequest(headersOf(headers), policy),
      GatewayAuthError,
      JSON.stringify(headers),
    );
});

test("a spoofed identity without the gateway secret is rejected before any header is read", () => {
  process.env.GATEWAY_SHARED_SECRET = SECRET;
  try {
    assert.throws(() => identityFromHeaders(headersOf(identity)), GatewayAuthError);
    assert.throws(
      () => identityFromHeaders(headersOf(withSecret("x".repeat(32)))),
      GatewayAuthError,
    );
    assert.deepEqual(identityFromHeaders(headersOf(withSecret())), {
      subject: "central-auth:media-list:alex",
      email: "alex@example.test",
      name: "alex",
    });
  } finally {
    delete process.env.GATEWAY_SHARED_SECRET;
  }
});

test("identity headers are validated: missing, oversized or injected values are refused", (t) => {
  // A test runtime without a secret is open, so only the headers matter.
  const env = process.env as Record<string, string | undefined>;
  const saved = env.NODE_ENV;
  env.NODE_ENV = "test";
  t.after(() => {
    if (saved === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = saved;
  });
  const base = { ...identity };
  assert.equal(identityFromHeaders(headersOf(base)).email, "alex@example.test");
  for (const [name, value] of [
    ["x-auth-subject", ""],
    ["x-auth-subject", "s".repeat(513)],
    ["x-auth-email", "not-an-email"],
    ["x-auth-email", `${"a".repeat(250)}@example.test`],
    ["x-auth-name", ""],
    ["x-auth-name", "n".repeat(129)],
  ] as const)
    assert.throws(
      () => identityFromHeaders(headersOf({ ...base, [name]: value })),
      GatewayAuthError,
      `${name}=${value.slice(0, 12)}`,
    );
  for (const name of ["x-auth-subject", "x-auth-email", "x-auth-name"]) {
    const missing: Record<string, string> = { ...base };
    delete missing[name];
    assert.throws(() => identityFromHeaders(headersOf(missing)), GatewayAuthError, name);
  }
});

test("the startup check rejects a production installation without gateway credentials", async () => {
  const { assertServerConfig } = await import("../src/lib/server-config");
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: "production", DATABASE_PATH: ":memory:" });
    delete process.env.GATEWAY_SHARED_SECRET;
    delete process.env.ALLOW_UNSIGNED_GATEWAY_HEADERS;
    delete process.env.ENRICHMENT_RECOVERY_INTERVAL_SECONDS;
    assert.throws(() => assertServerConfig(), /GATEWAY_SHARED_SECRET is not configured/);
    process.env.GATEWAY_SHARED_SECRET = "0123456789abcdef0123456789abcdef";
    assert.deepEqual(assertServerConfig(), { recoveryIntervalSeconds: 60 });
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("the pre-start check (npm start, container entrypoint) fails closed, whatever NODE_ENV says", () => {
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, ["--import", "tsx", "scripts/check-config.ts"], {
      env: {
        PATH: process.env.PATH ?? "",
        DATABASE_PATH: ":memory:",
        DOTENV_CONFIG_PATH: "/nonexistent/.env", // a developer's .env must not leak in
        ...env,
      } as unknown as NodeJS.ProcessEnv,
      encoding: "utf8",
    });
  for (const NODE_ENV of [undefined, "production", "staging"]) {
    const result = run(NODE_ENV ? { NODE_ENV } : {});
    assert.equal(result.status, 1, `NODE_ENV=${NODE_ENV}: ${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /GATEWAY_SHARED_SECRET is not configured/);
  }
  const ok = run({ GATEWAY_SHARED_SECRET: SECRET });
  assert.equal(ok.status, 0, ok.stderr);
});
