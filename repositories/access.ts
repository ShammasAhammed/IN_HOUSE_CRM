// The access register and joining/exit checklists (HR slice 2).
import type { IsoDate } from "@/lib/dates";
import type { ChecklistKind } from "@/lib/types";

export type AccessGrantRecord = {
  id: string;
  personId: string;
  system: string;
  account: string | null;
  clientId: string | null;
  clientName: string | null;
  level: string | null;
  grantedOn: IsoDate;
  revokedOn: IsoDate | null;
  notes: string | null;
};

export type AccessGrantWrite = Omit<AccessGrantRecord, "id" | "clientName" | "revokedOn"> & { grantedById: string };

export type ChecklistItemRecord = {
  id: string;
  personId: string;
  kind: ChecklistKind;
  title: string;
  position: number;
  source: string | null;
  doneAt: Date | null;
  doneByName: string | null;
};

export interface AccessRepository {
  /** A person's grants, open ones first, then by system. */
  listGrants(personId: string): Promise<AccessGrantRecord[]>;
  findGrant(id: string): Promise<AccessGrantRecord | null>;
  createGrant(id: string, grant: AccessGrantWrite): Promise<void>;
  updateGrant(id: string, patch: Partial<Omit<AccessGrantWrite, "personId" | "grantedById">> & { revokedOn?: IsoDate | null; revokedById?: string | null; deletedAt?: Date }): Promise<void>;

  listItems(personId: string): Promise<ChecklistItemRecord[]>;
  findItem(id: string): Promise<ChecklistItemRecord | null>;
  createItems(rows: Array<{ id: string; personId: string; kind: ChecklistKind; title: string; position: number; source: string | null }>): Promise<void>;
  updateItem(id: string, patch: { doneAt?: Date | null; doneById?: string | null; deletedAt?: Date }): Promise<void>;
}
