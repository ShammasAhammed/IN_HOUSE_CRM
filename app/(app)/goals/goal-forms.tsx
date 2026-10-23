"use client";

// Company and team goals (Stage 14.3): setting a goal, checking in, archiving.
import { useActionState, useState } from "react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Input, Select } from "@/components/ui/input";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { GOAL_SOURCE_LABELS, GOAL_SOURCE_UNITS, GOAL_SOURCES, type GoalSource } from "@/lib/types";
import { archiveGoalAction, checkinAction, createGoalAction, updateGoalAction } from "./actions";

type Option = { id: string; name: string };
export type GoalFormInitial = { goalId: string; parentId: string | null; spaceId: string | null; title: string; description: string; unit: string; target: string; period: string; on: string; source: string; ownerId: string; leadersOnly: boolean; projectIds: string[] };

export function GoalForm({ initial, company, spaces, people, projects, canCompany, today }: { initial?: GoalFormInitial; company: Array<{ id: string; title: string }>; spaces: Option[]; people: Option[]; projects: Option[]; canCompany: boolean; today: string }) {
  const [state, action] = useActionState(initial ? updateGoalAction : createGoalAction, idle);
  const v = (k: string, d: string) => fieldDefault(state, k, d);
  const [parentId, setParentId] = useState(initial?.parentId ?? (canCompany ? "" : (company[0]?.id ?? "")));
  const [unit, setUnit] = useState(initial?.unit ?? "count");
  const sources = GOAL_SOURCES.filter((s) => s === "manual" || GOAL_SOURCE_UNITS[s as Exclude<GoalSource, "manual">] === unit);
  return (
    <form action={action} className="space-y-3">
      {initial ? <input type="hidden" name="goalId" value={initial.goalId} /> : null}
      {!initial ? (
        <div className="grid gap-2">
          <Select name="parentId" aria-label="Level" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            {canCompany ? <option value="">Company goal</option> : null}
            {company.map((c) => (
              <option key={c.id} value={c.id}>
                Team goal under: {c.title}
              </option>
            ))}
          </Select>
          {parentId ? (
            <Select name="spaceId" aria-label="Owned by a space" defaultValue={v("spaceId", "")}>
              <option value="">Owned by a person</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  Space: {s.name}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      ) : null}
      <Input name="title" aria-label="Goal" required maxLength={150} placeholder="₹50 lakh revenue this year" defaultValue={v("title", initial?.title ?? "")} />
      <Input name="description" aria-label="Description" maxLength={1000} placeholder="Why it matters (optional)" defaultValue={v("description", initial?.description ?? "")} />
      <div className="grid grid-cols-2 gap-2">
        <Select name="unit" aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="count">A count</option>
          <option value="money">Money (₹)</option>
          <option value="percent">A percent</option>
        </Select>
        <Input name="target" aria-label={unit === "money" ? "Target in rupees" : "Target"} required inputMode="decimal" placeholder={unit === "money" ? "50,00,000" : "60"} defaultValue={v("target", initial?.target ?? "")} />
        <Select name="period" aria-label="Period" defaultValue={v("period", initial?.period ?? "year")} className="col-span-2">
          <option value="year">Financial year (Apr–Mar)</option>
          <option value="quarter">Quarter</option>
          <option value="month">Month</option>
        </Select>
        <Input name="on" type="date" aria-label="A day in the period" required defaultValue={v("on", initial?.on ?? today)} />
        <Select name="source" aria-label="How it's measured" defaultValue={v("source", initial?.source ?? "manual")} className="sm:col-span-2">
          {sources.map((s) => (
            <option key={s} value={s}>
              {GOAL_SOURCE_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select name="ownerId" aria-label="Owner" defaultValue={v("ownerId", initial?.ownerId ?? "")}>
          <option value="">No owner</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      {!parentId ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="leadersOnly" defaultChecked={initial?.leadersOnly ?? false} /> Leaders only (owner and strategists)
        </label>
      ) : null}
      {parentId && projects.length ? (
        <fieldset className="space-y-1">
          <legend className="text-xs font-medium">Projects behind it (their tasks show as supporting progress)</legend>
          <div className="grid max-h-36 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
            {projects.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <Checkbox name="projectIds" value={p.id} defaultChecked={initial?.projectIds.includes(p.id)} /> <span className="truncate">{p.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
      <SubmitButton pendingLabel="Saving…">{initial ? "Save goal" : "Set goal"}</SubmitButton>
    </form>
  );
}

export function CheckinForm({ goalId, unit, live }: { goalId: string; unit: string; live: boolean }) {
  // A posted check-in clears the form (a new key); a refused one keeps what was typed.
  const [posted, setPosted] = useState(0);
  const [state, action] = useActionState(async (prev: ActionState, f: FormData) => {
    const r = await checkinAction(prev, f);
    if (r.status === "ok") setPosted((n) => n + 1);
    return r;
  }, idle);
  return (
    <form action={action} className="space-y-2" key={posted}>
      <input type="hidden" name="goalId" value={goalId} />
      <input type="hidden" name="unit" value={unit} />
      {live ? <p className="text-xs text-muted-foreground">The number is live; add a note on what changed and what&apos;s next.</p> : <Input name="value" aria-label={unit === "money" ? "Number now, in rupees" : "Number now"} inputMode="decimal" required placeholder={unit === "money" ? "Now, in ₹" : "Number now"} defaultValue={fieldDefault(state, "value", "")} />}
      <Input name="note" aria-label="Note" maxLength={500} placeholder="What changed, what's next" required={live} defaultValue={fieldDefault(state, "note", "")} />
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
      <SubmitButton size="sm" pendingLabel="Posting…">
        Post check-in
      </SubmitButton>
    </form>
  );
}

export function ArchiveGoal({ goalId }: { goalId: string }) {
  const [state, action] = useActionState(archiveGoalAction, idle);
  const [sure, setSure] = useState(false);
  if (!sure)
    return (
      <Button size="sm" variant="ghost" onClick={() => setSure(true)}>
        Archive goal
      </Button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="goalId" value={goalId} />
      Archive it? Its check-ins are kept.
      <SubmitButton size="sm" variant="destructive" pendingLabel="Archiving…">
        Archive
      </SubmitButton>
      <Button size="sm" variant="ghost" onClick={() => setSure(false)}>
        Keep
      </Button>
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  );
}
