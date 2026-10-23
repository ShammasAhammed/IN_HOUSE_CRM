// Opening a file on a task (Stage 9b.2): checks the person can see the task, then sends them on to the link (a file's
// link works for five minutes, for them only). Screens link here with a plain <a>, never prefetched.
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, ctx: RouteContext<"/api/task-files/[id]">) {
  const actor = await getActor();
  if (!actor) return Response.redirect(new URL("/sign-in", request.url), 303);
  const { id } = await ctx.params;
  const r = await getServices().taskCollab.fileLink(actor, id);
  if (!r.ok) return new Response(r.error.message, { status: r.error.code === "forbidden" ? 403 : 404, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: new URL(r.value.url, request.url).toString() } });
}
