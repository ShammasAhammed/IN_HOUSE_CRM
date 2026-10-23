// The document locker (plan/4-hr-module.md, "Documents"; D78). HR and the owner keep each person's documents
// (hr.documents); a person sees their own. Files stay in storage behind links that work for five minutes, and every
// view is written to the audit log ("Every view of a sensitive record written to the audit log").
// ID proofs are masked copies only: the full Aadhaar number never enters the system (NEVER list).

import { formatFileSize } from "@/lib/format";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { DOCUMENT_KIND_LABELS, type StorageProvider } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import { documentSchema, updateDocumentSchema, uploadDocumentSchema } from "@/lib/validation/documents";
import type { DataStore, FileStorage, NewEvent, PersonDocumentRecord, StoredFile } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { documentExpiry, MAX_DOCUMENT_BYTES, safeFileName, sniffDocumentType, type Expiry } from "./rules/documents";

export type DocumentView = Omit<PersonDocumentRecord, "provider" | "location" | "fileId"> & { expiry: Expiry };
export type PersonDocuments = { documents: DocumentView[]; canManage: boolean };

/** How long a link to a document works. */
export const LINK_SECONDS = 5 * 60;
const DENIED = "Only HR and the owner keep people's documents. You can see your own.";

export function createDocumentService(deps: { store: DataStore; storage: FileStorage; clock: Clock; report?: (error: unknown, context: Record<string, unknown>) => void }) {
  const { store, storage, clock } = deps;
  const report = deps.report ?? (() => {});

  const event = (actor: Actor, doc: { id: string; personId: string }, action: string, data: Record<string, unknown>): NewEvent => ({
    actorId: actor.personId,
    action,
    entityType: "person_document",
    entityId: doc.id,
    personId: doc.personId,
    data,
  });

  const mayView = (actor: Actor, personId: string) => personId === actor.personId || can(actor, "hr.documents");

  return {
    /** A person's documents: your own, or anyone's for HR and the owner. */
    async forPerson(actor: Actor, personId: string): Promise<Result<PersonDocuments>> {
      if (!mayView(actor, personId)) return forbidden(DENIED);
      if (!isId(personId)) return notFound("That person");
      const today = clock.today();
      const [person, rows] = await Promise.all([store.people.findById(personId), store.documents.list(personId)]);
      if (!person) return notFound("That person");
      return ok({
        documents: rows.map(({ provider: _p, location: _l, fileId: _f, ...d }) => ({ ...d, expiry: documentExpiry(d.expiresOn, today) })),
        canManage: can(actor, "hr.documents"),
      });
    },

    /** Store a file in someone's locker. The file's real type is read from its bytes, never taken from the browser. */
    async upload(actor: Actor, raw: unknown, file: { name: string; bytes: Uint8Array } | null): Promise<Result<{ id: string }>> {
      if (!can(actor, "hr.documents")) return forbidden(DENIED);
      const parsed = parse(uploadDocumentSchema, raw);
      if (!parsed.ok) return parsed;
      const input = parsed.value;
      if (!file || file.bytes.byteLength === 0) return invalid("Choose a file.", { file: ["Choose a file."] });
      if (file.bytes.byteLength > MAX_DOCUMENT_BYTES) {
        const size = formatFileSize(file.bytes.byteLength);
        return invalid(`That file is ${size}; the limit is ${formatFileSize(MAX_DOCUMENT_BYTES)}.`, { file: [`${size} is too big. Use a PDF scan or a smaller photo (up to ${formatFileSize(MAX_DOCUMENT_BYTES)}).`] });
      }
      const type = sniffDocumentType(file.bytes);
      if (!type) return invalid("That file type isn't accepted.", { file: ["Use a PDF, a JPEG, PNG or WebP photo, or a Word (.docx) file."] });
      if (!(await store.people.findById(input.personId))) return notFound("That person");

      const fileName = safeFileName(file.name, type);
      const title = input.title ?? (input.kind === "other" ? fileName.replace(/\.[a-z]+$/, "") : DOCUMENT_KIND_LABELS[input.kind]);
      let stored: StoredFile | null = null;
      try {
        stored = await storage.upload({ folder: `people/${input.personId}`, name: fileName, contentType: type.contentType, bytes: file.bytes });
        const { provider, location, fileId, sizeBytes } = stored;
        const result = await commit(store, async (repos) => {
          const id = newId();
          await repos.documents.create(id, {
            personId: input.personId,
            kind: input.kind,
            title,
            provider,
            location,
            fileId,
            fileName,
            contentType: type.contentType,
            sizeBytes,
            expiresOn: input.expiresOn,
            idLast4: input.idLast4,
            uploadedById: actor.personId,
          });
          return change({ id }, event(actor, { id, personId: input.personId }, "document.uploaded", { kind: input.kind, title, fileName, sizeBytes }));
        });
        if (!result.ok) await storage.delete(stored);
        return result;
      } catch (err) {
        // The record didn't save: don't leave the file behind in use.
        if (stored) await storage.delete(stored).catch((e) => report(e, { where: "documents.upload.cleanup", fileId: stored?.fileId }));
        throw err;
      }
    },

    /** A link that opens the document for five minutes. Every call is a view and goes in the audit log. */
    async open(actor: Actor, raw: unknown): Promise<Result<{ url: string }>> {
      const parsed = parse(documentSchema, raw);
      if (!parsed.ok) return notFound("That document");
      const doc = await store.documents.find(parsed.value.documentId);
      if (!doc) return notFound("That document");
      if (!mayView(actor, doc.personId)) return forbidden(DENIED);
      const logged = await commit(store, async () => change(null, event(actor, doc, "document.viewed", { title: doc.title })));
      if (!logged.ok) return logged;
      return ok({ url: await storage.getLink(doc, { expiresInSeconds: LINK_SECONDS, downloadName: doc.fileName, viewerId: actor.personId }) });
    },

    async update(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "hr.documents")) return forbidden(DENIED);
      const parsed = parse(updateDocumentSchema, raw);
      if (!parsed.ok) return parsed;
      const input = parsed.value;
      return commit(store, async (repos) => {
        const doc = await repos.documents.find(input.documentId);
        if (!doc) return notFound("That document");
        const changes: Record<string, [unknown, unknown]> = {};
        if (doc.title !== input.title) changes.title = [doc.title, input.title];
        if (doc.expiresOn !== input.expiresOn) changes.expiresOn = [doc.expiresOn, input.expiresOn];
        if (Object.keys(changes).length === 0) return noChange({ id: doc.id });
        await repos.documents.update(doc.id, { title: input.title, expiresOn: input.expiresOn });
        return change({ id: doc.id }, event(actor, doc, "document.updated", { changes }));
      });
    },

    /** Takes a document out of the locker. The record and the file are kept, marked deleted. */
    async remove(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "hr.documents")) return forbidden(DENIED);
      const parsed = parse(documentSchema, raw);
      if (!parsed.ok) return notFound("That document");
      const result = await commit(store, async (repos) => {
        const doc = await repos.documents.lockForUpdate(parsed.value.documentId);
        if (!doc) return notFound("That document");
        await repos.documents.update(doc.id, { deletedAt: clock.now() });
        return change(doc, event(actor, doc, "document.removed", { kind: doc.kind, title: doc.title }));
      });
      if (!result.ok) return result;
      // Links to it stop working (the database adapter only marks the file deleted). The removal itself has
      // happened, so a storage hiccup here is reported, not shown as a failure.
      await storage.delete(result.value).catch((err) => report(err, { where: "documents.remove", documentId: result.value.id }));
      return ok({ id: result.value.id });
    },
  };
}

export type LinkVerifier = (fileId: string, params: URLSearchParams, viewerId: string) => { ok: true; name: string; provider: StorageProvider } | { ok: false };

/**
 * The app's own download route. The signed link is the permission: made for this viewer by `open` (which checked
 * who may see the document and logged the view), and only for a few minutes.
 */
export function createFileService(deps: { storage: FileStorage; verifyLink: LinkVerifier }) {
  return {
    /** `viewerId`: the person's id, or "portal:<id>" for a client in the portal (Stage 11.6): links are made per viewer. */
    async read(viewerId: string, fileId: string, params: URLSearchParams): Promise<Result<{ bytes: Uint8Array; contentType: string; name: string }>> {
      const link = deps.verifyLink(fileId, params, viewerId);
      if (!link.ok) return forbidden("This link has expired or was opened by someone else. Open the document again from Oppllo One.");
      const file = await deps.storage.read({ provider: link.provider, fileId });
      return file ? ok({ ...file, name: link.name }) : notFound("That file");
    },
  };
}
