// The Oppllo MCP endpoint (Stage 9.3, D87). Add https://<this site>/api/mcp as a custom connector in Claude.
import { handleMcp } from "@/lib/server/mcp";
import { preflight, withCors } from "@/lib/server/oauth-http";

export const maxDuration = 60;

const handle = async (request: Request) => withCors(await handleMcp(request));
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = preflight;
