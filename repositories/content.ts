// A client's content calendar (Stage 7.3, D81).
import type { IsoDate } from "@/lib/dates";
import type { ApprovalState, ContentChannel, ContentStatus } from "@/lib/types";

export type ContentItemRecord = {
  id: string;
  clientId: string;
  title: string;
  channel: ContentChannel;
  publishOn: IsoDate;
  publishTime: string | null;
  status: ContentStatus;
  assetId: string | null;
  assetTitle: string | null;
  assetState: ApprovalState | null;
  ownerId: string | null;
  ownerName: string | null;
  caption: string | null;
  publishedUrl: string | null;
};

export type ContentItemWrite = Omit<ContentItemRecord, "id" | "assetTitle" | "assetState" | "ownerName"> & { createdById: string };

export interface ContentRepository {
  /** A client's items between two days, by day and time. */
  list(filter: { clientId: string; from: IsoDate; to: IsoDate }): Promise<ContentItemRecord[]>;
  /** The next few not yet published, from a day on (the client page). */
  upcoming(clientId: string, from: IsoDate, limit: number): Promise<ContentItemRecord[]>;
  findById(id: string): Promise<ContentItemRecord | null>;
  /** Items using a creative (an approval moves them along). */
  listByAsset(assetId: string): Promise<ContentItemRecord[]>;
  lockForUpdate(id: string): Promise<void>;
  create(id: string, item: ContentItemWrite): Promise<void>;
  update(id: string, patch: Partial<Omit<ContentItemWrite, "clientId" | "createdById">> & { deletedAt?: Date }): Promise<void>;
}
