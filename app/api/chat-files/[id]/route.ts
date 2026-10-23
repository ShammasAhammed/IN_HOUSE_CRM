// Opening a file shared in chat (Stage 12.1): checks the person sees the chat, then sends them on to a short-lived
// link made for them. Screens link here with a plain <a>, never prefetched.
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, ctx: RouteContext<"/api/chat-files/[id]">) {
  const actor = await getActor();
  if (!actor) return Response.redirect(new URL("/sign-in", request.url), 303);
  const { id } = await ctx.params;
  const r = await getServices().chat.fileLink(actor, id);
  if (!r.ok) return new Response(r.error.message, { status: 404, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: new URL(r.value.url, request.url).toString() } });
}
