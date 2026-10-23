// Google Ads lead form webhook (Stage 10a.4). In Google Ads: Lead form asset → Lead delivery → Webhook URL + Key.
import { getServices } from "@/lib/server/container";
import { tooBig } from "@/lib/server/oauth-http";

export async function POST(request: Request) {
  if (tooBig(request)) return Response.json({ ok: false, error: "Too large" }, { status: 413 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const r = await getServices().leadIntake.googleLead(body as Record<string, unknown>);
  return Response.json(r.body, { status: r.status });
}
