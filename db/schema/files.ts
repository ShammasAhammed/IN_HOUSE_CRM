// Files kept in PostgreSQL by the "postgres" storage adapter (D78), and the document locker's pointers to them.
// Only adapters/postgres/storage.ts reads or writes stored_files; everything else holds a pointer (provider, location,
// file id), so moving to Drive or R2 changes the adapter, not these records.
import { sql } from "drizzle-orm";
import { bigint, check, customType, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { DOCUMENT_KINDS, STORAGE_PROVIDERS, type DocumentKind, type StorageProvider } from "@/lib/types";
import { createdAt, id, oneOf, timestamps } from "./columns";
import { people } from "./people";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const storedFiles = pgTable(
  "stored_files",
  {
    id: id(),
    /** A folder-like path, e.g. "people/<person id>". */
    folder: text("folder").notNull(),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    data: bytea("data").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("stored_files_folder_idx").on(t.folder).where(sql`${t.deletedAt} is null`)],
);

/** A document in a person's locker: a pointer to the file, never the file (Projects module, rule 3). */
export const personDocuments = pgTable(
  "person_documents",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    kind: text("kind").$type<DocumentKind>().notNull(),
    title: text("title").notNull(),
    provider: text("provider").$type<StorageProvider>().notNull(),
    location: text("location").notNull(),
    fileId: text("file_id").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** For documents that lapse (passport, an agreement with an end). */
    expiresOn: date("expires_on"),
    /** The last four digits of an ID number, and never more (QA S5-B3; full Aadhaar or bank numbers are never kept). */
    idLast4: text("id_last4"),
    uploadedById: uuid("uploaded_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [
    index("person_documents_person_idx").on(t.personId).where(sql`${t.deletedAt} is null`),
    check("person_documents_kind_ck", oneOf(t.kind, DOCUMENT_KINDS)),
    check("person_documents_provider_ck", oneOf(t.provider, STORAGE_PROVIDERS)),
    check("person_documents_id_last4_ck", sql`${t.idLast4} is null or ${t.idLast4} ~ '^[0-9]{4}$'`),
  ],
);
