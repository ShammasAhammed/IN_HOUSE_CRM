// The prospect CRM (Stage 8.3, D84): read-only from Firestore, plus our "won, set up?" list.
import type { AdConversionSettings, CrmActivityCopy, CrmLeadCopy, CrmUser, LeadSourceRecord } from "./leads";

export type CrmLead = { id: string; name: string; institution: string | null; phone: string | null; segment: string | null; ownerName: string | null; stage: string; wonAt: Date | null };

/** Read-only view of the CRM. Adapters: Firestore (REST), or "not connected". */
export interface CrmSource {
  readonly connected: boolean;
  /** Won leads, newest first. */
  listWon(limit: number): Promise<CrmLead[]>;
  /** How many leads sit in each stage now. */
  stageCounts(): Promise<Record<string, number>>;
  /** For moving the CRM into Oppllo One (Stage 10a): every lead, every timeline entry, and the CRM's users. */
  allLeads(): Promise<CrmLeadCopy[]>;
  allActivities(): Promise<CrmActivityCopy[]>;
  users(): Promise<CrmUser[]>;
  /** The CRM's landing pages (Settings → Landing pages), so their keys keep working here. */
  sources(): Promise<LeadSourceRecord[]>;
  /** The CRM's "Send results to ads" settings (no secrets), or null if never set. */
  conversionSettings(): Promise<AdConversionSettings | null>;
}

export type WonLeadRecord = CrmLead & { rowId: string; dismissedAt: Date | null; clientId: string | null; clientName: string | null };

export interface CrmInboxRepository {
  upsert(leads: readonly CrmLead[]): Promise<number>;
  list(opts: { includeDone: boolean }): Promise<WonLeadRecord[]>;
  find(rowId: string): Promise<WonLeadRecord | null>;
  dismiss(rowId: string, by: string, at: Date): Promise<void>;
}
