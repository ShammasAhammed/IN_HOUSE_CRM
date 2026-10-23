// An image added to an Idea Board (Stage 13.1): the browser resizes it first; stored through the storage interface.
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, ctx: RouteContext<"/api/boards/[id]/images">) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return Response.json({ error: "Not allowed." }, { status: 403, headers: NO_STORE });
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Signed out." }, { status: 401, headers: NO_STORE });
  const { id } = await ctx.params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const key = String(form?.get("key") ?? "");
  if (!(file instanceof File)) return Response.json({ error: "No image came through." }, { status: 400, headers: NO_STORE });
  const r = await getServices().boards.addImage(actor, id, { key, contentType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: r.error.code === "forbidden" ? 403 : 400, headers: NO_STORE });
  return Response.json({ ok: true }, { headers: NO_STORE });
}
