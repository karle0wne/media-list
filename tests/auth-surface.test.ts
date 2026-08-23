import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("interactive authentication surface is OIDC-only", () => {
  assert.equal(existsSync("src/app/login/magic/page.tsx"), false);
  assert.equal(existsSync("src/app/register/page.tsx"), false);
  assert.equal(existsSync("src/app/reset-password/page.tsx"), false);
  assert.equal(existsSync("src/app/admin/page.tsx"), false);

  const login = read("src/app/login/page.tsx");
  assert.match(login, /Continue with Google/);
  assert.match(login, /href="\/login\/oidc"/);
  assert.doesNotMatch(login, /password|magic|email me|fallback/i);

  const layout = read("src/app/layout.tsx");
  assert.doesNotMatch(layout, /href="\/admin"|>Users</);

  const actions = read("src/app/actions.ts");
  for (const name of [
    "loginAction",
    "requestMagicLinkAction",
    "consumeMagicLoginAction",
    "registerAction",
    "createInviteAction",
    "createPasswordResetAction",
    "resetPasswordAction",
  ]) assert.doesNotMatch(actions, new RegExp(`\\b${name}\\b`));
});

test("OIDC redirects use APP_BASE_URL rather than the reverse-proxy request origin", () => {
  const oidc = read("src/lib/oidc.ts");
  const start = read("src/app/login/oidc/route.ts");
  const callback = read("src/app/login/oidc/callback/route.ts");

  assert.match(oidc, /export function appUrl/);
  assert.match(oidc, /required\("APP_BASE_URL"\)/);
  assert.match(callback, /NextResponse\.redirect\(appUrl\("\/"\)\)/);
  assert.doesNotMatch(start, /new URL\([^\n]+request\.url/);
  assert.doesNotMatch(callback, /NextResponse\.redirect\(new URL\([^\n]+request\.url/);
});

test("production auth configuration no longer advertises email or password auth", () => {
  const example = read(".env.example");
  assert.match(example, /APP_BASE_URL=/);
  assert.match(example, /OIDC_ISSUER=/);
  assert.match(example, /OIDC_CLIENT_ID=/);
  assert.match(example, /OIDC_CLIENT_SECRET=/);
  assert.doesNotMatch(example, /BREVO_API_KEY|MAGIC_LINK_FROM/);
});
