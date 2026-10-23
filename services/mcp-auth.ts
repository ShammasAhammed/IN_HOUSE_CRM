// Sign-in for the Oppllo MCP (Stage 9.3, D87): OAuth 2.1 authorization code with PKCE (S256), dynamic client
// registration, rotating refresh tokens. An app gets exactly one person's access, approved by that person on the
// approval screen. Codes and tokens are random; only their SHA-256 hashes are stored.
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { isId, newId } from "@/lib/id";
import { fail, forbidden, notFound, ok, type Result } from "@/lib/result";
import type { DataStore, McpConnectionRecord, OAuthClientRecord } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";

export const ACCESS_SECONDS = 60 * 60;
const REFRESH_DAYS = 30;
const CODE_MINUTES = 10;

const token = () => randomBytes(32).toString("base64url");
export const hashToken = (value: string) => createHash("sha256").update(value).digest("base64url");
const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** https anywhere, or http only back to this computer (desktop apps). Nothing else can receive a code. */
export function allowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Where Claude's and ChatGPT's apps receive codes (ChatGPT connectors: chatgpt.com/connector_platform_oauth_redirect;
 * older GPT actions: chat.openai.com/aip/…/oauth/callback). Anything else gets a clear warning on the approval screen.
 */
export function knownAppHost(uri: string): boolean {
  const host = new URL(uri).hostname;
  return ["claude.ai", "claude.com", "chatgpt.com", "chat.openai.com", "localhost", "127.0.0.1", "[::1]"].includes(host);
}

const registerSchema = z.object({
  client_name: z.string().trim().min(1).max(100).optional(),
  redirect_uris: z.array(z.string().max(500)).min(1).max(3),
});

export type OAuthError = { error: string; error_description: string };
const oauthError = (error: string, error_description: string): { ok: false; error: OAuthError } => ({ ok: false, error: { error, error_description } });

export type AuthorizeRequest = { clientId: string; redirectUri: string; codeChallenge: string; codeChallengeMethod: string; state: string | null; resource: string | null };

export type TokenResponse = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string };

export function createMcpAuthService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;
  const later = (seconds: number) => new Date(clock.now().getTime() + seconds * 1000);

  async function issue(): Promise<{ response: TokenResponse; hashes: { accessHash: string; accessExpiresAt: Date; refreshHash: string; refreshExpiresAt: Date } }> {
    const access = token();
    const refresh = token();
    return {
      response: { access_token: access, token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token: refresh },
      hashes: { accessHash: hashToken(access), accessExpiresAt: later(ACCESS_SECONDS), refreshHash: hashToken(refresh), refreshExpiresAt: later(REFRESH_DAYS * 86_400) },
    };
  }

  return {
    /** Dynamic client registration (RFC 7591). Anyone may register; it grants nothing until a person approves. */
    async register(raw: unknown): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: OAuthError }> {
      const parsed = registerSchema.safeParse(raw);
      if (!parsed.success) return oauthError("invalid_client_metadata", "Send client_name and redirect_uris.");
      const bad = parsed.data.redirect_uris.find((u) => !allowedRedirect(u));
      if (bad) return oauthError("invalid_redirect_uri", `Redirect addresses must be https (or http to localhost): ${bad}`);
      const clientId = `oppllo_${token()}`;
      const name = parsed.data.client_name ?? "An AI app";
      await store.oauth.createClient({ id: newId(), clientId, name, redirectUris: parsed.data.redirect_uris });
      return {
        ok: true,
        value: {
          client_id: clientId,
          client_id_issued_at: Math.floor(clock.now().getTime() / 1000),
          client_name: name,
          redirect_uris: parsed.data.redirect_uris,
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        },
      };
    },

    /**
     * Checks an authorization request before showing the approval screen. A bad client or redirect address is shown
     * as an error page (never redirected to); other problems go back to the app.
     */
    async checkAuthorize(req: AuthorizeRequest): Promise<{ ok: true; client: OAuthClientRecord } | { ok: false; show: string } | { ok: false; redirect: string }> {
      const client = await store.oauth.findClient(req.clientId);
      if (!client) return { ok: false, show: "This app isn't registered with Oppllo One. Remove the connector and add it again." };
      if (!client.redirectUris.includes(req.redirectUri)) return { ok: false, show: "This app asked to send you to an address it didn't register." };
      if (req.codeChallengeMethod !== "S256" || !/^[\w-]{43,128}$/.test(req.codeChallenge)) {
        const url = new URL(req.redirectUri);
        url.searchParams.set("error", "invalid_request");
        url.searchParams.set("error_description", "PKCE with S256 is required.");
        if (req.state) url.searchParams.set("state", req.state);
        return { ok: false, redirect: url.toString() };
      }
      return { ok: true, client };
    },

    /** The person approved: a one-time code goes back to the app. */
    async approve(actor: Actor, req: AuthorizeRequest): Promise<Result<{ redirect: string }>> {
      const check = await this.checkAuthorize(req);
      if (!check.ok) return "show" in check ? fail("invalid", check.show) : ok({ redirect: check.redirect });
      const code = token();
      await store.oauth.createCode({
        id: newId(),
        codeHash: hashToken(code),
        clientId: check.client.id,
        personId: actor.personId,
        redirectUri: req.redirectUri,
        codeChallenge: req.codeChallenge,
        resource: req.resource,
        expiresAt: later(CODE_MINUTES * 60),
      });
      const url = new URL(req.redirectUri);
      url.searchParams.set("code", code);
      if (req.state) url.searchParams.set("state", req.state);
      return ok({ redirect: url.toString() });
    },

    /** The token endpoint: a code (with its PKCE verifier) or a refresh token for new tokens. */
    async token(raw: Record<string, unknown>): Promise<{ ok: true; value: TokenResponse } | { ok: false; error: OAuthError }> {
      // Only text values count: anything else is treated as missing.
      const form = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")) as Record<string, string | undefined>;
      const client = form.client_id ? await store.oauth.findClient(form.client_id) : null;
      if (!client) return oauthError("invalid_client", "Unknown client_id.");

      if (form.grant_type === "authorization_code") {
        if (!form.code || !form.code_verifier || !form.redirect_uri) return oauthError("invalid_request", "code, code_verifier and redirect_uri are required.");
        const code = await store.oauth.takeCode(hashToken(form.code), clock.now());
        if (!code || code.clientId !== client.id || code.redirectUri !== form.redirect_uri || s256(form.code_verifier) !== code.codeChallenge) {
          return oauthError("invalid_grant", "The code is wrong, used or expired.");
        }
        const { response, hashes } = await issue();
        const connectionId = newId();
        await commit(store, async (repos) => {
          await repos.oauth.createConnection({ id: connectionId, clientId: client.id, personId: code.personId, ...hashes });
          return change(null, { actorId: code.personId, action: "mcp.connected", entityType: "mcp_connection", entityId: connectionId, personId: code.personId, data: { app: client.name } });
        });
        return { ok: true, value: response };
      }

      if (form.grant_type === "refresh_token") {
        if (!form.refresh_token) return oauthError("invalid_request", "refresh_token is required.");
        const { response, hashes } = await issue();
        const rotated = await store.oauth.rotate(hashToken(form.refresh_token), hashes, clock.now());
        if (!rotated || rotated.clientId !== client.id) return oauthError("invalid_grant", "The refresh token is wrong, used, expired or revoked.");
        return { ok: true, value: response };
      }

      return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
    },

    /** Who an access token acts for. Null for unknown, expired or revoked tokens. */
    async authenticate(bearer: string): Promise<{ connectionId: string; personId: string; appName: string } | null> {
      const found = await store.oauth.findByAccess(hashToken(bearer), clock.now());
      if (!found) return null;
      await store.oauth.touch(found.id, clock.now());
      return { connectionId: found.id, personId: found.personId, appName: found.clientName };
    },

    /** The person's own connected apps; the owner sees everyone's. */
    async connections(actor: Actor): Promise<Result<{ mine: McpConnectionRecord[]; others: McpConnectionRecord[] }>> {
      const all = await store.oauth.listLive(clock.now(), can(actor, "settings.manage") ? undefined : actor.personId);
      return ok({ mine: all.filter((c) => c.personId === actor.personId), others: all.filter((c) => c.personId !== actor.personId) });
    },

    /** Disconnect an app: its tokens stop working at once. Your own, or anyone's for the owner. */
    async revoke(actor: Actor, connectionId: string): Promise<Result<null>> {
      if (!isId(connectionId)) return notFound("That connection");
      return commit(store, async (repos) => {
        const c = await repos.oauth.findLive(connectionId, clock.now());
        if (!c) return notFound("That connection");
        if (c.personId !== actor.personId && !can(actor, "settings.manage")) return forbidden("You can only disconnect your own apps.");
        await repos.oauth.revoke(c.id, clock.now());
        return change(null, { actorId: actor.personId, action: "mcp.disconnected", entityType: "mcp_connection", entityId: c.id, personId: c.personId, data: { app: c.clientName } });
      });
    },
  };
}
