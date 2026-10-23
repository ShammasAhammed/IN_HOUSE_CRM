// Client knowledge base (Stage 11.2): tone of voice, do's and don'ts, past campaigns, brand kit files and SOP links.
import type { KnowledgeFileKind, StorageProvider } from "@/lib/types";

export type KnowledgeRecord = { clientId: string; tone: string; dos: string; donts: string; brandColours: string[]; version: number; updatedByName: string | null; updatedAt: Date };

export type CampaignRecord = {
  id: string;
  clientId: string;
  name: string;
  period: string | null;
  whatWorked: string;
  whatToAvoid: string | null;
  createdByName: string | null;
  createdAt: Date;
};

export type ClientFileRecord = {
  id: string;
  clientId: string;
  kind: KnowledgeFileKind;
  title: string;
  provider: StorageProvider;
  location: string;
  fileId: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  addedByName: string | null;
  createdAt: Date;
};

export interface KnowledgeRepository {
  /** Everything kept for these clients ("all" = every client); live campaigns and files, newest first. */
  list(clientIds: readonly string[] | "all"): Promise<{ knowledge: KnowledgeRecord[]; campaigns: CampaignRecord[]; files: ClientFileRecord[] }>;
  /** Save when the stored version is `expectedVersion` (0 = none saved yet). False when someone saved first. */
  saveKnowledge(row: { clientId: string; tone: string; dos: string; donts: string; brandColours: string[]; updatedById: string }, expectedVersion: number, at: Date): Promise<boolean>;
  findCampaign(id: string): Promise<CampaignRecord | null>;
  addCampaign(row: { id: string; clientId: string; name: string; period: string | null; whatWorked: string; whatToAvoid: string | null; createdById: string }): Promise<void>;
  removeCampaign(id: string, at: Date): Promise<boolean>;
  findFile(id: string): Promise<ClientFileRecord | null>;
  addFile(row: Omit<ClientFileRecord, "addedByName" | "createdAt"> & { addedById: string }): Promise<void>;
  removeFile(id: string, at: Date): Promise<boolean>;
}
