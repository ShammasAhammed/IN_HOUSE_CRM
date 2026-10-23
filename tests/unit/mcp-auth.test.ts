// The MCP approval screen (Stage 9.3): which apps' callback hosts it knows, so it can warn about any other.
import { describe, expect, it } from "vitest";
import { knownAppHost } from "@/services/mcp-auth";

describe("knownAppHost", () => {
  it("knows Claude's and ChatGPT's callbacks, and local ones", () => {
    for (const uri of ["https://claude.ai/api/mcp/auth_callback", "https://chatgpt.com/connector_platform_oauth_redirect", "https://chat.openai.com/aip/g-123/oauth/callback", "http://localhost:6274/callback"]) expect(knownAppHost(uri)).toBe(true);
  });
  it("warns about look-alikes and anything else", () => {
    for (const uri of ["https://chatgpt.com.evil.example/cb", "https://evilchatgpt.com/cb", "https://example.com/callback"]) expect(knownAppHost(uri)).toBe(false);
  });
});
