// Landing-page forms post here: /api/lead/<the page's key> (Stage 10a.4). JSON, normal form posts, or text/plain JSON.
import { getServices } from "@/lib/server/container";
import { tooBig } from "@/lib/server/oauth-http";
import { json, preflight, withCors } from "@/lib/server/oauth-http";

export async function POST(request: Request, { params }: RouteContext<"/api/lead/[key]">) {
  const { key } = await params;
  if (tooBig(request)) return Response.json({ ok: false, error: "Too large" }, { status: 413 });
  let input: Record<string, unknown>;
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) input = (await request.json()) as Record<string, unknown>;
    else if (type.includes("form")) input = Object.fromEntries((await request.formData()).entries()) as Record<string, unknown>;
    else input = JSON.parse((await request.text()) || "{}") as Record<string, unknown>;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("not an object");
  } catch {
    return json({ ok: false, error: "Couldn't read the form data" }, 400);
  }
  const r = await getServices().leadIntake.landing(key, input);
  if (r.redirect) return withCors(Response.redirect(r.redirect, 303));
  return json(r.body, r.status);
}
export const OPTIONS = preflight;
