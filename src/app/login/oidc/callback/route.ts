import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { exchangeOidcCode } from "@/lib/oidc";
import { resolveExternalUser } from "@/lib/services/external-users";
import { getDatabase } from "@/db";

const COOKIE_PATH = "/login/oidc";
const STATE_COOKIE = "media_list_oidc_state";
const VERIFIER_COOKIE = "media_list_oidc_verifier";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  const verifier = jar.get(VERIFIER_COOKIE)?.value;
  clearTransientCookies(jar);

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!expectedState || !verifier || !state || state !== expectedState || !code)
    return NextResponse.redirect(new URL("/login?error=Central%20sign-in%20response%20is%20invalid%20or%20expired", request.url));

  try {
    const identity = await exchangeOidcCode(code, verifier);
    const userId = await resolveExternalUser(getDatabase().db, identity);
    await createSession(userId);
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("OIDC callback failed", error);
    const message = error instanceof Error && error.message === "This account is not allowed to use media-list"
      ? "This account is not allowed to use media-list"
      : "Central sign-in failed";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, request.url));
  }
}

function clearTransientCookies(jar: Awaited<ReturnType<typeof cookies>>) {
  const options = { httpOnly: true, sameSite: "lax" as const, path: COOKIE_PATH, maxAge: 0 };
  jar.set(STATE_COOKIE, "", options);
  jar.set(VERIFIER_COOKIE, "", options);
}
