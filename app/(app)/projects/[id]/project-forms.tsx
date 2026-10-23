"use client";

import { useActionState, useState, useTransition } from "react";
import { Repeat } from "lucide-react";
import { ConfirmForm } from "@/components/confirm-form";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { formatShortDate } from "@/lib/format";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/types";
import type { ProjectRecurrences, RecurrenceView } from "@/services/recurrences";
import {
  createRecurrenceAction,
  removeRecurrenceAction,
  setProjectStageAction,
  setProjectStatusAction,
  setRecurrenceActiveAction,
  updateRecurrenceAction,
} from "../actions";

/** A select that saves as soon as it changes, putting the old value back if saving fails. */
export function SaveOnChange({
  label,
  name,
  value,
  options,
  hidden,
  action,
}: {
  label: string;
  name: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  hidden: Record<string, string>;
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label={label}
        value={current}
        disabled={pending}
        className="h-8 w-44"
        onChange={(e) => {
          const next = e.target.value;
          const prev = current;
          setCurrent(next);
          const form = new FormData();
          for (const [k, v] of Object.entries(hidden)) form.set(k, v);
          form.set(name, next);
          start(async () => {
            const r = await action(idle, form);
            if (r.status === "error") {
              setCurrent(prev);
              setError(r.message);
            } else setError(null);
          });
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}

export function ProjectControls({ projectId, status, stageId, stages }: { projectId: string; status: string; stageId: string | null; stages: Array<{ id: string; name: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {stages.length ? (
        <SaveOnChange label="Stage" name="stageId" value={stageId ?? stages[0]!.id} hidden={{ projectId }} action={setProjectStageAction} options={stages.map((s) => ({ value: s.id, label: s.name }))} />
      ) : null}
      <SaveOnChange
        label="Status"
        name="status"
        value={status}
        hidden={{ projectId }}
        action={setProjectStatusAction}
        options={[
          { value: "planned", label: "Planned" },
          { value: "active", label: "Active" },
          { value: "on_hold", label: "On hold" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
        ]}
      />
    </div>
  );
}

const WEEKDAYS = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
] as const;
const PRIORITY_LABELS = TASK_PRIORITY_LABELS;

export function RecurrenceList({ projectId, data, today }: { projectId: string; data: ProjectRecurrences; today: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-3">
      {data.rules.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">Nothing repeats yet. Weekly checks and monthly reports belong here, so nobody has to remember to add them.</p>
      ) : null}
      <ul className="divide-y">
        {data.rules.map((r) =>
          editing === r.id && data.options ? (
            <li key={r.id} className="py-3">
              <RecurrenceForm rule={r} options={data.options} today={today} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <Repeat className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {r.title} {r.active ? null : <Badge tone="neutral">Paused</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.schedule}
                  {r.ownerName ? ` · ${r.ownerName}` : " · nobody yet"}
                  {r.endsOn ? ` · until ${formatShortDate(r.endsOn)}` : ""}
                </p>
              </div>
              {data.canManage ? (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(r.id)}>
                    Edit
                  </Button>
                  <ConfirmForm action={setRecurrenceActiveAction} fields={{ recurrenceId: r.id, active: r.active ? "false" : "true" }} label={r.active ? "Pause" : "Resume"} variant="ghost" showSuccess={false} />
                  <ConfirmForm
                    action={removeRecurrenceAction}
                    fields={{ recurrenceId: r.id }}
                    label="Remove"
                    variant="ghost"
                    confirm={`Stop "${r.title}" repeating? Open tasks it made that nobody has touched are removed too.`}
                    showSuccess={false}
                  />
                </div>
              ) : null}
            </li>
          ),
        )}
      </ul>
      {data.canManage && data.options && editing === null ? (
        adding ? (
          <RecurrenceForm projectId={projectId} options={data.options} today={today} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Repeat /> Add a recurring task
          </Button>
        )
      ) : null}
    </div>
  );
}

function RecurrenceForm({
  projectId,
  rule,
  options,
  today,
  onDone,
}: {
  projectId?: string;
  rule?: RecurrenceView;
  options: NonNullable<ProjectRecurrences["options"]>;
  today: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState(async (prev: ActionState, form: FormData) => {
    const next = await (rule ? updateRecurrenceAction : createRecurrenceAction)(prev, form);
    if (next.status === "ok") onDone();
    return next;
  }, idle);
  const [frequency, setFrequency] = useState(fieldDefault(state, "frequency", rule?.frequency ?? "weekly"));
  const p = (name: string) => `${rule?.id ?? "new"}-${name}`;
  const d = (name: string, initial: string) => fieldDefault(state, name, initial);
  const field = (name: string, initial: string) => ({ id: p(name), name, defaultValue: d(name, initial), ...invalidProps(state, name, p(name)) });

  return (
    <form action={action} className="space-y-4 rounded-md border bg-subtle/50 p-3" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      {rule ? <input type="hidden" name="recurrenceId" value={rule.id} /> : <input type="hidden" name="projectId" value={projectId} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Task" name="title" htmlFor={p("title")} state={state} className="sm:col-span-2">
          <Input {...field("title", rule?.title ?? "")} required maxLength={200} placeholder="e.g. Weekly ad check and budget pacing" />
        </Field>
        <Field label="Repeats" name="frequency" htmlFor={p("frequency")} state={state}>
          <Select id={p("frequency")} name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as "weekly" | "monthly")}>
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
          </Select>
        </Field>
        {frequency === "weekly" ? (
          <Field label="On" name="weekday" htmlFor={p("weekday")} state={state}>
            <Select {...field("weekday", String(rule?.weekday ?? 1))}>
              {WEEKDAYS.map(([n, label]) => (
                <option key={n} value={n}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="On" name="dayOfMonth" htmlFor={p("dayOfMonth")} state={state}>
            <Select {...field("dayOfMonth", String(rule?.dayOfMonth ?? 31))}>
              <option value="31">The last working day</option>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Day {n}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Owner" name="ownerId" htmlFor={p("ownerId")} state={state}>
          <Select {...field("ownerId", rule?.ownerId ?? "")}>
            <option value="">Nobody yet</option>
            {options.people.map((x) => (
              <option key={x.id} value={x.id}>
                {x.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reviewer" name="reviewerId" htmlFor={p("reviewerId")} state={state}>
          <Select {...field("reviewerId", rule?.reviewerId ?? "")}>
            <option value="">None</option>
            {options.people.map((x) => (
              <option key={x.id} value={x.id}>
                {x.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estimate (hours)" name="estimateHours" htmlFor={p("estimateHours")} state={state}>
          <Input {...field("estimateHours", rule?.estimateMinutes ? String(rule.estimateMinutes / 60) : "")} type="number" min="0" max="200" step="0.25" className="tabular" />
        </Field>
        <Field label="Starts this many working days before" name="leadWorkingDays" htmlFor={p("leadWorkingDays")} state={state} hint="Shown on My Day from then.">
          <Input {...field("leadWorkingDays", String(rule?.leadWorkingDays ?? 1))} type="number" min="0" max="10" className="tabular" />
        </Field>
        {options.stages.length ? (
          <Field label="Stage" name="stageId" htmlFor={p("stageId")} state={state}>
            <Select {...field("stageId", rule?.stageId ?? "")}>
              <option value="">No stage</option>
              {options.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {options.deliverables.length ? (
          <Field label="Counts as" name="deliverableId" htmlFor={p("deliverableId")} state={state} hint="Done tasks count towards this promise.">
            <Select {...field("deliverableId", rule?.deliverableId ?? "")}>
              <option value="">Nothing</option>
              {options.deliverables.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Priority" name="priority" htmlFor={p("priority")} state={state}>
          <Select {...field("priority", rule?.priority ?? "normal")}>
            {TASK_PRIORITIES.map((x) => (
              <option key={x} value={x}>
                {PRIORITY_LABELS[x]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" name="startsOn" htmlFor={p("startsOn")} state={state}>
          <Input {...field("startsOn", rule?.startsOn ?? today)} type="date" required />
        </Field>
        <Field label="Until" name="endsOn" htmlFor={p("endsOn")} state={state} hint="Leave empty to keep going.">
          <Input {...field("endsOn", rule?.endsOn ?? "")} type="date" />
        </Field>
      </div>
      {state.status === "error" ? <FormStatus state={state} /> : null}
      <div className="flex items-center gap-2">
        <SubmitButton size="sm" pendingLabel="Saving…">
          {rule ? "Save" : "Set up"}
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
