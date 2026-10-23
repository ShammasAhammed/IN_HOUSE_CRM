// A file shared in the client's chat (Stage 12.6): only for that client's live portal user, through a short link.
import { getServices } from "@/lib/server/container";
import { getPortalUser } from "@/lib/server/session";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, ctx: RouteContext<"/api/portal-chat-files/[id]">) {
  const user = await getPortalUser();
  if (!user || !user.agreed) return Response.redirect(new URL("/portal/sign-in", request.url), 303);
  const { id } = await ctx.params;
  const r = await getServices().clientChat.fileLink(user, id);
  if (!r.ok) return new Response(r.error.message, { status: 404, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: new URL(r.value.url, request.url).toString() } });
}
