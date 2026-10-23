// The chat shared with a client (Stage 12.6): made the first time someone opens it, then straight to it.
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";

export async function GET(request: Request, ctx: RouteContext<"/chat/shared/[clientId]">) {
  const actor = await getActor();
  if (!actor) return Response.redirect(new URL("/sign-in", request.url), 303);
  const { clientId } = await ctx.params;
  const r = await getServices().chat.openShared(actor, clientId);
  if (!r.ok) return new Response(r.error.message, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  return Response.redirect(new URL(`/chat/${r.value.id}`, request.url), 303);
}
