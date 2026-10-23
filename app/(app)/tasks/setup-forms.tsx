"use client";

// Forms for custom fields and templates (Stage 9b.4).
import { Checkbox } from "@/components/ui/choice";
import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, FileStack, Pencil, X } from "lucide-react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { TASK_FIELD_KINDS, TASK_FIELD_KIND_LABELS, type TaskFieldKind } from "@/lib/types";
import type { TaskFieldRow } from "@/repositories";
import type { FieldWithValue, TemplateSummary } from "@/services/task-setup";
import {
  addFieldAction,
  changeFieldAction,
  projectFromTemplateAction,
  removeTemplateAction,
  saveTemplateAction,
  setFieldValuesAction,
  taskFromTemplateAction,
} from "./setup-actions";

type Option = { id: string; name: string };

export function AddField({ clients }: { clients: Option[] }) {
  const [added, setAdded] = useState(0);
  const [state, action] = useActionState(async (prev: ActionState, f: FormData) => {
    const r = await addFieldAction(prev, f);
    if (r.status === "ok") setAdded((n) => n + 1);
    return r;
  }, idle);
  const [kind, setKind] = useState<TaskFieldKind>("text");
  return (
    <form action={action} key={`add-${added}`} className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap gap-2">
        <Input name="name" aria-label="Field name" placeholder="Field name, e.g. Shoot location" required maxLength={40} defaultValue={fieldDefault(state, "name", "")} className="h-9 min-w-0 flex-1 basis-48" />
        <Select name="kind" aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as TaskFieldKind)} className="h-9 w-auto">
          {TASK_FIELD_KINDS.map((k) => (
            <option key={k} value={k}>
              {TASK_FIELD_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <Select name="clientId" aria-label="Which tasks" defaultValue="" className="h-9 w-auto max-w-56">
          <option value="">Every client&apos;s tasks</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              Only {c.name}
            </option>
          ))}
        </Select>
      </div>
      {kind === "select" ? <Textarea name="options" rows={2} aria-label="Choices" placeholder="Choices, one per line or comma between" defaultValue={fieldDefault(state, "options", "")} /> : null}
      {state.status === "error" ? <FormStatus state={state} /> : null}
      <SubmitButton size="sm" pendingLabel="Adding…">
        Add field
      </SubmitButton>
    </form>
  );
}

function FieldButton({ fieldId, action, label, children }: { fieldId: string; action: string; label: string; children: React.ReactNode }) {
  const [state, run] = useActionState(changeFieldAction, idle);
  return (
    <form action={run}>
      <input type="hidden" name="fieldId" value={fieldId} />
      <input type="hidden" name="action" value={action} />
      <button type="submit" aria-label={label} title={state.status === "error" ? state.message : label} className="rounded p-1 text-muted-foreground hover:bg-hover hover:text-foreground">
        {children}
      </button>
    </form>
  );
}

export function FieldRow({ field, first, last, canManage }: { field: TaskFieldRow; first: boolean; last: boolean; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(async (prev: ActionState, f: FormData) => {
    const r = await changeFieldAction(prev, f);
    if (r.status === "ok") setEditing(false);
    return r;
  }, idle);
  if (editing)
    return (
      <li className="space-y-2 px-3 py-2.5">
        <form action={action} className="space-y-2" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
          <input type="hidden" name="fieldId" value={field.id} />
          <input type="hidden" name="action" value={field.kind === "select" ? "options" : "rename"} />
          {field.kind === "select" ? (
            <Textarea name="options" rows={3} aria-label="Choices" defaultValue={fieldDefault(state, "options", field.options.join("\n"))} />
          ) : (
            <Input name="name" aria-label="Field name" defaultValue={fieldDefault(state, "name", field.name)} required maxLength={40} className="h-9" />
          )}
          {state.status === "error" ? <FormStatus state={state} /> : null}
          <div className="flex gap-2">
            <SubmitButton size="sm" pendingLabel="Saving…">
              Save
            </SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  return (
    <li className="flex items-center gap-2 px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{field.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {TASK_FIELD_KIND_LABELS[field.kind]}
          {field.kind === "select" ? `: ${field.options.join(", ")}` : ""} · {field.clientName ? `only ${field.clientName}` : "every client"}
        </p>
      </div>
      {canManage ? (
        <div className="flex shrink-0 items-center">
          <button type="button" aria-label={field.kind === "select" ? `Change choices of ${field.name}` : `Rename ${field.name}`} onClick={() => setEditing(true)} className="rounded p-1 text-muted-foreground hover:bg-hover hover:text-foreground">
            <Pencil className="size-3.5" />
          </button>
          {first ? null : (
            <FieldButton fieldId={field.id} action="up" label={`Move ${field.name} up`}>
              <ArrowUp className="size-3.5" />
            </FieldButton>
          )}
          {last ? null : (
            <FieldButton fieldId={field.id} action="down" label={`Move ${field.name} down`}>
              <ArrowDown className="size-3.5" />
            </FieldButton>
          )}
          <FieldButton fieldId={field.id} action="remove" label={`Remove ${field.name}`}>
            <X className="size-3.5" />
          </FieldButton>
        </div>
      ) : null}
    </li>
  );
}

export function RemoveTemplate({ template }: { template: TemplateSummary }) {
  const [state, action] = useActionState(removeTemplateAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="templateId" value={template.id} />
      <button type="submit" aria-label={`Remove template ${template.name}`} title={state.status === "error" ? state.message : `Remove ${template.name}`} className="rounded p-1 text-muted-foreground hover:bg-hover hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </form>
  );
}

/** The task's custom fields as one small form. */
export function TaskFieldsForm({ taskId, fields, canEdit }: { taskId: string; fields: FieldWithValue[]; canEdit: boolean }) {
  const [state, action] = useActionState(setFieldValuesAction, idle);
  const err = (id: string) => (state.status === "error" ? state.fieldErrors?.[`field:${id}`]?.[0] : undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="taskId" value={taskId} />
      {fields.map((f) => {
        const name = `field:${f.id}`;
        const value = fieldDefault(state, name, f.value === null ? "" : String(f.value));
        const common = { name, "aria-invalid": Boolean(err(f.id)) || undefined, disabled: !canEdit, className: "h-9" };
        return (
          <label key={f.id} className="block space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">{f.name}</span>
            {f.kind === "checkbox" ? (
              <span className="flex items-center gap-2">
                <input type="hidden" name={`shown:${f.id}`} value="1" />
                <Checkbox name={name} defaultChecked={f.value === true} disabled={!canEdit} className="size-4 accent-primary" />
                Yes
              </span>
            ) : f.kind === "select" ? (
              <Select {...common} defaultValue={value}>
                <option value="">—</option>
                {/* A value whose choice was since removed stays until someone picks another. */}
                {value && !f.options.includes(value) ? <option value={value}>{value}</option> : null}
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            ) : (
              <Input {...common} type={f.kind === "number" ? "text" : f.kind === "date" ? "date" : f.kind === "link" ? "url" : "text"} inputMode={f.kind === "number" ? "decimal" : undefined} defaultValue={value} maxLength={f.kind === "link" ? 1000 : 500} />
            )}
            {err(f.id) ? <span className="block text-xs text-danger">{err(f.id)}</span> : null}
            {f.kind === "link" && f.value && !canEdit ? (
              <a href={String(f.value)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                Open link
              </a>
            ) : null}
          </label>
        );
      })}
      {canEdit ? (
        <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
          Save fields
        </SubmitButton>
      ) : null}
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
    </form>
  );
}

/** "Save as template" for a task or a project (leads only). */
export function SaveAsTemplate({ kind, sourceId, defaultName }: { kind: "task" | "project"; sourceId: string; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(async (prev: ActionState, f: FormData) => {
    const r = await saveTemplateAction(prev, f);
    if (r.status === "ok") setOpen(false);
    return r;
  }, idle);
  if (!open)
    return (
      <div className="space-y-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <FileStack /> Save as template
        </Button>
        {state.status === "ok" ? <FormStatus state={state} /> : null}
      </div>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="sourceId" value={sourceId} />
      <Input name="name" aria-label="Template name" defaultValue={fieldDefault(state, "name", defaultName)} required maxLength={80} autoFocus className="h-8 min-w-0 flex-1" />
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save
      </SubmitButton>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {state.status === "error" ? <FormStatus state={state} className="basis-full" /> : null}
    </form>
  );
}

/** A new task in this project from a task template. */
export function TaskFromTemplate({ projectId, templates, people }: { projectId: string; templates: TemplateSummary[]; people: Option[] }) {
  const [state, action] = useActionState(taskFromTemplateAction, idle);
  if (!templates.length) return null;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-wrap gap-2">
        <Select name="templateId" aria-label="Template" required defaultValue="" className="h-9 min-w-0 flex-1 basis-48">
          <option value="" disabled>
            From a template…
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Input name="title" aria-label="Title (optional)" placeholder="Title (optional)" maxLength={200} className="h-9 min-w-0 flex-1 basis-40" />
        <Select name="ownerId" aria-label="Owner" defaultValue="" className="h-9 w-auto max-w-44">
          <option value="">No owner yet</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input name="startDate" type="date" aria-label="Start" className="h-9 w-auto" />
        <SubmitButton size="sm" variant="outline" pendingLabel="Creating…">
          Create task
        </SubmitButton>
      </div>
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  );
}

/** A new project for this client from a project template. */
export function ProjectFromTemplate({ clientId, templates, people, today }: { clientId: string; templates: TemplateSummary[]; people: Option[]; today: string }) {
  const [state, action] = useActionState(projectFromTemplateAction, idle);
  if (!templates.length) return <p className="text-sm text-muted-foreground">No project templates yet. Open a project and choose &quot;Save as template&quot;.</p>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <label className="block space-y-1 text-sm">
        <span className="text-xs text-muted-foreground">Template</span>
        <Select name="templateId" required defaultValue={fieldDefault(state, "templateId", "")} className="h-9">
          <option value="" disabled>
            Pick a template…
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.tasks} {t.tasks === 1 ? "task" : "tasks"})
            </option>
          ))}
        </Select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-xs text-muted-foreground">Project name</span>
        <Input name="name" required minLength={2} maxLength={120} defaultValue={fieldDefault(state, "name", "")} className="h-9" />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">Starts</span>
          <Input name="startDate" type="date" required defaultValue={fieldDefault(state, "startDate", today)} className="h-9" />
        </label>
        <label className="min-w-0 flex-1 space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">Lead</span>
          <Select name="leadId" defaultValue="" className="h-9">
            <option value="">The client&apos;s lead strategist</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {state.status === "error" ? <FormStatus state={state} /> : null}
      <SubmitButton pendingLabel="Creating…">Create from template</SubmitButton>
    </form>
  );
}
