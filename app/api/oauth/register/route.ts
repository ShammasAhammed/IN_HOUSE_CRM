// OAuth dynamic client registration for AI apps (D87). Registering grants nothing: a person still has to approve.
import { getServices } from "@/lib/server/container";
import { json, preflight } from "@/lib/server/oauth-http";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const r = await getServices().mcpAuth.register(body);
  return r.ok ? json(r.value, 201) : json(r.error, 400);
}
export const OPTIONS = preflight;
