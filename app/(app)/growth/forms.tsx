"use client";

// Skills and growth forms (plan/5): skills, requirements, levels, goals, learning.
import { useActionState } from "react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { LEARNING_KINDS, LEARNING_KIND_LABELS, LEARNING_STATUSES, LEARNING_STATUS_LABELS, SKILL_GROUPS, SKILL_GROUP_LABELS, SKILL_LEVEL_LABELS, type LearningStatus, type Role } from "@/lib/types";
import { addGoalAction, assignLearningAction, closeGoalAction, learningStatusAction, removeSkillAction, saveSkillAction, setLevelAction, setRequirementAction } from "./actions";

type Option = { id: string; name: string };
const label = "block space-y-1 text-sm";
const hint = "text-xs text-muted-foreground";
const LEVELS = [0, 1, 2, 3, 4, 5];

/** A one-button form: closing a goal, removing a skill. */
function Tiny({ run, fields, children }: { run: (s: ActionState, f: FormData) => Promise<ActionState>; fields: Record<string, string>; children: React.ReactNode }) {
  const [state, action] = useActionState(run, idle);
  return (
    <form action={action} className="inline">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className="text-xs text-muted-foreground hover:text-foreground hover:underline" title={state.status === "error" ? state.message : undefined}>
        {children}
      </button>
      {state.status === "error" ? <span className="ml-1 text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function SkillForm({ departments, skill }: { departments: Option[]; skill?: { id: string; name: string; group: string; description: string | null; departmentId: string | null } }) {
  const [state, action] = useActionState(saveSkillAction, idle);
  return (
    <form action={action} className="space-y-3">
      {skill ? <input type="hidden" name="skillId" value={skill.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          <span className={hint}>Skill</span>
          <Input name="name" required maxLength={80} placeholder="e.g. Meta lead campaigns" defaultValue={fieldDefault(state, "name", skill?.name ?? "")} className="h-9" />
        </label>
        <label className={label}>
          <span className={hint}>Kind</span>
          <Select name="group" defaultValue={fieldDefault(state, "group", skill?.group ?? "craft")} className="h-9">
            {SKILL_GROUPS.map((g) => (
              <option key={g} value={g}>
                {SKILL_GROUP_LABELS[g]}
              </option>
            ))}
          </Select>
        </label>
        <label className={label}>
          <span className={hint}>Department</span>
          <Select name="departmentId" defaultValue={fieldDefault(state, "departmentId", skill?.departmentId ?? "")} className="h-9">
            <option value="">Whole agency</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className={label}>
        <span className={hint}>What it looks like done well</span>
        <Input name="description" maxLength={500} defaultValue={fieldDefault(state, "description", skill?.description ?? "")} className="h-9" />
      </label>
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
      <SubmitButton size="sm" pendingLabel="Saving…">
        {skill ? "Save" : "Add skill"}
      </SubmitButton>
    </form>
  );
}

export function RemoveSkill({ skillId }: { skillId: string }) {
  return (
    <Tiny run={removeSkillAction} fields={{ skillId }}>
      Remove
    </Tiny>
  );
}

/** One cell of the matrix: the level a position needs; saves on change. */
export function RequirementCell({ role, skillId, level, disabled }: { role: Role; skillId: string; level: number | null; disabled: boolean }) {
  const [state, action] = useActionState(setRequirementAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="skillId" value={skillId} />
      <Select name="level" defaultValue={level === null ? "" : String(level)} disabled={disabled} aria-label="Level needed" className="h-8 w-16 tabular" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        <option value="">—</option>
        {LEVELS.slice(1).map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </Select>
      {state.status === "error" ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function LevelForm({ personId, skills }: { personId: string; skills: Array<{ id: string; name: string; current: number }> }) {
  const [state, action] = useActionState(setLevelAction, idle);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="personId" value={personId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          <span className={hint}>Skill</span>
          <Select name="skillId" required defaultValue={fieldDefault(state, "skillId", "")} className="h-9">
            <option value="" disabled>
              Choose…
            </option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (now {s.current})
              </option>
            ))}
          </Select>
        </label>
        <label className={label}>
          <span className={hint}>New level</span>
          <Select name="level" defaultValue={fieldDefault(state, "level", "1")} className="h-9">
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l} · {SKILL_LEVEL_LABELS[l]}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className={label}>
        <span className={hint}>Evidence (needed to move up): the work that showed it</span>
        <Input name="evidence" maxLength={1000} placeholder="e.g. Ran Zenith's October lead campaign alone, CPL under target" defaultValue={fieldDefault(state, "evidence", "")} className="h-9" />
      </label>
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
      <SubmitButton size="sm" pendingLabel="Saving…">
        Set level
      </SubmitButton>
    </form>
  );
}

export function GoalForm({ personId, skills }: { personId: string; skills: Option[] }) {
  const [state, action] = useActionState(addGoalAction, idle);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="personId" value={personId} />
      <label className={label}>
        <span className={hint}>Get better at</span>
        <Input name="title" required maxLength={150} defaultValue={fieldDefault(state, "title", "")} className="h-9" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          <span className={hint}>Skill</span>
          <Select name="skillId" defaultValue={fieldDefault(state, "skillId", "")} className="h-9">
            <option value="">None</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
        <label className={label}>
          <span className={hint}>To level</span>
          <Select name="targetLevel" defaultValue={fieldDefault(state, "targetLevel", "")} className="h-9">
            <option value="">—</option>
            {LEVELS.slice(1).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        <label className={label}>
          <span className={hint}>By</span>
          <Input name="dueDate" type="date" defaultValue={fieldDefault(state, "dueDate", "")} className="h-9" />
        </label>
      </div>
      <label className={label}>
        <span className={hint}>How (plan)</span>
        <Textarea name="plan" rows={2} maxLength={1000} defaultValue={fieldDefault(state, "plan", "")} />
      </label>
      <label className={label}>
        <span className={hint}>What will prove it</span>
        <Input name="proof" maxLength={500} defaultValue={fieldDefault(state, "proof", "")} className="h-9" />
      </label>
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
      <SubmitButton size="sm" pendingLabel="Saving…">
        Set goal
      </SubmitButton>
    </form>
  );
}

export function CloseGoal({ goalId, canMarkDone }: { goalId: string; canMarkDone: boolean }) {
  return (
    <span className="flex gap-3">
      {canMarkDone ? (
        <Tiny run={closeGoalAction} fields={{ goalId, status: "done" }}>
          Mark done
        </Tiny>
      ) : null}
      <Tiny run={closeGoalAction} fields={{ goalId, status: "dropped" }}>
        Drop
      </Tiny>
    </span>
  );
}

export function LearningForm({ personId, goals }: { personId: string; goals: Option[] }) {
  const [state, action] = useActionState(assignLearningAction, idle);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="personId" value={personId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          <span className={hint}>What</span>
          <Input name="title" required maxLength={150} defaultValue={fieldDefault(state, "title", "")} className="h-9" />
        </label>
        <label className={label}>
          <span className={hint}>Kind</span>
          <Select name="kind" defaultValue={fieldDefault(state, "kind", "course")} className="h-9">
            {LEARNING_KINDS.map((k) => (
              <option key={k} value={k}>
                {LEARNING_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </label>
        <label className={label}>
          <span className={hint}>Link</span>
          <Input name="url" type="url" maxLength={1000} placeholder="https://" defaultValue={fieldDefault(state, "url", "")} className="h-9" />
        </label>
        <label className={label}>
          <span className={hint}>For goal</span>
          <Select name="goalId" defaultValue={fieldDefault(state, "goalId", "")} className="h-9">
            <option value="">None</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </label>
        <label className={label}>
          <span className={hint}>Work time given (minutes)</span>
          <Input name="minutes" type="number" min={0} max={10000} defaultValue={fieldDefault(state, "minutes", "")} className="h-9 tabular" />
        </label>
        <label className={label}>
          <span className={hint}>Cost paid (₹)</span>
          <Input name="costRupees" type="number" min={0} step="1" defaultValue={fieldDefault(state, "costRupees", "")} className="h-9 tabular" />
        </label>
      </div>
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
      <SubmitButton size="sm" pendingLabel="Saving…">
        Assign
      </SubmitButton>
    </form>
  );
}

/** Progress on one learning item; "shown in work" only for coaches. */
export function LearningStatusSelect({ learningId, status, canCoach }: { learningId: string; status: LearningStatus; canCoach: boolean }) {
  const [state, action] = useActionState(learningStatusAction, idle);
  const options = LEARNING_STATUSES.filter((s) => canCoach || s !== "shown" || status === "shown");
  return (
    <form action={action}>
      <input type="hidden" name="learningId" value={learningId} />
      <Select name="status" defaultValue={status} aria-label="Progress" disabled={!canCoach && status === "shown"} className="h-8 w-auto" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {options.map((s) => (
          <option key={s} value={s}>
            {LEARNING_STATUS_LABELS[s]}
          </option>
        ))}
      </Select>
      {state.status === "error" ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}
