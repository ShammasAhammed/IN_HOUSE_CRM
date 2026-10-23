"use client";

import { Checkbox } from "@/components/ui/choice";
import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { ROLES, ROLE_LABELS } from "@/lib/types";
import type { WorkWeek } from "@/services/rules/working-days";
import type { ServiceSetup } from "@/services/catalog";
import type { TaskTemplateRecord } from "@/repositories";
import {
  addStageAction,
  addTemplateAction,
  createServiceAction,
  moveServiceAction,
  moveStageAction,
  moveTemplateAction,
  removeStageAction,
  removeTemplateAction,
  renameStageAction,
  setWorkWeekAction,
  updateServiceAction,
  updateTemplateAction,
} from "./actions";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** A small icon button that posts hidden fields (move up/down, remove). Errors show beside it. */
function IconAction({ action, fields, label, icon: Icon, disabled, confirm }: { action: Action; fields: Record<string, string>; label: string; icon: typeof ArrowUp; disabled?: boolean; confirm?: string }) {
  const [state, run] = useActionState(action, idle);
  return (
    <form
      action={run}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="inline-flex items-center"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant="ghost" size="icon" className="size-7" aria-label={label} title={label} disabled={disabled}>
        <Icon className="size-3.5" />
      </SubmitButton>
      {state.status === "error" ? (
        <span role="alert" className="ml-1 max-w-48 text-xs text-danger">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function ServiceCard({ service, first, last }: { service: ServiceSetup; first: boolean; last: boolean }) {
  const [state, action] = useActionState(updateServiceAction, idle);
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <form action={action} className="flex flex-1 flex-wrap items-end gap-3" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
          <input type="hidden" name="serviceId" value={service.id} />
          <Field label="Service" name="name" htmlFor={`${service.id}-name`} state={state} className="min-w-56 flex-1">
            <Input id={`${service.id}-name`} name="name" required maxLength={80} defaultValue={fieldDefault(state, "name", service.name)} {...invalidProps(state, "name", `${service.id}-name`)} />
          </Field>
          <Field label="What it is" name="description" htmlFor={`${service.id}-description`} state={state} className="min-w-56 flex-[2]">
            <Input id={`${service.id}-description`} name="description" maxLength={300} defaultValue={fieldDefault(state, "description", service.description ?? "")} />
          </Field>
          <div className="flex h-9 items-center gap-2">
            <Checkbox id={`${service.id}-active`} name="active" defaultChecked={service.active} className="size-4 accent-primary" />
            <Label htmlFor={`${service.id}-active`} className="font-normal">
              On sale
            </Label>
          </div>
          <SubmitButton size="sm" variant="outline">
            Save
          </SubmitButton>
        </form>
        <div className="flex h-9 items-center">
          {service.active ? null : <Badge tone="neutral">Retired</Badge>}
          <IconAction action={moveServiceAction} fields={{ serviceId: service.id, direction: "up" }} label="Move up" icon={ArrowUp} disabled={first} />
          <IconAction action={moveServiceAction} fields={{ serviceId: service.id, direction: "down" }} label="Move down" icon={ArrowDown} disabled={last} />
        </div>
      </div>
      {state.status === "error" ? <FormStatus state={state} /> : null}

      <div className="grid gap-5 2xl:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Stages</h3>
          <ol className="space-y-1">
            {service.stages.map((st, i) => (
              <li key={st.id} className="flex items-center gap-1">
                <span className="tabular w-5 text-xs text-muted-foreground">{i + 1}</span>
                <RenameStage id={st.id} name={st.name} />
                <IconAction action={moveStageAction} fields={{ stageId: st.id, direction: "up" }} label="Move up" icon={ArrowUp} disabled={i === 0} />
                <IconAction action={moveStageAction} fields={{ stageId: st.id, direction: "down" }} label="Move down" icon={ArrowDown} disabled={i === service.stages.length - 1} />
                <IconAction
                  action={removeStageAction}
                  fields={{ stageId: st.id }}
                  label="Remove"
                  icon={Trash2}
                  confirm={`Remove the stage ${st.name}? Starter tasks on it lose their stage. Existing projects keep theirs.`}
                />
              </li>
            ))}
          </ol>
          <AddStage serviceId={service.id} />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Starter tasks</h3>
          <p className="text-xs text-muted-foreground">Created when a project starts, if the person starting it asks. Each goes to someone on the client&apos;s team with the role, or to the project lead.</p>
          <div className="hidden gap-1.5 pr-24 text-xs text-muted-foreground xl:grid xl:grid-cols-[minmax(9rem,1fr)_9rem_9.5rem_4rem_4rem_3.5rem]">
            <span>Task</span>
            <span>Stage</span>
            <span>Goes to</span>
            <span title="Due this many days after the project starts">Due day</span>
            <span>Hours</span>
          </div>
          <div className="space-y-1.5">
            {service.templates.map((t, i) => (
              <TemplateRow key={t.id} template={t} stages={service.stages} first={i === 0} last={i === service.templates.length - 1} />
            ))}
          </div>
          <TemplateRow serviceId={service.id} stages={service.stages} />
        </div>
      </div>
    </section>
  );
}

function RenameStage({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(renameStageAction, idle);
  return (
    <form action={action} className="min-w-0 flex-1" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : name}>
      <input type="hidden" name="stageId" value={id} />
      <Input
        name="name"
        aria-label="Stage name"
        defaultValue={fieldDefault(state, "name", name)}
        maxLength={80}
        className="h-8"
        onBlur={(e) => {
          if (e.currentTarget.value.trim() !== name) e.currentTarget.form?.requestSubmit();
        }}
        title={state.status === "error" ? state.message : undefined}
        {...invalidProps(state, "name")}
      />
    </form>
  );
}

function AddStage({ serviceId }: { serviceId: string }) {
  const [state, action] = useActionState(addStageAction, idle);
  return (
    <form action={action} className="flex min-w-0 items-center gap-2 pl-6">
      <input type="hidden" name="serviceId" value={serviceId} />
      <Input name="name" aria-label="New stage" placeholder="Add a stage…" maxLength={80} className="h-8" required {...invalidProps(state, "name")} />
      <SubmitButton size="sm" variant="ghost" aria-label="Add stage">
        <Plus />
      </SubmitButton>
      {state.status === "error" ? <span className="text-xs text-danger">{state.fieldErrors?.name?.[0] ?? state.message}</span> : null}
    </form>
  );
}

/** One starter task (edit) or the empty row to add one. */
function TemplateRow({ template, serviceId, stages, first, last }: { template?: TaskTemplateRecord; serviceId?: string; stages: ServiceSetup["stages"]; first?: boolean; last?: boolean }) {
  const [state, action] = useActionState(template ? updateTemplateAction : addTemplateAction, idle);
  const p = (n: string) => `${template?.id ?? `new-${serviceId}`}-${n}`;
  const d = (n: string, v: string) => fieldDefault(state, n, v);
  return (
    <div>
      <div className="flex items-start gap-1 border-b pb-1.5 last:border-0 xl:items-center xl:border-0 xl:pb-0">
        <form action={action} className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 xl:grid-cols-[minmax(9rem,1fr)_9rem_9.5rem_4rem_4rem_3.5rem] xl:items-center" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
          {template ? <input type="hidden" name="templateId" value={template.id} /> : <input type="hidden" name="serviceId" value={serviceId} />}
          <Input id={p("title")} name="title" aria-label="Task" required maxLength={200} placeholder={template ? undefined : "Add a starter task…"} defaultValue={d("title", template?.title ?? "")} className="col-span-2 h-8 xl:col-span-1" {...invalidProps(state, "title")} />
          <Select id={p("stage")} name="stagePosition" aria-label="Stage" defaultValue={d("stagePosition", template?.stagePosition?.toString() ?? "")} className="h-8">
            <option value="">No stage</option>
            {stages.map((s) => (
              <option key={s.id} value={s.position}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select id={p("role")} name="defaultRole" aria-label="Goes to" defaultValue={d("defaultRole", template?.defaultRole ?? "")} className="h-8">
            <option value="">Project lead</option>
            {ROLES.filter((r) => r !== "hr" && r !== "accountant").map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-14 shrink-0 xl:hidden">Due day</span>
            <Input id={p("due")} name="dueOffsetDays" aria-label="Due this many days after the start" type="number" min="0" max="365" required defaultValue={d("dueOffsetDays", String(template?.dueOffsetDays ?? 7))} className="tabular h-8 min-w-0" {...invalidProps(state, "dueOffsetDays")} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-14 shrink-0 xl:hidden">Hours</span>
            <Input id={p("hours")} name="estimateHours" aria-label="Estimate in hours" type="number" min="0" step="0.25" defaultValue={d("estimateHours", template?.estimateMinutes ? String(template.estimateMinutes / 60) : "")} className="tabular h-8 min-w-0" />
          </label>
          <SubmitButton size="sm" variant={template ? "ghost" : "outline"}>
            {template ? "Save" : "Add"}
          </SubmitButton>
        </form>
        <span className="flex w-24 shrink-0 items-center justify-end">
          {template ? (
            <>
              <IconAction action={moveTemplateAction} fields={{ templateId: template.id, direction: "up" }} label="Move up" icon={ArrowUp} disabled={first} />
              <IconAction action={moveTemplateAction} fields={{ templateId: template.id, direction: "down" }} label="Move down" icon={ArrowDown} disabled={last} />
              <IconAction action={removeTemplateAction} fields={{ templateId: template.id }} label="Remove" icon={Trash2} confirm={`Remove the starter task "${template.title}"?`} />
            </>
          ) : null}
        </span>
      </div>
      {state.status === "error" ? <p className="mt-1 text-xs text-danger">{Object.values(state.fieldErrors ?? {})[0]?.[0] ?? state.message}</p> : null}
    </div>
  );
}

export function NewServiceForm() {
  const [state, action] = useActionState(createServiceAction, idle);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-4" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <Field label="New service" name="name" htmlFor="new-service-name" state={state} className="min-w-56 flex-1">
        <Input id="new-service-name" name="name" required maxLength={80} placeholder="e.g. Admissions chatbot" defaultValue={fieldDefault(state, "name", "")} {...invalidProps(state, "name", "new-service-name")} />
      </Field>
      <Field label="What it is" name="description" htmlFor="new-service-description" state={state} className="min-w-56 flex-[2]">
        <Input id="new-service-description" name="description" maxLength={300} defaultValue={fieldDefault(state, "description", "")} />
      </Field>
      <SubmitButton size="sm" pendingLabel="Adding…">
        <Plus /> Add service
      </SubmitButton>
    </form>
  );
}

const DAYS: Array<[number, string]> = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [0, "Sunday"],
];

export function WorkWeekForm({ week: saved }: { week: WorkWeek }) {
  const [state, action] = useActionState(setWorkWeekAction, idle);
  // After a refusal the boxes show what was tried, not what is saved, so nothing has to be ticked again.
  const tried = state.status === "error" && state.values ? state.values : null;
  const week: WorkWeek = tried
    ? { workingWeekdays: (tried.workingWeekdays as string[]).map(Number), saturdaysOff: (tried.saturdaysOff as string[]).map(Number) }
    : saved;
  const [saturday, setSaturday] = useState(week.workingWeekdays.includes(6));
  return (
    <form
      key={tried ? JSON.stringify(tried) : "saved"}
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("This applies to every date, past ones too: booked leave is recounted, and so are capacity and recurring task dates. Go ahead?")) e.preventDefault();
      }}
      className="max-w-xl space-y-5 rounded-lg border bg-card p-4 shadow-card md:p-5"
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Working days</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {DAYS.map(([n, label]) => (
            <label key={n} className="flex items-center gap-2 text-sm">
              <Checkbox name="workingWeekdays" value={n} defaultChecked={week.workingWeekdays.includes(n)} onChange={n === 6 ? (e) => setSaturday(e.target.checked) : undefined} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {saturday ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Saturdays off</legend>
          <p className="text-xs text-muted-foreground">Which Saturdays of each month are off.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex items-center gap-2 text-sm">
                <Checkbox name="saturdaysOff" value={n} defaultChecked={week.saturdaysOff.includes(n)} className="size-4 accent-primary" />
                {["1st", "2nd", "3rd", "4th", "5th"][n - 1]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Used for leave day counts, capacity, time gaps and recurring task dates. A change applies to every date, past ones too, so it&apos;s refused if booked
        leave would take anyone below zero.
      </p>
      <FormStatus state={state} />
      <SubmitButton pendingLabel="Saving…">Save working week</SubmitButton>
    </form>
  );
}
