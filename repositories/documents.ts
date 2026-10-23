// The document locker (HR slice 2): each record is a pointer to a file in storage, never the file itself.
import type { IsoDate } from "@/lib/dates";
import type { DocumentKind } from "@/lib/types";
import type { FilePointer } from "./storage";

export type PersonDocumentRecord = FilePointer & {
  id: string;
  personId: string;
  kind: DocumentKind;
  title: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  expiresOn: IsoDate | null;
  /** Last four digits of an ID number, never more. */
  idLast4: string | null;
  uploadedByName: string | null;
  createdAt: Date;
};

export type PersonDocumentWrite = Omit<PersonDocumentRecord, "id" | "uploadedByName" | "createdAt"> & { uploadedById: string };

export interface DocumentsRepository {
  /** A person's documents, newest first. */
  list(personId: string): Promise<PersonDocumentRecord[]>;
  find(id: string): Promise<PersonDocumentRecord | null>;
  /** The same, with its row locked until the transaction ends (two removes at once can't both win). */
  lockForUpdate(id: string): Promise<PersonDocumentRecord | null>;
  create(id: string, doc: PersonDocumentWrite): Promise<void>;
  update(id: string, patch: { title?: string; kind?: DocumentKind; expiresOn?: IsoDate | null; deletedAt?: Date }): Promise<void>;
}
