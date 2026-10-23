"use client";

// HR slice 3 forms: intern record, end review, one-to-one, letter.
import { Checkbox } from "@/components/ui/choice";
import { useActionState } from "react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { HIRE_AGAIN, HIRE_AGAIN_LABELS, LETTER_KINDS, LETTER_KIND_LABELS, type LetterKind } from "@/lib/types";
import { addOneToOneAction, issueLetterAction, removeOneToOneAction, reviewInternAction, saveInternRecordAction, saveLetterTemplatesAction, withdrawLetterAction } from "./talent-actions";

type Option = { id: string; name: string };
const label = "block space-y-1 text-sm";
const hint = "text-xs text-muted-foreground";

export function InternRecordForm({ personId, record, people }: { personId: string; record: { batch: string; mentorId: string | null; plannedEndDate: string | null; focus: string | null } | null; people: Option[] }) {
  const [state, action] = useActionState(saveInternRecordAction, idle);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="personId" value={personId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          <span className={hint}>Batch</span>
          <Input name="batch" required maxLength={40} placeholder="e.g. Oct 2026" defaultValue={fieldDefault(state, "batch", record?.batch ?? "")} className="h-9" />
        </label>
        <label className={label}>
          <span className={hint}>Mentor</span>
          <Select name="mentorId" defaultValue={fieldDefault(state, "mentorId", record?.mentorId ?? "")} className="h-9">
            <option value="">Nobody yet</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
        <label className={label}>
          <span className={hint}>Planned last day</span>
          <Input name="plannedEndDate" type="date" defaultValue={fieldDefault(state, "plannedEndDate", record?.plannedEndDate ?? "")} className="h-9" />
        </label>
        <label className={label}>
          <span className={hint}>Here to learn and do</span>
          <Input name="focus" maxLength={500} defaultValue={fieldDefault(state, "focus", record?.focus ?? "")} className="h-9" />
        </label>
      </div>
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
      <SubmitButton size="sm" pendingLabel="Saving…">
        {record ? "Save" : "Start the record"}
      </SubmitButton>
    </form>
  );
}

export function InternReviewForm({ personId, record }: { personId: string; record: { strengths: string | null; workedOn: string | null; hireAgain: string | null; reviewNotes: string | null; inTalentPool: boolean } }) {
  const [state, action] = useActionState(reviewInternAction, idle);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="personId" value={personId} />
      <label className={label}>
        <span className={hint}>Strengths</span>
        <Textarea name="strengths" rows={2} maxLength={2000} defaultValue={fieldDefault(state, "strengths", record.strengths ?? "")} />
      </label>
      <label className={label}>
        <span className={hint}>What they worked on (goes on the certificate)</span>
        <Textarea name="workedOn" rows={3} maxLength={2000} defaultValue={fieldDefault(state, "workedOn", record.workedOn ?? "")} />
      </label>
      <label className={label}>
        <span className={hint}>Notes</span>
        <Textarea name="reviewNotes" rows={2} maxLength={2000} defaultValue={fieldDefault(state, "reviewNotes", record.reviewNotes ?? "")} />
      </label>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Hire again?
          <Select name="hireAgain" required defaultValue={fieldDefault(state, "hireAgain", record.hireAgain ?? "")} className="h-9 w-auto">
            <option value="" disabled>
              Choose…
            </option>
            {HIRE_AGAIN.map((h) => (
              <option key={h} value={h}>
                {HIRE_AGAIN_LABELS[h]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2">
          <Checkbox name="inTalentPool" defaultChecked={record.inTalentPool} className="size-4 accent-primary" /> Keep in the talent pool
        </label>
      </div>
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save review
      </SubmitButton>
    </form>
  );
}

export function OneToOneForm({ personId, today }: { personId: string; today: string }) {
  const [state, action] = useActionState(addOneToOneAction, idle);
  return (
    <form action={action} key={state.status === "ok" ? state.message + today : "new"} className="space-y-2">
      <input type="hidden" name="personId" value={personId} />
      <Input name="meetingDate" type="date" aria-label="Date" max={today} defaultValue={fieldDefault(state, "meetingDate", today)} className="h-9 w-auto" />
      <Textarea name="discussed" rows={2} aria-label="What you discussed" placeholder="What you discussed" required maxLength={4000} defaultValue={fieldDefault(state, "discussed", "")} />
      <Textarea name="agreed" rows={2} aria-label="What you agreed" placeholder="What you agreed (next steps)" maxLength={2000} defaultValue={fieldDefault(state, "agreed", "")} />
      {state.status === "error" ? <FormStatus state={state} /> : null}
      <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
        Note the one-to-one
      </SubmitButton>
    </form>
  );
}

export function RemoveOneToOne({ id }: { id: string }) {
  const [state, action] = useActionState(removeOneToOneAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs text-muted-foreground hover:text-foreground hover:underline" title={state.status === "error" ? state.message : undefined}>
        Remove
      </button>
    </form>
  );
}

export function IssueLetterForm({ personId, kind, title, body }: { personId: string; kind: LetterKind; title: string; body: string }) {
  const [state, action] = useActionState(issueLetterAction, idle);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="kind" value={kind} />
      <Input name="title" aria-label="Title" required maxLength={150} defaultValue={fieldDefault(state, "title", title)} className="h-10 font-medium" />
      <Textarea name="body" aria-label="Letter" rows={16} maxLength={20000} defaultValue={fieldDefault(state, "body", body)} />
      <p className={hint}>Check and edit the text. Once issued it gets a reference number and stays as it is.</p>
      {state.status === "error" ? <FormStatus state={state} /> : null}
      <SubmitButton pendingLabel="Issuing…">Issue {LETTER_KIND_LABELS[kind].toLowerCase()}</SubmitButton>
    </form>
  );
}

export function WithdrawLetter({ id }: { id: string }) {
  const [state, action] = useActionState(withdrawLetterAction, idle);
  return (
    <form action={action} onSubmit={(e) => (confirm("Withdraw this letter? It stays in the history.") ? undefined : e.preventDefault())}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs text-muted-foreground hover:text-foreground hover:underline" title={state.status === "error" ? state.message : undefined}>
        Withdraw
      </button>
    </form>
  );
}

export function LetterTemplatesForm({ templates }: { templates: Record<LetterKind, { title: string; body: string }> }) {
  const [state, action] = useActionState(saveLetterTemplatesAction, idle);
  return (
    <form action={action} className="space-y-6">
      <p className={hint}>
        Fill-ins: {"{{name}} {{job_title}} {{department}} {{join_date}} {{end_date}} {{today}} {{batch}} {{mentor}} {{worked_on}} {{company}}"}
      </p>
      {LETTER_KINDS.map((k) => (
        <fieldset key={k} className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-semibold">{LETTER_KIND_LABELS[k]}</legend>
          <Input name={`${k}.title`} aria-label={`${LETTER_KIND_LABELS[k]} title`} required maxLength={150} defaultValue={fieldDefault(state, `${k}.title`, templates[k].title)} className="h-9" />
          <Textarea name={`${k}.body`} aria-label={`${LETTER_KIND_LABELS[k]} text`} rows={8} maxLength={20000} defaultValue={fieldDefault(state, `${k}.body`, templates[k].body)} />
        </fieldset>
      ))}
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
      <SubmitButton pendingLabel="Saving…">Save templates</SubmitButton>
    </form>
  );
}
