// Sign-in for the Oppllo MCP (Stage 9.3, D87): registered apps, one-time codes and each person's connections.
// Codes and tokens arrive here already hashed; the plain values never reach the database.
export type OAuthClientRecord = { id: string; clientId: string; name: string; redirectUris: string[]; createdAt: Date };

export type OAuthCodeRecord = { clientId: string; personId: string; redirectUri: string; codeChallenge: string; resource: string | null };

export type McpConnectionRecord = {
  id: string;
  clientName: string;
  personId: string;
  personName: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  refreshExpiresAt: Date;
};

export type TokenHashes = { accessHash: string; accessExpiresAt: Date; refreshHash: string; refreshExpiresAt: Date };

export interface OAuthRepository {
  createClient(c: { id: string; clientId: string; name: string; redirectUris: string[] }): Promise<void>;
  findClient(clientId: string): Promise<OAuthClientRecord | null>;
  createCode(c: OAuthCodeRecord & { id: string; codeHash: string; expiresAt: Date }): Promise<void>;
  /** Takes the code if it is unused and unexpired, marking it used in the same step (a code works once). */
  takeCode(codeHash: string, at: Date): Promise<OAuthCodeRecord | null>;
  createConnection(c: TokenHashes & { id: string; clientId: string; personId: string }): Promise<void>;
  /** The live connection for an access token: not revoked, not expired. */
  findByAccess(accessHash: string, at: Date): Promise<{ id: string; personId: string; clientName: string } | null>;
  /** Swaps a live refresh token for new tokens, in one step; null when the old one is unknown, used, expired or revoked. */
  rotate(refreshHash: string, next: TokenHashes, at: Date): Promise<{ id: string; personId: string; clientId: string } | null>;
  touch(connectionId: string, at: Date): Promise<void>;
  /** Live connections (not revoked, refresh not expired), newest first; one person's or everyone's. */
  listLive(at: Date, personId?: string): Promise<McpConnectionRecord[]>;
  findLive(connectionId: string, at: Date): Promise<McpConnectionRecord | null>;
  revoke(connectionId: string, at: Date): Promise<void>;
}
