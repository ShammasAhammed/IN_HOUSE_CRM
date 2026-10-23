// An open Idea Board (Stage 13.1). GET: what changed (votes, timer, reactions, comments, a newer save), asked every few
// seconds while the board is visible. POST: saves the scene, gzipped by the browser (a big board is megabytes of JSON
// and a request is capped at 4.5 MB on Vercel); the service refuses a save from an old version.
import { gunzipSync } from "node:zlib";
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";

const NO_STORE = { "Cache-Control": "private, no-store" };
const STATUS: Record<string, number> = { not_found: 404, forbidden: 403, conflict: 409, invalid: 400 };

export async function GET(_: Request, ctx: RouteContext<"/api/boards/[id]">) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Signed out." }, { status: 401, headers: NO_STORE });
  const { id } = await ctx.params;
  const r = await getServices().boards.state(actor, id);
  if (!r.ok) return Response.json({ error: r.error.message }, { status: STATUS[r.error.code] ?? 400, headers: NO_STORE });
  return Response.json(r.value, { headers: NO_STORE });
}

export async function POST(request: Request, ctx: RouteContext<"/api/boards/[id]">) {
  // Same-site pages only (session cookies are SameSite=Lax; this closes the rest).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return Response.json({ error: "Not allowed." }, { status: 403, headers: NO_STORE });
  const actor = await getActor();
  if (!actor) return Response.json({ error: "You were signed out. Sign in again; your last changes weren't saved." }, { status: 401, headers: NO_STORE });
  const { id } = await ctx.params;
  let body: unknown;
  try {
    const raw = Buffer.from(await request.arrayBuffer());
    // 12 MB of JSON at most once unpacked (MAX_SCENE_BYTES), with room for the thumbnail.
    const text = request.headers.get("x-body-encoding") === "gzip" ? gunzipSync(raw, { maxOutputLength: 13_000_000 }).toString("utf8") : raw.toString("utf8");
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "That save couldn't be read. Reload the board." }, { status: 400, headers: NO_STORE });
  }
  const r = await getServices().boards.save(actor, { ...(body as object), boardId: id });
  if (!r.ok) return Response.json({ error: r.error.message, code: r.error.code }, { status: STATUS[r.error.code] ?? 400, headers: NO_STORE });
  return Response.json(r.value, { headers: NO_STORE });
}
