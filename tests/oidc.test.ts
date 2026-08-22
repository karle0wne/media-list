import assert from "node:assert/strict";
import test from "node:test";
import { identityFromUserInfo } from "../src/lib/oidc";

function withOidcEnv(run: () => void) {
  const previous = { ...process.env };
  process.env.OIDC_ISSUER = "https://auth.example.test/";
  process.env.OIDC_ADMIN_ROLE = "media-list-admin";
  process.env.OIDC_USER_ROLE = "media-list-user";
  try { run(); } finally { process.env = previous; }
}

test("maps service-scoped IAM roles and stable subject", () => withOidcEnv(() => {
  const identity = identityFromUserInfo({
    sub: "google-user-123",
    email: "Admin@Example.com",
    email_verified: true,
    preferred_username: "admin",
    roles: ["another-service-user", "media-list-admin"],
  });
  assert.deepEqual(identity, {
    subject: "https://auth.example.test|google-user-123",
    email: "admin@example.com",
    preferredUsername: "admin",
    role: "ADMIN",
  });
}));

test("denies identities without a media-list role", () => withOidcEnv(() => {
  assert.throws(() => identityFromUserInfo({
    sub: "user-1",
    email: "user@example.com",
    email_verified: true,
    roles: ["service-b-user"],
  }), /not allowed/);
}));

test("requires a verified email", () => withOidcEnv(() => {
  assert.throws(() => identityFromUserInfo({
    sub: "user-1",
    email: "user@example.com",
    email_verified: false,
    roles: ["media-list-user"],
  }), /not verified/);
}));
