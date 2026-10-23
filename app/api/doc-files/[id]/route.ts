// A page's picture (Stage 13.4), for people who can open the page.
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";

export async function GET(_: Request, ctx: RouteContext<"/api/doc-files/[id]">) {
  const actor = await getActor();
  if (!actor) return new Response("Signed out.", { status: 401 });
  const { id } = await ctx.params;
  const r = await getServices().docs.image(actor, id);
  if (!r.ok) return new Response(r.error.message, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return new Response(r.value.bytes as BodyInit, { headers: { "Content-Type": r.value.contentType, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" } });
}
