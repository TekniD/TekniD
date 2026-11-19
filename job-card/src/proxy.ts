import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authConfigured, validSession } from "@/lib/server/session";

/**
 * Every page and API route needs a valid PIN session, except the login page,
 * the login API and the static files the PWA needs to boot.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  if (!authConfigured()) {
    // Fail closed: without APP_PIN the app must not expose Invoice Ninja.
    if (process.env.NODE_ENV === "production") {
      return pathname.startsWith("/api/")
        ? NextResponse.json({ error: "APP_PIN is not set on the server" }, { status: 503 })
        : new NextResponse("Job Card is locked: set APP_PIN in .env.local and restart.", { status: 503 });
    }
    return NextResponse.next();
  }

  if (validSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not logged in", login: true }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Skip build assets, icons, manifest, service worker and the vendored worker script.
  matcher: ["/((?!_next/static|_next/image|icons/|vendor/|manifest.json|sw.js|icon.png|favicon.ico).*)"],
};
