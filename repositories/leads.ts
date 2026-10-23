// Sales leads (Stage 10a, D88). First, the one-way copy from the old CRM; the sales screens' reads come next (10a.2).
import type { LeadActivityType, LeadScore, LeadStage } from "@/lib/types";

/** A lead as read from the old CRM, already mapped to Oppllo One's fields. */
export type CrmLeadCopy = {
  crmId: string;
  /** meta_<id> / google_<id> for lead-form leads (the CRM uses these as document ids). */
  externalId: string | null;
  sourceKey: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  institution: string | null;
  contactRole: string | null;
  district: string | null;
  segment: string | null;
  problem: string | null;
  timeline: string | null;
  seats: number | null;
  admissions: number | null;
  feePaise: number | null;
  spendPaise: number | null;
  commissionPaise: number | null;
  costPerAdmissionPaise: number | null;
  stage: LeadStage;
  score: LeadScore | null;
  lostReason: string | null;
  origin: string | null;
  channel: string | null;
  landing: string | null;
  campaign: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  /** The CRM user who owns it (their CRM id), and the name the CRM shows. */
  ownerCrmUid: string | null;
  ownerName: string | null;
  nextFollowUpAt: Date | null;
  stageChangedAt: Date | null;
  wonAt: Date | null;
  lastNoteAt: Date | null;
  answers: Record<string, string> | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CrmActivityCopy = {
  crmId: string;
  leadCrmId: string;
  type: LeadActivityType;
  text: string;
  fromStage: string | null;
  toStage: string | null;
  byCrmUid: string | null;
  byName: string | null;
  at: Date;
};

/** A landing page that posts its form to the lead intake. */
export type LeadSourceRecord = { key: string; name: string; url: string | null; channel: string | null; active: boolean; leadCount: number; lastLeadAt: Date | null };

export type CrmUser = { uid: string; name: string | null; email: string | null; role: string | null; active: boolean };

/** Leads after the people matching: owners and authors as Oppllo One people where an email matched. */
export type LeadCopyRow = Omit<CrmLeadCopy, "ownerCrmUid"> & { ownerId: string | null };
export type ActivityCopyRow = Omit<CrmActivityCopy, "byCrmUid"> & { byId: string | null };

/** One lead in a list, the board or Today. */
export type LeadRow = {
  id: string;
  name: string;
  institution: string | null;
  phone: string | null;
  district: string | null;
  segment: string | null;
  stage: LeadStage;
  tags: string[];
  score: LeadScore | null;
  lostReason: string | null;
  channel: string | null;
  origin: string | null;
  landing: string | null;
  campaign: string | null;
  ownerId: string | null;
  /** The person's name, or the CRM's owner name when nobody matched. */
  ownerName: string | null;
  nextFollowUpAt: Date | null;
  stageChangedAt: Date | null;
  clientId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LeadDetailRecord = LeadRow &
  Omit<CrmLeadCopy, "ownerCrmUid" | keyof LeadRow> & { crmId: string | null; clientName: string | null; copiedAt: Date | null };

export type LeadActivityRecord = { id: string; type: LeadActivityType; text: string; fromStage: string | null; toStage: string | null; byName: string | null; at: Date };

export type LeadFilter = {
  stages?: readonly LeadStage[];
  /** A person, "none" (nobody owns it, in the CRM or here) or "nologin" (its CRM owner has no Oppllo login). */
  ownerId?: string | "none" | "nologin";
  /** Owned in the CRM by this name, with no Oppllo login (QA S6-B3). */
  crmOwnerName?: string;
  /** Name, institution, phone or email contains this. */
  search?: string;
  /** Has any of these tags. */
  tags?: readonly string[];
  channel?: string;
  /** Any of these spellings (one district, spelt several ways: QA S6-B3). */
  districts?: readonly string[];
  segment?: string;
  score?: LeadScore;
  /** Next follow-up in [from, before); `none` = no follow-up set. */
  followUp?: { from?: Date; before?: Date } | "none";
  limit: number;
};

/** A lead arriving from a form or webhook, already shaped. */
export type NewLeadRow = Omit<LeadCopyRow, "crmId"> & { id: string };

/** Meta's lead ads, behind an adapter (CLAUDE.md: Meta only through its adapter). */
export type MetaLeadData = {
  createdTime: string | null;
  fields: Array<{ name: string; values: string[] }>;
  adId: string | null;
  adName: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  formId: string | null;
  platform: string | null;
  isOrganic: boolean;
};
export interface MetaLeadAds {
  readonly connected: boolean;
  /** Reads a lead's answers with the Page's token. */
  fetchLead(leadgenId: string, pageId: string | null): Promise<MetaLeadData>;
}

/** Which stages to report to the ad platforms, and how (owner's setting, first copied from the CRM). */
export type AdConversionSettings = {
  stages: Partial<Record<LeadStage, { meta: string | null; google: string | null; valuePaise: number | null }>>;
  metaDatasetId: string | null;
  metaTestEventCode: string | null;
};

/** One conversion waiting for Google Ads' daily import. */
export type GoogleConversionRow = { gclid: string; name: string; at: Date; valuePaise: number | null };

/** Meta's Conversions API, behind its adapter. */
export interface MetaConversions {
  readonly connected: boolean;
  send(datasetId: string, event: Record<string, unknown>, testEventCode: string | null): Promise<{ ok: boolean; message: string }>;
}

export type LeadUpdate = Partial<Pick<LeadDetailRecord, "tags" | "name" | "phone" | "email" | "institution" | "contactRole" | "district" | "segment" | "channel" | "score" | "problem" | "stage" | "lostReason" | "ownerId" | "nextFollowUpAt" | "stageChangedAt" | "wonAt" | "lastNoteAt">>;

export type LeadView = { id: string; name: string; query: string };
/** A ready-made WhatsApp message; {name}, {institution} and {me} are filled in. */
export type MessageTemplate = { id: string; name: string; text: string };

export interface LeadsRepository {
  /** Serialises auto-assign inside a transaction, so two leads arriving together go to two people in turn. */
  lockAutoAssign(): Promise<void>;
  views(personId: string): Promise<LeadView[]>;
  addView(row: LeadView & { personId: string }): Promise<void>;
  /** Soft delete; only the person's own. Returns false if it wasn't theirs. */
  removeView(id: string, personId: string, at: Date): Promise<boolean>;
  /** The lead, locked until the transaction ends (two people changing one lead take turns). */
  lockForUpdate(id: string): Promise<LeadDetailRecord | null>;
  update(id: string, fields: LeadUpdate, at: Date): Promise<void>;
  addActivity(a: { leadId: string; type: LeadActivityType; text: string; fromStage?: string | null; toStage?: string | null; byId: string | null; at: Date }): Promise<void>;
  /** Queue a conversion for Google's import; false if this lead and stage was queued before. */
  queueGoogleConversion(row: GoogleConversionRow & { leadId: string; stage: LeadStage }): Promise<boolean>;
  googleConversionsSince(since: Date): Promise<GoogleConversionRow[]>;
  /** Record what was sent for a stage (kept in details.conversions, as the CRM did) and a timeline entry. */
  markConversion(leadId: string, stage: LeadStage, result: Record<string, unknown>, text: string, at: Date): Promise<void>;
  /** A new lead and its first timeline entry. "duplicate" when the source already sent this lead (same external id). */
  create(row: NewLeadRow, at: Date): Promise<"created" | "duplicate">;
  /** A landing page received a lead. */
  countSourceLead(key: string, at: Date): Promise<void>;
  list(filter: LeadFilter): Promise<LeadRow[]>;
  /** Live leads with any of these phones (compared on the last 10 digits) or emails (any case). */
  findByContacts(phones: readonly string[], emails: readonly string[]): Promise<Array<{ id: string; name: string; institution: string | null; phone: string | null; email: string | null }>>;
  /** Every tag in use, with how many live leads carry it, most used first. */
  allTags(): Promise<Array<{ tag: string; count: number }>>;
  /** Distinct values for the filter menus. */
  facets(): Promise<{ channels: string[]; districts: string[]; segments: string[] }>;
  /** Everyone who owns a lead: Oppllo people by id, and CRM owners without a login by name (QA S6-B3). */
  owners(): Promise<Array<{ id: string | null; name: string }>>;
  find(id: string): Promise<LeadDetailRecord | null>;
  activities(leadId: string): Promise<LeadActivityRecord[]>;
  /** When the last copy from the CRM ran (null before the first). */
  lastCopiedAt(): Promise<Date | null>;
  /** Insert new leads and update known ones (matched by CRM id), in one go. Returns how many were new. */
  /**
   * Insert new leads and update known ones (matched by CRM id). A lead already received here from Meta or Google is
   * adopted by its external id instead of duplicated. `insertOnly` (after switch day) never changes existing leads.
   */
  upsertCopies(rows: readonly LeadCopyRow[], at: Date, opts?: { insertOnly?: boolean }): Promise<{ inserted: number; updated: number }>;
  /** Soft-delete copied leads the CRM no longer has. Returns their ids. */
  removeMissingCopies(keepCrmIds: readonly string[], at: Date): Promise<string[]>;
  /** Add timeline entries not copied before; their leads must exist. Returns how many were new. */
  insertActivityCopies(rows: readonly ActivityCopyRow[]): Promise<number>;
  /** Landing pages copied from the CRM: new keys added, known ones updated. */
  upsertSources(rows: readonly LeadSourceRecord[]): Promise<number>;
  findSource(key: string): Promise<LeadSourceRecord | null>;
  listSources(): Promise<LeadSourceRecord[]>;
  /** `copied`: live leads that came from the CRM (to compare with the CRM's own count). */
  counts(): Promise<{ leads: number; copied: number; byStage: Record<string, number>; activities: number }>;
}
