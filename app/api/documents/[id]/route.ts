// Opening a document from the locker: checks who you are, writes the view to the audit log, then sends you on to a link
// that works for five minutes. Screens link here with a plain <a> (never prefetched), so only a real click is a view.
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const actor = await getActor();
  if (!actor) return Response.redirect(new URL("/sign-in", request.url), 303);
  const { id } = await ctx.params;
  const r = await getServices().documents.open(actor, { documentId: id });
  if (!r.ok) {
    return new Response(r.error.message, { status: r.error.code === "forbidden" ? 403 : 404, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: new URL(r.value.url, request.url).toString() } });
}
