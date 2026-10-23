// Creatives (Stage 7.2): assets with versions, each version a pointer to a file (or a link), and a thread per version
// of comments and review steps.
import type { ApprovalState, AssetKind, ReviewAction, StorageProvider } from "@/lib/types";

/** Which assets a query may return. Decided by services/assets.ts. */
export type AssetScope =
  /** Every creative; with `viewerId`, minus those in private spaces that person isn't a member of (Stage 14.1). */
  | { kind: "all"; viewerId?: string }
  /** Assets of clients they're on the team of, plus any on tasks they own or review, or that they made. */
  | { kind: "assigned"; personId: string }
  /** Only assets on tasks they own or review, or that they made (interns). */
  | { kind: "own"; personId: string }
  /** No creatives at all (the BDO, HR, the accountant). */
  | { kind: "none" };

export type AssetSummary = {
  id: string;
  title: string;
  kind: AssetKind;
  approvalState: ApprovalState;
  currentVersion: number;
  clientId: string;
  clientName: string;
  projectName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  updatedAt: Date;
};

export type AssetRecord = AssetSummary & {
  projectId: string | null;
  clientIsInternal: boolean;
  taskOwnerId: string | null;
  taskReviewerId: string | null;
  approvedVersionId: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
};

export type AssetWrite = {
  clientId: string;
  projectId: string | null;
  taskId: string | null;
  title: string;
  kind: AssetKind;
  approvalState: ApprovalState;
  currentVersion: number;
  createdById: string;
};

export type AssetVersionRecord = {
  id: string;
  assetId: string;
  version: number;
  provider: StorageProvider;
  location: string;
  fileId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  note: string | null;
  uploadedByName: string | null;
  createdAt: Date;
};

export type AssetVersionWrite = Omit<AssetVersionRecord, "id" | "uploadedByName" | "createdAt"> & { uploadedById: string };

export type AssetCommentRecord = {
  id: string;
  versionId: string;
  /** Null when a client wrote it in the portal (Stage 11.6). */
  authorId: string | null;
  /** The client contact's portal id when they wrote it; the portal shows clients only these. */
  portalUserId: string | null;
  authorName: string;
  action: ReviewAction | null;
  body: string;
  atSeconds: number | null;
  createdAt: Date;
};

export interface AssetsRepository {
  /** The newest few for a client page. */
  listForClient(clientId: string, limit: number): Promise<AssetSummary[]>;
  list(filter: { scope: AssetScope; clientId?: string; taskId?: string; states?: readonly ApprovalState[]; limit?: number; /** Title contains. */ search?: string }): Promise<AssetSummary[]>;
  /** How many are in each state, for the filter chips. */
  countByState(filter: { scope: AssetScope; clientId?: string }): Promise<Partial<Record<ApprovalState, number>>>;
  findById(id: string, scope: AssetScope): Promise<AssetRecord | null>;
  /** Locks the asset row until the transaction ends (two reviewers at once can't both move it). */
  lockForUpdate(id: string): Promise<void>;
  create(id: string, asset: AssetWrite): Promise<void>;
  update(id: string, patch: Partial<Pick<AssetWrite, "title" | "kind" | "approvalState" | "currentVersion">> & { approvedVersionId?: string | null; approvedById?: string | null; approvedAt?: Date | null; deletedAt?: Date }): Promise<void>;
  listVersions(assetId: string): Promise<AssetVersionRecord[]>;
  addVersion(id: string, version: AssetVersionWrite): Promise<void>;
  listComments(assetId: string): Promise<AssetCommentRecord[]>;
  addComment(row: { id: string; assetId: string; versionId: string; authorId: string | null; portalUserId?: string | null; action: ReviewAction | null; body: string; atSeconds: number | null }): Promise<void>;
}
