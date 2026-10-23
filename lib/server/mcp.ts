// The Oppllo MCP over HTTP (Stage 9.3, D87): Streamable HTTP, stateless, one small server per request. The bearer token
// says who is calling; their Actor builds the tools, so every call runs with that person's permissions.
import "server-only";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { MCP_INSTRUCTIONS } from "@/services/mcp";
import { getServices } from "./container";
import { reportError } from "./report-error";

const WRITES = new Set(["create_task", "set_task_status", "comment_on_task", "log_time"]);

export const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource/api/mcp`;

function unauthorized(origin: string, description: string): Response {
  return Response.json(
    { error: "invalid_token", error_description: description },
    { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl(origin)}"` } },
  );
}

export async function handleMcp(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return unauthorized(origin, "Sign in to Oppllo One.");
  const services = getServices();
  const who = await services.mcpAuth.authenticate(bearer);
  if (!who) return unauthorized(origin, "The token is wrong, expired or disconnected.");
  const actor = await services.identity.actorFor(who.personId);
  if (!actor) return unauthorized(origin, "This person can no longer use Oppllo One.");

  const tools = services.mcp.tools(actor);
  const server = new Server({ name: "oppllo-one", title: "Oppllo One", version: "1.0.0" }, { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as { type: "object" },
      annotations: { readOnlyHint: !WRITES.has(t.name), destructiveHint: false, openWorldHint: false },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const t = tools.find((x) => x.name === req.params.name);
    if (!t) return { content: [{ type: "text", text: `There is no tool called ${req.params.name}.` }], isError: true };
    let out: { ok: boolean; text: string };
    try {
      out = await t.run(req.params.arguments ?? {});
    } catch (err) {
      reportError(err, { mcpTool: t.name, personId: actor.personId });
      out = { ok: false, text: "Something went wrong in Oppllo One. Try again." };
    }
    // The change is already made: a failed audit write must not make the app retry it.
    await services.mcp.audit(actor, who.connectionId, t.name, out.ok).catch((err) => reportError(err, { mcpAudit: t.name }));
    return { content: [{ type: "text", text: out.text }], isError: !out.ok };
  });

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}
