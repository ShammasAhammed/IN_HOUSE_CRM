// An image on an Idea Board (Stage 13.1), for people who can see the board. Loaded after the board has opened.
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";

export async function GET(_: Request, ctx: RouteContext<"/api/boards/[id]/images/[key]">) {
  const actor = await getActor();
  if (!actor) return new Response("Signed out.", { status: 401 });
  const { id, key } = await ctx.params;
  const r = await getServices().boards.image(actor, id, key);
  if (!r.ok) return new Response(r.error.message, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return new Response(r.value.bytes as BodyInit, {
    headers: {
      "Content-Type": r.value.contentType,
      // An image's key is its content hash: it never changes.
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
