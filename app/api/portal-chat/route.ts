// The client's chat checking for new, changed and removed messages (Stage 12.6), every few seconds while the page is
// visible. The portal session is checked on every call, so a revoked client stops seeing anything at once.
import { getServices } from "@/lib/server/container";
import { getPortalUser } from "@/lib/server/session";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user || !user.agreed) return Response.json({ error: "Signed out." }, { status: 401, headers: NO_STORE });
  const r = await getServices().clientChat.changes(user, new URL(request.url).searchParams.get("since") ?? "");
  if (!r.ok) return Response.json({ error: r.error.message }, { status: 400, headers: NO_STORE });
  return Response.json(r.value, { headers: NO_STORE });
}
