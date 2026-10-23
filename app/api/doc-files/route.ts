// A picture added to a page in the block editor (Stage 13.4): stored through the storage interface.
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return Response.json({ error: "Not allowed." }, { status: 403, headers: NO_STORE });
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Signed out." }, { status: 401, headers: NO_STORE });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No picture came through." }, { status: 400, headers: NO_STORE });
  const r = await getServices().docs.addImage(actor, String(form?.get("docId") ?? ""), { name: file.name, contentType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
  if (!r.ok) return Response.json({ error: r.error.message }, { status: 400, headers: NO_STORE });
  return Response.json(r.value, { headers: NO_STORE });
}
