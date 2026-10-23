import { authorizationServerMetadata, json, preflight } from "@/lib/server/oauth-http";

export const GET = (request: Request) => json(authorizationServerMetadata(new URL(request.url).origin));
export const OPTIONS = preflight;
