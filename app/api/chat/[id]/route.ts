// The open conversation's check for new, changed and removed messages (Stage 12.1, D-12.1b): the page asks every
// few seconds while it's visible. GET, never cached; only people who see the channel get anything.
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";
import { wire } from "@/app/(app)/chat/wire";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, ctx: RouteContext<"/api/chat/[id]">) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Signed out." }, { status: 401, headers: NO_STORE });
  const { id } = await ctx.params;
  const since = new URL(request.url).searchParams.get("since") ?? "";
  const r = await getServices().chat.changes(actor, id, since);
  if (!r.ok) return Response.json({ error: r.error.message }, { status: 404, headers: NO_STORE });
  return Response.json({ messages: r.value.messages.map(wire), serverTime: r.value.serverTime }, { headers: NO_STORE });
}
