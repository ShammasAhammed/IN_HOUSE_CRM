// Meta (Facebook/Instagram) lead ads webhook (Stage 10a.4). Set up in the Meta app: Webhooks → Page → leadgen.
import { getServices } from "@/lib/server/container";
import { tooBig } from "@/lib/server/oauth-http";

export async function GET(request: Request) {
  const challenge = getServices().leadIntake.metaVerify(new URL(request.url).searchParams);
  return challenge === null ? new Response("Forbidden", { status: 403 }) : new Response(challenge, { status: 200 });
}

export async function POST(request: Request) {
  if (tooBig(request)) return Response.json({ ok: false, error: "Too large" }, { status: 413 });
  const r = await getServices().leadIntake.metaWebhook(await request.text(), request.headers.get("x-hub-signature-256"));
  return Response.json(r.body, { status: r.status });
}
