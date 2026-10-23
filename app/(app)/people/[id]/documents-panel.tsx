"use client";

// The document locker for one person (HR slice 2, D78). HR and the owner upload and tidy; the person sees their own.
// "View" goes through /api/documents/<id>, which logs the view and hands out a link that works for five minutes.
import { Checkbox } from "@/components/ui/choice";
import { useActionState, useState } from "react";
import { ExternalLink, FileImage, FileText, FolderLock, Pencil, Plus } from "lucide-react";
import { ConfirmForm } from "@/components/confirm-form";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { istDate } from "@/lib/dates";
import { formatFileSize, formatShortDate } from "@/lib/format";
import { DOCUMENT_KIND_LABELS, DOCUMENT_KINDS, type DocumentKind } from "@/lib/types";
import type { DocumentView, PersonDocuments } from "@/services/documents";
import { ACCEPTED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "@/services/rules/documents";
import { removeDocumentAction, updateDocumentAction, uploadDocumentAction } from "../actions";

const ACCEPT = ACCEPTED_DOCUMENT_TYPES.flatMap((t) => [t.contentType, `.${t.extension}`]).join(",");

export function DocumentsPanel({ personId, data, today, self }: { personId: string; data: PersonDocuments; today: string; self: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <section id="documents" className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FolderLock className="size-4 text-muted-foreground" /> Documents
          </h2>
          <p className="text-xs text-muted-foreground">
            {self ? "Your offer letter, agreement, ID proof and certificates. Only you, HR and the owner can open them." : "Only they, HR and the owner can open these. Every view is logged."}
          </p>
        </div>
        {data.canManage && !adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Upload
          </Button>
        ) : null}
      </div>
      {adding ? <UploadForm personId={personId} today={today} onDone={() => setAdding(false)} /> : null}
      {data.documents.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">{data.canManage ? (self ? "Nothing here yet. Upload your offer letter and agreement first." : "Nothing here yet. Upload their offer letter and agreement first.") : "Nothing here yet. HR adds your documents."}</p>
      ) : null}
      <ul className="divide-y">
        {data.documents.map((d) => (
          <DocumentRow key={d.id} doc={d} canManage={data.canManage} />
        ))}
      </ul>
    </section>
  );
}

function ExpiryBadge({ doc }: { doc: DocumentView }) {
  if (!doc.expiresOn) return null;
  if (doc.expiry === "expired") return <Badge tone="danger">Expired {formatShortDate(doc.expiresOn)}</Badge>;
  if (doc.expiry === "soon") return <Badge tone="warning">Expires {formatShortDate(doc.expiresOn)}</Badge>;
  return null;
}

function DocumentRow({ doc: d, canManage }: { doc: DocumentView; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const Icon = d.contentType.startsWith("image/") ? FileImage : FileText;
  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* A plain link, never prefetched: opening it is a view and goes in the audit log. */}
            <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="font-medium hover:underline">
              {d.title}
            </a>
            <ExpiryBadge doc={d} />
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[
              d.title === DOCUMENT_KIND_LABELS[d.kind] ? null : DOCUMENT_KIND_LABELS[d.kind],
              d.idLast4 ? `ID ending ${d.idLast4}` : null,
              formatFileSize(d.sizeBytes),
              `added ${formatShortDate(istDate(d.createdAt))}${d.uploadedByName ? ` by ${d.uploadedByName}` : ""}`,
              d.expiresOn && !d.expiry ? `valid till ${formatShortDate(d.expiresOn)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="flex items-center gap-1">
          <Button asChild size="sm" variant="ghost">
            <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" aria-label={`Open ${d.title}`}>
              <ExternalLink /> Open
            </a>
          </Button>
          {canManage ? (
            <Button size="icon" variant="ghost" aria-label={`Edit ${d.title}`} aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
              <Pencil />
            </Button>
          ) : null}
        </span>
      </div>
      {editing ? <EditForm doc={d} onDone={() => setEditing(false)} /> : null}
    </li>
  );
}

/** Wraps an action so the form closes once it succeeds. */
function useClosingAction(action: (prev: ActionState, form: FormData) => Promise<ActionState>, onDone: () => void) {
  return useActionState(async (prev: ActionState, form: FormData) => {
    const next = await action(prev, form);
    if (next.status === "ok") onDone();
    return next;
  }, idle);
}

function EditForm({ doc, onDone }: { doc: DocumentView; onDone: () => void }) {
  const [state, action] = useClosingAction(updateDocumentAction, onDone);
  const f = (name: string, initial: string) => ({ id: `doc-${doc.id}-${name}`, name, defaultValue: fieldDefault(state, name, initial), ...invalidProps(state, name, `doc-${doc.id}-${name}`) });
  return (
    <div className="mt-2 space-y-3 rounded-md bg-subtle p-3">
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_160px]" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
        <input type="hidden" name="documentId" value={doc.id} />
        <Field label="Name" name="title" htmlFor={`doc-${doc.id}-title`} state={state}>
          <Input {...f("title", doc.title)} required maxLength={120} className="h-8" />
        </Field>
        <Field label="Valid till" name="expiresOn" htmlFor={`doc-${doc.id}-expiresOn`} state={state}>
          <Input {...f("expiresOn", doc.expiresOn ?? "")} type="date" className="h-8" />
        </Field>
        {state.status === "error" ? <FormStatus state={state} className="sm:col-span-2" /> : null}
        <div className="flex gap-2 sm:col-span-2">
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save
          </SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
      <div className="border-t pt-3">
        <ConfirmForm action={removeDocumentAction} fields={{ documentId: doc.id }} label="Remove from the locker" variant="ghost" confirm={`Remove “${doc.title}”? It stays in the audit history.`} showSuccess={false} />
      </div>
    </div>
  );
}

function UploadForm({ personId, today, onDone }: { personId: string; today: string; onDone: () => void }) {
  const [state, action] = useClosingAction(uploadDocumentAction, onDone);
  const [kind, setKind] = useState<DocumentKind>("offer_letter");
  const [tooBig, setTooBig] = useState<string | null>(null);
  const f = (name: string, initial: string) => ({ id: `upload-${name}`, name, defaultValue: fieldDefault(state, name, initial), ...invalidProps(state, name, `upload-${name}`) });
  return (
    <form action={action} className="grid gap-3 rounded-md bg-subtle p-3 sm:grid-cols-2" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <input type="hidden" name="personId" value={personId} />
      <Field
        label="File"
        name="file"
        htmlFor="upload-file"
        state={state}
        hint={`PDF, photo (JPEG, PNG, WebP) or Word file, up to ${formatFileSize(MAX_DOCUMENT_BYTES)}. Never a full Aadhaar or bank account number.`}
        className="sm:col-span-2"
      >
        <Input
          id="upload-file"
          name="file"
          type="file"
          accept={ACCEPT}
          required
          className="h-auto py-1.5"
          {...invalidProps(state, "file", "upload-file")}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            setTooBig(file && file.size > MAX_DOCUMENT_BYTES ? `${formatFileSize(file.size)} is too big. Use a PDF scan or a smaller photo.` : null);
          }}
        />
        {tooBig ? <p className="text-xs text-danger">{tooBig}</p> : null}
      </Field>
      <Field label="What it is" name="kind" htmlFor="upload-kind" state={state}>
        <Select {...f("kind", kind)} onChange={(e) => setKind(e.currentTarget.value as DocumentKind)} className="h-8">
          {DOCUMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {DOCUMENT_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Name (optional)" name="title" htmlFor="upload-title" state={state}>
        <Input {...f("title", "")} maxLength={120} placeholder={kind === "other" ? "The file's name" : DOCUMENT_KIND_LABELS[kind]} className="h-8" />
      </Field>
      <Field label="Valid till (if it lapses)" name="expiresOn" htmlFor="upload-expiresOn" state={state}>
        <Input {...f("expiresOn", "")} type="date" min={today} className="h-8" />
      </Field>
      <Field label="ID number (last 4 digits, optional)" name="idLast4" htmlFor="upload-idLast4" state={state} hint="Never the full number: only the last 4 digits are kept.">
        <Input {...f("idLast4", "")} inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="1234" className="h-8 w-24" />
      </Field>
      {kind === "id_proof" ? (
        <div className="space-y-1.5 rounded-md border border-warning/30 bg-warning-soft p-3 text-xs text-warning sm:col-span-2">
          <p>
            Masked copies only. For Aadhaar, download the masked Aadhaar from UIDAI, which shows only the last four digits. Never upload a full Aadhaar or bank
            account number.
          </p>
          <label className="flex items-start gap-2 font-medium">
            <Checkbox
             
              name="masked"
              required
              defaultChecked={fieldDefault(state, "masked", "") === "on"}
              className="mt-0.5"
              {...invalidProps(state, "masked", "upload-masked")}
              id="upload-masked"
            />
            Only the last four digits of any ID number show in this file.
          </label>
          {state.status === "error" && state.fieldErrors?.masked ? (
            <p id="upload-masked-error" className="text-danger">
              {state.fieldErrors.masked[0]}
            </p>
          ) : null}
        </div>
      ) : null}
      {state.status === "error" ? <FormStatus state={state} className="sm:col-span-2" /> : null}
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton size="sm" pendingLabel="Uploading…" disabled={tooBig !== null}>
          Upload
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
