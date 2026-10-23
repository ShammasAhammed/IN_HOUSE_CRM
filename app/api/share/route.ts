// "Share to Oppllo" (Stage 13.2): the Android share menu posts here (the PWA's share_target). Signed-in people only;
// what came is checked and kept in their own inbox, then they pick the client or space and the board on /share.
import type { Route } from "next";
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";

export async function POST(request: Request) {
  const back = (path: string) => new Response(null, { status: 303, headers: { Location: new URL(path, request.url).toString(), "Cache-Control": "private, no-store" } });
  const origin = request.headers.get("origin");
  if (origin && origin !== "null" && new URL(origin).host !== new URL(request.url).host) return new Response("Not allowed.", { status: 403 });
  const actor = await getActor();
  // Not signed in: sign in first; the phone keeps the shared item, so sharing again afterwards works.
  if (!actor) return back(`/sign-in?next=${encodeURIComponent("/share")}` as Route);
  const form = await request.formData().catch(() => null);
  if (!form) return back("/share?error=empty");
  const text = (k: string) => (typeof form.get(k) === "string" ? String(form.get(k)) : "");
  const f = form.get("image");
  const file = f instanceof File && f.size > 0 ? { name: f.name, contentType: f.type, bytes: new Uint8Array(await f.arrayBuffer()) } : null;
  const r = await getServices().swipe.receiveShare(actor, { url: text("url"), title: text("title"), text: text("text") }, file);
  if (!r.ok) return back(`/share?error=${encodeURIComponent(r.error.message)}`);
  return back(`/share?id=${r.value.id}`);
}
