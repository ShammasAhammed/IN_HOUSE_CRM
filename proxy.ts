// Optimistic check only: no session cookie → go to sign-in. Real verification (and roles) happens on the
// server for every request in lib/server/session.ts.
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

/** Pages addressed by a record id, and the fixed pages that share their place ("/tasks/calendar"). */
const BY_ID: Array<{ base: RegExp; fixed: readonly string[] }> = [
  { base: /^\/tasks\/([^/]+)/, fixed: ["calendar", "setup", "timeline"] },
  { base: /^\/clients\/([^/]+)/, fixed: ["new", "won"] },
  { base: /^\/projects\/([^/]+)/, fixed: [] },
  { base: /^\/people\/interns\/([^/]+)/, fixed: [] },
  { base: /^\/people\/([^/]+)/, fixed: ["new", "checklists", "interns", "letters", "teams"] },
  { base: /^\/engagements\/([^/]+)/, fixed: [] },
  { base: /^\/creatives\/([^/]+)/, fixed: [] },
  { base: /^\/docs\/([^/]+)/, fixed: ["new"] },
  { base: /^\/requests\/([^/]+)/, fixed: ["new"] },
  { base: /^\/growth\/([^/]+)/, fixed: ["skills"] },
  { base: /^\/letters\/([^/]+)/, fixed: [] },
  { base: /^\/reports\/([^/]+)/, fixed: [] },
  { base: /^\/sales\/leads\/([^/]+)/, fixed: ["export"] },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A record address with an id that can't exist ("/tasks/garbage-text") gets a real 404 before the page streams
 * (QA S8-B4). Pages stream, so a well-formed id that isn't found still shows "not found" inside a 200.
 */
function impossibleId(path: string): boolean {
  for (const { base, fixed } of BY_ID) {
    const m = base.exec(path);
    if (m) return !fixed.includes(m[1]!) && !UUID.test(m[1]!);
  }
  return false;
}

export function proxy(request: NextRequest) {
  const signedIn = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (signedIn) {
    if (impossibleId(request.nextUrl.pathname)) return NextResponse.rewrite(new URL("/not-found", request.url), { status: 404 });
    return NextResponse.next();
  }
  const url = new URL("/sign-in", request.url);
  if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except sign-in, Auth.js routes, scheduled jobs (they check their own secret), the MCP and its OAuth
  // endpoints (they check their own tokens), lead intake (keys and signatures), Next internals and static files.
  // The client portal's sign-in and one-time link pages too (Stage 11.6); the portal checks its own session.
  matcher: ["/((?!sign-in|portal/sign-in|portal/link/|r/|api/auth|api/jobs|api/mcp|api/oauth|api/lead/|api/meta-webhook|api/google-lead|api/google-conversions|\\.well-known|_next/static|_next/image|favicon.ico|icon|manifest|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
