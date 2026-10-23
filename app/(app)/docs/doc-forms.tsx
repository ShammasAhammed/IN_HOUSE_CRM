"use client";

// Writing a doc (Stage 9b.5): Markdown in a plain box, with a preview, history and archive.
import { Checkbox } from "@/components/ui/choice";
import { useActionState, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { FormStatus, SubmitButton } from "@/components/form";
import { MarkdownView } from "@/components/markdown-view";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { DOC_TEMPLATE_LABELS, DOC_TEMPLATES } from "@/services/rules/doc-templates";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { archiveDocAction, createDocAction, restoreDocAction, saveDocAction, setTrainingAction } from "./actions";
import { UnsavedGuard } from "@/components/unsaved-guard";

const HELP = "# Heading  **bold**  *italic*  - list  - [ ] to-do  1. steps  > note  [link](https://…)";

function Editor({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [text, setText] = useState(defaultValue);
  const [preview, setPreview] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs text-muted-foreground">{HELP}</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>
          {preview ? <Pencil /> : <Eye />} {preview ? "Write" : "Preview"}
        </Button>
      </div>
      <input type="hidden" name={name} value={text} />
      {preview ? (
        <div className="min-h-64 rounded-md border p-4">
          <MarkdownView source={text} />
        </div>
      ) : (
        <Textarea aria-label="Page text" value={text} onChange={(e) => setText(e.target.value)} rows={18} className="font-mono text-[13px]" maxLength={100000} />
      )}
    </div>
  );
}

export function NewDocForm({ parentId, clients, clientId, template }: { parentId: string | null; clients: Array<{ id: string; name: string }>; clientId: string; template?: string }) {
  const [state, action] = useActionState(createDocAction, idle);
  return (
    <form action={action} className="space-y-3">
      <UnsavedGuard />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <Input name="title" aria-label="Title" placeholder="Title" required maxLength={150} defaultValue={fieldDefault(state, "title", "")} className="h-10 text-base font-medium" />
      {parentId ? null : (
        <Select name="clientId" aria-label="Who sees it" defaultValue={fieldDefault(state, "clientId", clientId)} className="h-9 w-auto max-w-full">
          <option value="">Team page: everyone sees it</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}: only people on this client
            </option>
          ))}
        </Select>
      )}
      <Select name="template" aria-label="Start from" defaultValue={fieldDefault(state, "template", template ?? "blank")} className="h-9 w-auto max-w-full">
        {DOC_TEMPLATES.map((t) => (
          <option key={t} value={t}>
            {t === "blank" ? "Start from: blank page" : `Start from: ${DOC_TEMPLATE_LABELS[t]}`}
          </option>
        ))}
      </Select>
      <Editor name="body" defaultValue={fieldDefault(state, "body", "")} />
      <p className="text-xs text-muted-foreground">Leave the text empty to start from the template; after creating, Edit opens the block editor (/ for blocks).</p>
      {state.status === "error" ? <FormStatus state={state} /> : null}
      <SubmitButton pendingLabel="Creating…">Create page</SubmitButton>
    </form>
  );
}

export function EditDoc({ doc, startEditing = false, onClose }: { doc: { id: string; title: string; body: string; version: number }; startEditing?: boolean; onClose?: () => void }) {
  const [editing, setEditingState] = useState(startEditing);
  const setEditing = (on: boolean) => {
    setEditingState(on);
    if (!on) onClose?.();
  };
  const [state, action] = useActionState(async (prev: ActionState, f: FormData) => {
    const r = await saveDocAction(prev, f);
    if (r.status === "ok") setEditing(false);
    return r;
  }, idle);
  if (!editing)
    return (
      <div className="space-y-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
          <Pencil /> Edit
        </Button>
        {state.status === "ok" ? <FormStatus state={state} /> : null}
      </div>
    );
  return (
    <form action={action} className="space-y-3">
      <UnsavedGuard />
      <input type="hidden" name="docId" value={doc.id} />
      <input type="hidden" name="version" value={doc.version} />
      <Input name="title" aria-label="Title" required maxLength={150} defaultValue={fieldDefault(state, "title", doc.title)} className="h-10 text-base font-medium" />
      <Editor name="body" defaultValue={fieldDefault(state, "body", doc.body)} />
      {state.status === "error" ? <FormStatus state={state} /> : null}
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function RestoreVersion({ docId, version }: { docId: string; version: number }) {
  const [state, action] = useActionState(restoreDocAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="docId" value={docId} />
      <input type="hidden" name="version" value={version} />
      <button type="submit" className="text-xs text-primary hover:underline" title={state.status === "error" ? state.message : undefined}>
        Bring back
      </button>
    </form>
  );
}

export function ArchiveDoc({ docId }: { docId: string }) {
  const [state, action] = useActionState(archiveDocAction, idle);
  return (
    <form action={action} onSubmit={(e) => (confirm("Archive this page?") ? undefined : e.preventDefault())} className="space-y-1">
      <input type="hidden" name="docId" value={docId} />
      <Button type="submit" size="sm" variant="ghost">
        Archive page
      </Button>
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  );
}

/** HR slice 3: put a team page in the training library, for one department or everyone. */
export function TrainingToggle({ docId, training, departmentId, departments }: { docId: string; training: boolean; departmentId: string | null; departments: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(setTrainingAction, idle);
  return (
    <form action={action} className="space-y-2 text-sm">
      <input type="hidden" name="docId" value={docId} />
      <label className="flex items-center gap-2">
        <Checkbox name="training" defaultChecked={training} className="size-4 accent-primary" /> In the training library
      </label>
      <Select name="departmentId" aria-label="For which department" defaultValue={departmentId ?? ""} className="h-8">
        <option value="">For everyone</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            For {d.name}
          </option>
        ))}
      </Select>
      <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
        Save
      </SubmitButton>
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
    </form>
  );
}
