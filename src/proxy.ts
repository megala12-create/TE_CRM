import { NextResponse, type NextRequest } from "next/server";

// Cheap first gate: no session cookie → login page. Real session validation
// (expiry, deactivated users, permissions) happens server-side in every page/action.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("te_session")) {
    const url = new URL("/login", request.url);
    if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/health|api/cron|_next/static|_next/image|logo.png|favicon.ico).*)"],
};
