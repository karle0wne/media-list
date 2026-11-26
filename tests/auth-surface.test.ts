import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
  ])
    assert.equal(existsSync(path), false, `${path} must stay removed`);

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

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

test("every server action resolves the gateway identity before doing anything else", () => {
  const source = read("src/app/actions.ts");
  assert.match(source, /^"use server";/);
  const exported = source.split(/^export /m).slice(1);
  assert.ok(exported.length >= 8, "actions were found");
  for (const chunk of exported) {
    const name = chunk.match(/^async function (\w+)/)?.[1];
    assert.ok(
      name,
      `only async functions may be exported from a "use server" file: ${chunk.slice(0, 40)}`,
    );
    const body = chunk.slice(chunk.indexOf("{"));
    const firstAwait = body.indexOf("await ");
    assert.ok(
      firstAwait >= 0 && body.slice(firstAwait).startsWith("await requireIdentity()"),
      `${name} must call requireIdentity() first`,
    );
  }
});

test("every page and API route is behind the identity check, except the health probe", () => {
  const files = sourceFiles("src/app");
  const pages = files.filter((file) => /\/page\.tsx$/.test(file));
  const routes = files.filter((file) => /\/route\.ts$/.test(file));
  assert.ok(pages.length >= 4 && routes.length >= 3);
  for (const page of pages)
    assert.match(
      read(page),
      /await requireIdentity\(\)/,
      `${page} must not rely on the layout alone`,
    );
  for (const route of routes) {
    if (route.endsWith("api/health/route.ts")) continue;
    assert.match(
      read(route),
      /withIdentity\(|await requireIdentity\(\)/,
      `${route} must authenticate`,
    );
  }
  // No other entry point may sneak in: a new kind of file here needs its own review.
  const entryPoints = files.filter((file) =>
    /(?:^|\/)(?:middleware|proxy|route|page|layout|actions)\.tsx?$/.test(file),
  );
  assert.deepEqual(
    entryPoints.filter((file) => !/\/(?:page|route|layout|actions)\.tsx?$/.test(file)),
    [],
  );
});

test("the health probe exposes nothing but liveness and the revision", () => {
  const health = read("src/app/api/health/route.ts");
  assert.doesNotMatch(health, /requireIdentity|media|users|select\(\)\.from/);
  assert.match(health, /ok: true/);
});

test("the gateway secret is part of the documented contract and is never committed", () => {
  assert.match(read(".env.example"), /^GATEWAY_SHARED_SECRET=$/m);
  assert.match(read("README.md"), /X-Gateway-Secret/);
  assert.match(read("playwright.config.ts"), /X-Gateway-Secret/);
  assert.match(read("src/proxy.ts"), /assertGatewayRequest\(request\.headers\)/);
});
