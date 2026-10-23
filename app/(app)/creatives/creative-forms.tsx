"use client";

// Forms for creatives (Stage 7.2, D80): a new creative on a task, the next version, the review steps and comments.
// A version is a file (JPEG, PNG, WebP, PDF up to 3.5 MB) or a link to where the work lives (videos, big files).
import { DraftReplyButton } from "@/components/draft-reply";
import { Checkbox } from "@/components/ui/choice";
import { useActionState, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { formatFileSize } from "@/lib/format";
import { ASSET_KINDS, type AssetKind, type ReviewAction } from "@/lib/types";
import { REVIEW_ACTION_LABELS, REVIEW_STEPS } from "@/services/rules/assets";
import { MAX_DOCUMENT_BYTES } from "@/services/rules/documents";
import { addVersionAction, assetCommentAction, createAssetAction, reviewAction } from "./actions";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf,.docx";
const KIND_LABELS: Record<AssetKind, string> = { image: "Image", video: "Video", document: "Document", link: "Link", other: "Other" };
const keyOf = (state: ActionState) => (state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial");

/** The file picker and the link box: one or the other. Large files go by link. */
function SourceFields({ state, prefix }: { state: ActionState; prefix: string }) {
  const [tooBig, setTooBig] = useState<string | null>(null);
  return (
    <>
      <Field label="File" name="file" htmlFor={`${prefix}-file`} state={state} hint={state.status === "error" ? "Choose the file again." : `JPEG, PNG, WebP, PDF or Word up to ${formatFileSize(MAX_DOCUMENT_BYTES)}.`}>
        <Input
          id={`${prefix}-file`}
          name="file"
          type="file"
          accept={ACCEPT}
          className="h-auto py-1.5"
          {...invalidProps(state, "file", `${prefix}-file`)}
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            const big = Boolean(f && f.size > MAX_DOCUMENT_BYTES);
            setTooBig(big && f ? `${formatFileSize(f.size)} is too big to upload: put it in Drive and paste the link instead.` : null);
            // Never send a file the server would refuse (and that would break the request's size limit).
            if (big) e.currentTarget.value = "";
          }}
        />
        {tooBig ? <p className="text-xs text-danger">{tooBig}</p> : null}
      </Field>
      <Field label="…or a link (videos, big files, Canva, Figma)" name="link" htmlFor={`${prefix}-link`} state={state}>
        <Input id={`${prefix}-link`} name="link" type="url" inputMode="url" placeholder="https://drive.google.com/…" defaultValue={fieldDefault(state, "link", "")} className="h-8" {...invalidProps(state, "link", `${prefix}-link`)} />
      </Field>
    </>
  );
}

function SubmitForReview({ state, id }: { state: ActionState; id: string }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <Checkbox id={id} name="submit" defaultChecked={state.status !== "error" || fieldDefault(state, "submit", "") === "on"} className="size-4 accent-primary" />
      Send for review now
    </label>
  );
}

export function NewCreativeForm({ clientId, taskId, defaultTitle }: { clientId: string; taskId: string; defaultTitle: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createAssetAction, idle);
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> Add creative
      </Button>
    );
  }
  return (
    <form action={action} key={keyOf(state)} className="grid gap-3 rounded-md bg-subtle p-3 sm:grid-cols-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="taskId" value={taskId} />
      <Field label="Name" name="title" htmlFor="new-creative-title" state={state}>
        <Input id="new-creative-title" name="title" required maxLength={160} defaultValue={fieldDefault(state, "title", defaultTitle)} className="h-8" {...invalidProps(state, "title", "new-creative-title")} />
      </Field>
      <Field label="Kind" name="kind" htmlFor="new-creative-kind" state={state} hint="Leave it to be read from the file.">
        <Select id="new-creative-kind" name="kind" defaultValue={fieldDefault(state, "kind", "")} className="h-8">
          <option value="">From the file</option>
          {ASSET_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      <SourceFields state={state} prefix="new-creative" />
      <Field label="Note (optional)" name="note" htmlFor="new-creative-note" state={state} className="sm:col-span-2">
        <Input id="new-creative-note" name="note" maxLength={500} placeholder="e.g. Two sizes: feed and story" defaultValue={fieldDefault(state, "note", "")} className="h-8" />
      </Field>
      <div className="sm:col-span-2">
        <SubmitForReview state={state} id="new-creative-submit" />
      </div>
      {state.status === "error" ? <FormStatus state={state} className="sm:col-span-2" /> : null}
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton size="sm" pendingLabel="Uploading…">
          <Upload /> Add creative
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function NewVersionForm({ assetId, next }: { assetId: string; next: number }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(async (prev: ActionState, form: FormData) => {
    const r = await addVersionAction(prev, form);
    if (r.status === "ok") setOpen(false);
    return r;
  }, idle);
  if (!open) {
    return (
      <div className="space-y-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Upload /> Add version {next}
        </Button>
        {state.status === "ok" ? <FormStatus state={state} /> : null}
      </div>
    );
  }
  return (
    <form action={action} key={keyOf(state)} className="grid gap-3 rounded-md bg-subtle p-3 sm:grid-cols-2">
      <input type="hidden" name="assetId" value={assetId} />
      <SourceFields state={state} prefix="version" />
      <Field label="What changed (optional)" name="note" htmlFor="version-note" state={state} className="sm:col-span-2">
        <Input id="version-note" name="note" maxLength={500} placeholder="e.g. Logo bigger, date in Malayalam" defaultValue={fieldDefault(state, "note", "")} className="h-8" />
      </Field>
      <div className="sm:col-span-2">
        <SubmitForReview state={state} id="version-submit" />
      </div>
      {state.status === "error" ? <FormStatus state={state} className="sm:col-span-2" /> : null}
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton size="sm" pendingLabel="Uploading…">
          Add version {next}
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const NOTE_HINT: Partial<Record<ReviewAction, string>> = {
  client_approved: "Who approved, and where? e.g. Principal, on WhatsApp",
  client_changes: "What did the client ask for?",
  request_changes: "What should change?",
};

/** The review steps open to this person now. Steps that ask for changes need a note. */
export function ReviewPanel({ assetId, versionId, actions }: { assetId: string; versionId: string; actions: ReviewAction[] }) {
  const [state, action] = useActionState(reviewAction, idle);
  const needsNote = actions.some((a) => REVIEW_STEPS[a].noteRequired);
  const hint = actions.map((a) => NOTE_HINT[a]).find(Boolean);
  return (
    <form action={action} key={keyOf(state)} className="space-y-2">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="versionId" value={versionId} />
      {needsNote || hint ? (
        <Field label={needsNote ? "Note (needed for the client's answer and for changes)" : "Note (optional)"} name="note" htmlFor="review-note" state={state}>
          <Textarea id="review-note" name="note" rows={2} maxLength={2000} placeholder={hint} defaultValue={fieldDefault(state, "note", "")} {...invalidProps(state, "note", "review-note")} />
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <SubmitButton key={a} name="action" value={a} size="sm" variant={REVIEW_STEPS[a].noteRequired ? "outline" : i === 0 ? "default" : "outline"} pendingLabel="Saving…">
            {REVIEW_ACTION_LABELS[a]}
          </SubmitButton>
        ))}
      </div>
      {state.status === "error" && !state.fieldErrors?.note ? <FormStatus state={state} /> : null}
    </form>
  );
}

export function CommentForm({ assetId, versionId, video, canDraft = false }: { assetId: string; versionId: string; video: boolean; canDraft?: boolean }) {
  const [state, action] = useActionState(assetCommentAction, idle);
  return (
    <form action={action} key={keyOf(state)} className="space-y-2">
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="versionId" value={versionId} />
      <div className="flex flex-wrap items-start gap-2">
        {video ? (
          <Input name="at" aria-label="At (minutes:seconds)" placeholder="1:05" inputMode="numeric" maxLength={6} defaultValue={fieldDefault(state, "at", "")} className="h-9 w-20" {...invalidProps(state, "at", `comment-at-${versionId}`)} id={`comment-at-${versionId}`} />
        ) : null}
        <Textarea name="body" aria-label="Comment" rows={1} required maxLength={5000} placeholder={video ? "What should change at that moment?" : "Comment on this version…"} defaultValue={fieldDefault(state, "body", "")} className="min-h-9 min-w-0 flex-1" />
        <SubmitButton size="sm" variant="outline" pendingLabel="Posting…">
          Post
        </SubmitButton>
      </div>
      {canDraft ? <DraftReplyButton target={{ kind: "creative", assetId }} /> : null}
      {state.status === "error" ? (
        <p id={`comment-at-${versionId}-error`} className="text-xs text-danger">
          {state.fieldErrors?.at?.[0] ?? state.fieldErrors?.body?.[0] ?? state.message}
        </p>
      ) : null}
    </form>
  );
}
