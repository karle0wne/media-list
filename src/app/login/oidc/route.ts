import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieSecure } from "@/lib/env";
import { appUrl, buildOidcAuthorizationUrl, createOidcRequest, oidcConfigured } from "@/lib/oidc";

const COOKIE_PATH = "/login/oidc";
const STATE_COOKIE = "media_list_oidc_state";
const VERIFIER_COOKIE = "media_list_oidc_verifier";

export async function GET() {
  if (!oidcConfigured()) return NextResponse.json({ error: "Central sign-in is not configured" }, { status: 503 });
  try {
    const { state, verifier, challenge } = createOidcRequest();
    const jar = await cookies();
    const options = { httpOnly: true, sameSite: "lax" as const, secure: cookieSecure(), path: COOKIE_PATH, maxAge: 600 };
    jar.set(STATE_COOKIE, state, options);
    jar.set(VERIFIER_COOKIE, verifier, options);
    return NextResponse.redirect(await buildOidcAuthorizationUrl(state, challenge));
  } catch (error) {
    console.error("OIDC authorization failed", error);
    return NextResponse.redirect(appUrl("/login?error=Central%20sign-in%20is%20temporarily%20unavailable"));
  }
}
