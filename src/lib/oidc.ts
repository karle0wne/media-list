import { createHash } from "node:crypto";
import { randomToken } from "./crypto";

const OIDC_ENV = ["APP_BASE_URL", "OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET"] as const;

export type OidcRole = "ADMIN" | "USER";
export type OidcIdentity = {
  subject: string;
  email: string;
  preferredUsername: string | null;
  role: OidcRole;
};

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
};

type TokenResponse = { access_token?: unknown };
type UserInfo = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  preferred_username?: unknown;
  roles?: unknown;
};

export function missingOidcConfiguration() {
  return OIDC_ENV.filter(name => !process.env[name]?.trim());
}

export function oidcConfigured() {
  return missingOidcConfiguration().length === 0;
}

export function oidcRoleNames() {
  return {
    admin: process.env.OIDC_ADMIN_ROLE?.trim() || "media-list-admin",
    user: process.env.OIDC_USER_ROLE?.trim() || "media-list-user",
  };
}

export function oidcCallbackUrl() {
  const base = required("APP_BASE_URL");
  return new URL("/login/oidc/callback", base).toString();
}

export function createOidcRequest() {
  const verifier = randomToken(48);
  const state = randomToken();
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, state, challenge };
}

export async function buildOidcAuthorizationUrl(state: string, challenge: string, fetchImpl: typeof fetch = fetch) {
  const discovery = await discover(fetchImpl);
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", required("OIDC_CLIENT_ID"));
  url.searchParams.set("redirect_uri", oidcCallbackUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeOidcCode(code: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<OidcIdentity> {
  if (!code || !verifier) throw new Error("OIDC callback is incomplete");
  const discovery = await discover(fetchImpl);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: oidcCallbackUrl(),
    client_id: required("OIDC_CLIENT_ID"),
    client_secret: required("OIDC_CLIENT_SECRET"),
    code_verifier: verifier,
  });
  const tokenResponse = await fetchImpl(discovery.token_endpoint, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!tokenResponse.ok) throw new Error(`OIDC token exchange failed (${tokenResponse.status})`);
  const token = await tokenResponse.json() as TokenResponse;
  if (typeof token.access_token !== "string" || !token.access_token) throw new Error("OIDC token response has no access token");

  const userInfoResponse = await fetchImpl(discovery.userinfo_endpoint, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!userInfoResponse.ok) throw new Error(`OIDC userinfo failed (${userInfoResponse.status})`);
  return identityFromUserInfo(await userInfoResponse.json() as UserInfo);
}

export function identityFromUserInfo(info: UserInfo): OidcIdentity {
  if (typeof info.sub !== "string" || !info.sub.trim()) throw new Error("OIDC identity has no subject");
  if (typeof info.email !== "string" || !validEmail(info.email)) throw new Error("OIDC identity has no valid email");
  if (info.email_verified !== true) throw new Error("OIDC email is not verified");
  if (!Array.isArray(info.roles) || !info.roles.every(role => typeof role === "string")) throw new Error("OIDC identity has no valid roles claim");
  const names = oidcRoleNames();
  const role = info.roles.includes(names.admin) ? "ADMIN" : info.roles.includes(names.user) ? "USER" : null;
  if (!role) throw new Error("This account is not allowed to use media-list");
  const issuer = normalizeIssuer(required("OIDC_ISSUER"));
  return {
    subject: `${issuer}|${info.sub.trim()}`,
    email: info.email.trim().toLowerCase(),
    preferredUsername: typeof info.preferred_username === "string" && info.preferred_username.trim() ? info.preferred_username.trim() : null,
    role,
  };
}

async function discover(fetchImpl: typeof fetch): Promise<Discovery> {
  const issuer = normalizeIssuer(required("OIDC_ISSUER"));
  const response = await fetchImpl(`${issuer}/.well-known/openid-configuration`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OIDC discovery failed (${response.status})`);
  const value = await response.json() as Partial<Discovery>;
  if (normalizeIssuer(value.issuer || "") !== issuer) throw new Error("OIDC discovery issuer mismatch");
  for (const key of ["authorization_endpoint", "token_endpoint", "userinfo_endpoint"] as const)
    if (typeof value[key] !== "string" || !value[key]) throw new Error(`OIDC discovery missing ${key}`);
  return value as Discovery;
}

function required(name: typeof OIDC_ENV[number]) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function normalizeIssuer(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
