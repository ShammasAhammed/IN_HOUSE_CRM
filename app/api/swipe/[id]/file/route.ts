// A swipe-file screenshot or video (Stage 13.2), for people who see its client or space.
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";

export async function GET(_: Request, ctx: RouteContext<"/api/swipe/[id]/file">) {
  const actor = await getActor();
  if (!actor) return new Response("Signed out.", { status: 401 });
  const { id } = await ctx.params;
  const r = await getServices().swipe.file(actor, id);
  if (!r.ok) return new Response(r.error.message, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return new Response(r.value.bytes as BodyInit, {
    headers: { "Content-Type": r.value.contentType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" },
  });
}
