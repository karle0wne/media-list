import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("media-list no longer owns an authentication surface", () => {
  for (const path of [
    "src/app/login/page.tsx",
    "src/app/login/oidc/route.ts",
    "src/app/login/oidc/callback/route.ts",
    "src/app/login/magic/page.tsx",
    "src/app/register/page.tsx",
    "src/app/reset-password/page.tsx",
    "src/app/admin/page.tsx",
    "src/lib/auth.ts",
    "src/lib/oidc.ts",
    "src/lib/crypto.ts",
    "src/lib/mail.ts",
    "src/lib/services/users.ts",
    "src/lib/services/external-users.ts",
  ]) assert.equal(existsSync(path), false, `${path} must stay removed`);

  const pkg = read("package.json");
  assert.doesNotMatch(pkg, /admin:create|admin:set-password|admin:create-password-reset/);

  const example = read(".env.example");
  assert.doesNotMatch(example, /OIDC_|SESSION_|COOKIE_SECURE|MAX_USERS|BREVO_|MAGIC_LINK/);
});

test("all request identity comes from the trusted gateway contract", () => {
  const identity = read("src/lib/identity.ts");
  assert.match(identity, /x-auth-subject/);
  assert.match(identity, /x-auth-email/);
  assert.match(identity, /x-auth-name/);
  assert.match(identity, /resolveTrustedIdentity/);

  const layout = read("src/app/layout.tsx");
  assert.match(layout, /requireIdentity/);
  assert.doesNotMatch(layout, /Users|\/admin|logoutAction/);
});
