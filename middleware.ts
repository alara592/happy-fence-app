import { NextRequest, NextResponse } from "next/server";
// Relative import on purpose: Vercel's edge bundler rejects the "@/" alias in middleware.
import { AUTH_COOKIE, pinToken } from "./lib/auth-token";

/**
 * The whole app sits behind the shared device PIN (spec D1). Pages redirect to
 * /unlock; API routes get a 401. Only the unlock screen + its API are open.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Open: the unlock screen/API, and the cron sync route (it guards itself with
  // CRON_SECRET, and the scheduler/pg_cron can't carry the PIN cookie).
  if (
    pathname === "/unlock" ||
    pathname === "/api/unlock" ||
    pathname.startsWith("/api/cron/")
  ) {
    return NextResponse.next();
  }

  const pin = process.env.APP_PIN;
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (pin && cookie && cookie === (await pinToken(pin))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals and static assets.
  matcher: ["/((?!_next/|favicon.ico|manifest.json|icons/|brand/).*)"],
};
