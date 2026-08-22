import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieSecure } from "@/lib/env";
import { buildOidcAuthorizationUrl, createOidcRequest, oidcConfigured } from "@/lib/oidc";

const COOKIE_PATH = "/login/oidc";
const STATE_COOKIE = "media_list_oidc_state";
const VERIFIER_COOKIE = "media_list_oidc_verifier";

export async function GET(request: Request) {
  if (!oidcConfigured()) return NextResponse.redirect(new URL("/login?error=Central%20sign-in%20is%20not%20configured", request.url));
  try {
    const { state, verifier, challenge } = createOidcRequest();
    const jar = await cookies();
    const options = { httpOnly: true, sameSite: "lax" as const, secure: cookieSecure(), path: COOKIE_PATH, maxAge: 600 };
    jar.set(STATE_COOKIE, state, options);
    jar.set(VERIFIER_COOKIE, verifier, options);
    return NextResponse.redirect(await buildOidcAuthorizationUrl(state, challenge));
  } catch (error) {
    console.error("OIDC authorization failed", error);
    return NextResponse.redirect(new URL("/login?error=Central%20sign-in%20is%20temporarily%20unavailable", request.url));
  }
}
