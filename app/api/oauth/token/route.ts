// OAuth token endpoint (D87): a code with its PKCE verifier, or a refresh token, for new tokens.
import { getServices } from "@/lib/server/container";
import { json, preflight, readBody } from "@/lib/server/oauth-http";

export async function POST(request: Request) {
  const r = await getServices().mcpAuth.token(await readBody(request));
  return r.ok ? json(r.value) : json(r.error, r.error.error === "invalid_client" ? 401 : 400);
}
export const OPTIONS = preflight;
