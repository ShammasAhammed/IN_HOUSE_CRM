// Access requests for spaces (Stage 14.2): asked, approved or refused, confirmed by the member.
import type { IsoDate } from "@/lib/dates";
import type { AccessLevel, AccessRequestStatus, TwoStepAnswer } from "@/lib/types";

export type AccessRequestRecord = {
  id: string;
  spaceId: string;
  spaceName: string;
  isPrivate: boolean;
  isSensitive: boolean;
  personId: string;
  personName: string;
  level: AccessLevel;
  reason: string;
  expiresOn: IsoDate | null;
  twoStep: TwoStepAnswer | null;
  status: AccessRequestStatus;
  requestedById: string;
  requestedByName: string;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  ownerAlone: boolean;
  confirmedAt: Date | null;
  createdAt: Date;
};

export interface SpaceAccessRepository {
  create(row: { id: string; spaceId: string; personId: string; level: AccessLevel; reason: string; expiresOn: IsoDate | null; twoStep: TwoStepAnswer | null; requestedById: string }): Promise<boolean>;
  find(id: string): Promise<AccessRequestRecord | null>;
  /** Newest first. */
  list(filter: { statuses?: readonly AccessRequestStatus[]; personId?: string; spaceId?: string }): Promise<AccessRequestRecord[]>;
  /** Move a request on from `from`; false when it had already moved (someone else acted first). */
  update(id: string, from: AccessRequestStatus, patch: { status: AccessRequestStatus; decidedById?: string; decidedAt?: Date; decisionNote?: string | null; ownerAlone?: boolean; confirmedAt?: Date }, at: Date): Promise<boolean>;
}
