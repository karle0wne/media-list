import { NextResponse, type NextRequest } from "next/server";
import { GatewayAuthError, assertGatewayRequest } from "@/lib/gateway-auth";

/**
 * Refuses every request that did not come through the gateway, before any page, action or
 * route handler runs. Identity resolution repeats the check (see lib/identity.ts), so a
 * mistake in this matcher can never expose data on its own.
 */
export function proxy(request: NextRequest) {
  try {
    assertGatewayRequest(request.headers);
  } catch (error) {
    // Anything else is a configuration fault (no secret in production) and should surface as one.
    if (!(error instanceof GatewayAuthError)) throw error;
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "cache-control": "no-store" },
    });
  }
  return NextResponse.next();
}

// Everything except the health probe: pages, server actions, exports, static files and the
// image optimizer all sit behind the gateway.
export const config = { matcher: ["/((?!api/health$).*)"] };
