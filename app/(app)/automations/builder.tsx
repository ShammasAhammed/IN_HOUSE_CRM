"use client";

// The automation builder (Stage 9b.5): When … (only if …) do … — in plain words.
import { Checkbox } from "@/components/ui/choice";
import { useActionState, useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { idle, type ActionState } from "@/lib/action-state";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_STATUS_LABELS } from "@/lib/types";
import { ACTIONS, ACTION_LABELS, TRIGGERS, TRIGGER_LABELS, type AutomationAction, type AutomationConditions, type AutomationTrigger, type ActionType } from "@/services/rules/automations";
import { removeAutomationAction, saveAutomationAction } from "./actions";

type Option = { id: string; name: string };
type Draft = Record<string, unknown> & { type: ActionType };
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

const blank = (type: ActionType): Draft =>
  type === "set_status" ? { type, status: "in_review" } : type === "set_priority" ? { type, priority: "high" } : type === "add_checklist" ? { type, steps: [] as string[], stepsText: "" } : type === "set_due" ? { type, days: 2 } : type === "create_task" ? { type, title: "", days: 1, ownerId: null } : { type };

/** Turns the drafts into the rule's actions (dropping the helper text field). */
const toActions = (drafts: Draft[]) =>
  drafts.map((d) => {
    if (d.type === "add_checklist") return { type: d.type, steps: String(d.stepsText ?? "").split("\n").map((s) => s.trim()).filter(Boolean) };
    if (d.type === "set_due") return { type: d.type, days: Number(d.days ?? 0) };
    if (d.type === "create_task") return { type: d.type, title: String(d.title ?? ""), days: d.days === "" || d.days === null || d.days === undefined ? null : Number(d.days), ownerId: d.ownerId || null };
    return d;
  });

export function AutomationBuilder({
  initial,
  clients,
  projects,
  people,
  forms,
  onDone,
}: {
  initial?: { id: string; name: string; active: boolean; trigger: AutomationTrigger; conditions: AutomationConditions; actions: AutomationAction[] };
  clients: Option[];
  projects: Array<Option & { clientId: string }>;
  people: Option[];
  forms: string[];
  onDone?: () => void;
}) {
  // Controlled, so React's form reset after a refused save can't wipe the name (QA S9-01).
  const [name, setName] = useState(initial?.name ?? "");
  const activeId = useId();
  const [trigger, setTrigger] = useState<AutomationTrigger>(initial?.trigger ?? { type: "status_changed", status: "in_review" });
  const [conditions, setConditions] = useState<AutomationConditions>(initial?.conditions ?? {});
  const [actions, setActions] = useState<Draft[]>(() => (initial?.actions ?? [{ type: "notify" }]).map((a) => (a.type === "add_checklist" ? { ...a, stepsText: a.steps.join("\n") } : ({ ...a } as Draft))));
  const [state, action] = useActionState(async (prev: ActionState, f: FormData) => {
    const r = await saveAutomationAction(prev, f);
    if (r.status === "ok") onDone?.();
    return r;
  }, idle);
  const setAction = (i: number, patch: Record<string, unknown>) => setActions((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined && v !== null));
  const projectList = projects.filter((p) => !conditions.clientId || p.clientId === conditions.clientId);

  return (
    <form action={action} className="space-y-4">
      {initial ? <input type="hidden" name="automationId" value={initial.id} /> : null}
      <input type="hidden" name="trigger" value={JSON.stringify(clean(trigger))} />
      <input type="hidden" name="conditions" value={JSON.stringify(clean(conditions))} />
      <input type="hidden" name="actions" value={JSON.stringify(toActions(actions))} />
      <Input name="name" aria-label="Automation name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Send reviews to Anjali" className="h-9" />

      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-xs font-semibold">When</legend>
        <div className="flex flex-wrap gap-2">
          <Select aria-label="When" value={trigger.type} onChange={(e) => setTrigger({ type: e.target.value as AutomationTrigger["type"] })} className="h-9 w-auto">
            {TRIGGERS.map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABELS[t]}
              </option>
            ))}
          </Select>
          {trigger.type === "status_changed" ? (
            <Select aria-label="To which status" value={trigger.status ?? ""} onChange={(e) => setTrigger({ ...trigger, status: (e.target.value || undefined) as AutomationTrigger["status"] })} className="h-9 w-auto">
              <option value="">to any status</option>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  to {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          ) : null}
          {trigger.type === "priority_changed" ? (
            <Select aria-label="To which priority" value={trigger.priority ?? ""} onChange={(e) => setTrigger({ ...trigger, priority: (e.target.value || undefined) as AutomationTrigger["priority"] })} className="h-9 w-auto">
              <option value="">to any priority</option>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  to {cap(p)}
                </option>
              ))}
            </Select>
          ) : null}
          {trigger.type === "tagged" ? <Input aria-label="Which tag" value={trigger.tag ?? ""} onChange={(e) => setTrigger({ ...trigger, tag: e.target.value || undefined })} placeholder="any tag" maxLength={30} className="h-9 w-40" /> : null}
        </div>
      </fieldset>

      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-xs font-semibold">Only if</legend>
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Client" value={conditions.clientId ?? ""} onChange={(e) => setConditions({ ...conditions, clientId: e.target.value || undefined, projectId: undefined })} className="h-9 w-auto max-w-56">
            <option value="">Any client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Project" value={conditions.projectId ?? ""} onChange={(e) => setConditions({ ...conditions, projectId: e.target.value || undefined })} className="h-9 w-auto max-w-56">
            <option value="">Any project</option>
            {projectList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Input aria-label="Has tag" value={conditions.hasTag ?? ""} onChange={(e) => setConditions({ ...conditions, hasTag: e.target.value || undefined })} placeholder="has tag (optional)" maxLength={30} className="h-9 w-44" />
          {trigger.type === "task_created" && forms.length ? (
            <Select aria-label="From request form" value={conditions.fromForm ?? ""} onChange={(e) => setConditions({ ...conditions, fromForm: e.target.value || undefined })} className="h-9 w-auto max-w-56">
              <option value="">From anywhere</option>
              {forms.map((f) => (
                <option key={f} value={f}>
                  From the form {f}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-xs font-semibold">Do</legend>
        {actions.map((a, i) => (
          <div key={i} className="flex flex-wrap items-start gap-2 rounded-md bg-subtle p-2">
            <Select aria-label={`Action ${i + 1}`} value={a.type} onChange={(e) => setActions((as) => as.map((x, j) => (j === i ? blank(e.target.value as ActionType) : x)))} className="h-9 w-auto">
              {ACTIONS.map((t) => (
                <option key={t} value={t}>
                  {ACTION_LABELS[t]}
                </option>
              ))}
            </Select>
            {a.type === "set_status" ? (
              <Select aria-label="Status" value={String(a.status)} onChange={(e) => setAction(i, { status: e.target.value })} className="h-9 w-auto">
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            ) : null}
            {a.type === "set_priority" ? (
              <Select aria-label="Priority" value={String(a.priority)} onChange={(e) => setAction(i, { priority: e.target.value })} className="h-9 w-auto">
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {cap(p)}
                  </option>
                ))}
              </Select>
            ) : null}
            {a.type === "assign" || a.type === "add_watcher" || a.type === "notify" ? (
              <Select aria-label="Person" value={String(a.personId ?? "")} onChange={(e) => setAction(i, { personId: e.target.value || undefined })} className="h-9 w-auto max-w-48">
                <option value="">Pick someone…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            ) : null}
            {a.type === "notify" ? <Input aria-label="Message" value={String(a.message ?? "")} onChange={(e) => setAction(i, { message: e.target.value })} placeholder="Message" maxLength={200} className="h-9 min-w-0 flex-1 basis-48" /> : null}
            {a.type === "add_tag" ? <Input aria-label="Tag" value={String(a.tag ?? "")} onChange={(e) => setAction(i, { tag: e.target.value })} placeholder="Tag" maxLength={30} className="h-9 w-40" /> : null}
            {a.type === "add_checklist" ? <Textarea aria-label="Steps" rows={3} value={String(a.stepsText ?? "")} onChange={(e) => setAction(i, { stepsText: e.target.value })} placeholder="One step per line" className="min-w-0 flex-1 basis-56" /> : null}
            {a.type === "set_due" ? (
              <label className="flex items-center gap-2 text-sm">
                <Input aria-label="Days from then" type="number" min={0} max={365} value={String(a.days ?? 0)} onChange={(e) => setAction(i, { days: e.target.value })} className="h-9 w-20" /> days from then
              </label>
            ) : null}
            {a.type === "create_task" ? (
              <>
                <Input aria-label="Follow-up title" value={String(a.title ?? "")} onChange={(e) => setAction(i, { title: e.target.value })} placeholder="Follow-up task title" maxLength={200} className="h-9 min-w-0 flex-1 basis-48" />
                <Input aria-label="Due in days" type="number" min={0} max={365} value={a.days === null || a.days === undefined ? "" : String(a.days)} onChange={(e) => setAction(i, { days: e.target.value })} placeholder="due in days" className="h-9 w-28" />
                <Select aria-label="Follow-up owner" value={String(a.ownerId ?? "")} onChange={(e) => setAction(i, { ownerId: e.target.value || null })} className="h-9 w-auto max-w-48">
                  <option value="">Same owner</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </>
            ) : null}
            <button type="button" disabled={actions.length === 1} onClick={() => setActions((as) => as.filter((_, j) => j !== i))} aria-label={`Remove action ${i + 1}`} className="ml-auto rounded p-1.5 text-muted-foreground hover:bg-hover disabled:opacity-30">
              <X className="size-4" />
            </button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" disabled={actions.length >= 10} onClick={() => setActions((as) => [...as, blank("notify")])}>
          <Plus /> Add an action
        </Button>
      </fieldset>

      {/* The label is tied to the box by id too, so its name is "Rule is on", not "on" (QA S3-B3). */}
      <div className="flex items-center gap-2 text-sm">
        <Checkbox id={activeId} name="active" defaultChecked={initial?.active ?? true} className="size-4 accent-primary" />
        <label htmlFor={activeId}>Rule is on</label>
      </div>
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
      <SubmitButton pendingLabel="Saving…">{initial ? "Save automation" : "Create automation"}</SubmitButton>
    </form>
  );
}

export function NewAutomation(props: Omit<Parameters<typeof AutomationBuilder>[0], "initial" | "onDone">) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(0);
  if (!open)
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus /> New automation
      </Button>
    );
  return (
    <div className="space-y-2 rounded-lg border bg-card p-4 shadow-card">
      <AutomationBuilder key={n} {...props} onDone={() => (setOpen(false), setN((x) => x + 1))} />
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

export function EditAutomation(props: Parameters<typeof AutomationBuilder>[0] & { initial: NonNullable<Parameters<typeof AutomationBuilder>[0]["initial"]> }) {
  const [open, setOpen] = useState(false);
  const [state, remove] = useActionState(removeAutomationAction, idle);
  if (!open)
    return (
      <div className="flex items-center gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Edit
        </Button>
        <form action={remove} onSubmit={(e) => (confirm("Remove this automation?") ? undefined : e.preventDefault())}>
          <input type="hidden" name="automationId" value={props.initial.id} />
          <Button type="submit" size="sm" variant="ghost">
            Remove
          </Button>
        </form>
        {state.status === "error" ? <FormStatus state={state} /> : null}
      </div>
    );
  return (
    <div className="mt-3 basis-full space-y-2">
      <AutomationBuilder {...props} onDone={() => setOpen(false)} />
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
