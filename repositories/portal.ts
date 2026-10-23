// The client portal (Stage 11.6): invites and one-time sign-in links. Data the portal shows comes from the other
// repositories, always for the portal user's own client (services/portal.ts).
export type PortalUserRecord = {
  id: string;
  clientId: string;
  clientName: string;
  /** False once the client is removed or is one of Oppllo's own spaces. */
  clientLive: boolean;
  leadStrategistId: string | null;
  contactId: string;
  contactName: string;
  /** The contact's email now (null when removed): it must still match the invite. */
  contactEmail: string | null;
  email: string;
  invitedByName: string;
  createdAt: Date;
  revokedAt: Date | null;
  lastSignInAt: Date | null;
  consentId: string | null;
};

export interface PortalRepository {
  create(row: { id: string; clientId: string; contactId: string; email: string; invitedById: string }): Promise<boolean>;
  find(id: string): Promise<PortalUserRecord | null>;
  /** The live (not revoked) invite for this email, any case. */
  findByEmail(email: string): Promise<PortalUserRecord | null>;
  /** A client's invites, newest first, revoked ones included. */
  listForClient(clientId: string): Promise<PortalUserRecord[]>;
  revoke(id: string, byId: string, at: Date): Promise<boolean>;
  touchSignIn(id: string, at: Date): Promise<void>;
  setConsent(id: string, consentId: string): Promise<void>;
  addToken(row: { tokenHash: string; portalUserId: string; expiresAt: Date }): Promise<void>;
  /** Use a link once: the portal user it was for, or null when unknown, used or expired. */
  useToken(tokenHash: string, at: Date): Promise<string | null>;
}
