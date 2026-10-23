import { json, preflight, protectedResourceMetadata } from "@/lib/server/oauth-http";

export const GET = (request: Request) => json(protectedResourceMetadata(new URL(request.url).origin));
export const OPTIONS = preflight;
