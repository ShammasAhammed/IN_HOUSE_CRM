"use client";

// Working a lead in Oppllo One (Stage 10a.6): stage, owner, follow-up, notes, details, and new leads.
import { Checkbox } from "@/components/ui/choice";
import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { LEAD_LOST_REASONS, LEAD_SCORES, LEAD_STAGES, LEAD_STAGE_LABELS, type LeadStage } from "@/lib/types";
import { createLeadAction, goLiveAction, leadFollowUpAction, leadNoteAction, leadOwnerAction, leadStageAction, leadTagsAction, leadUpdateAction } from "./lead-actions";

const keyOf = (s: ActionState, saved: string) => (s.status === "error" ? JSON.stringify(s.values ?? {}) : saved);
const SOURCES = ["Landing page", "WhatsApp", "Phone call", "Referral", "Meta lead form", "Google lead form", "Walk-in", "Other"];

export function StageForm({ leadId, stage, lostReason }: { leadId: string; stage: LeadStage; lostReason: string | null }) {
  const [state, action] = useActionState(leadStageAction, idle);
  const [next, setNext] = useState<string>(fieldDefault(state, "stage", stage));
  return (
    <form action={action} key={keyOf(state, stage)} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Stage" name="stage" htmlFor="lead-stage" state={state}>
          <Select id="lead-stage" name="stage" defaultValue={stage} onChange={(e) => setNext(e.target.value)} className="h-9">
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STAGE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        {next === "lost" ? (
          <Field label="Why lost" name="lostReason" htmlFor="lead-lost" state={state}>
            <Select id="lead-lost" name="lostReason" required defaultValue={fieldDefault(state, "lostReason", lostReason ?? "")} className="h-9" {...invalidProps(state, "lostReason", "lead-lost")}>
              <option value="">Pick one…</option>
              {LEAD_LOST_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        <SubmitButton size="sm" pendingLabel="Saving…" className="mb-5">
          Change
        </SubmitButton>
      </div>
      <FormStatus state={state} />
    </form>
  );
}

export function OwnerForm({ leadId, ownerId, people }: { leadId: string; ownerId: string | null; people: Array<{ id: string; fullName: string }> }) {
  const [state, action] = useActionState(leadOwnerAction, idle);
  return (
    <form action={action} key={keyOf(state, ownerId ?? "")} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Owner" name="ownerId" htmlFor="lead-owner" state={state}>
          <Select id="lead-owner" name="ownerId" defaultValue={ownerId ?? ""} className="h-9">
            <option value="">Nobody yet</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton size="sm" variant="outline" pendingLabel="Saving…" className="mb-5">
          Assign
        </SubmitButton>
      </div>
      <FormStatus state={state} />
    </form>
  );
}

/** `current` is the follow-up as "2026-10-16T10:30" in India time, or "". */
export function FollowUpForm({ leadId, current }: { leadId: string; current: string }) {
  const [state, action] = useActionState(leadFollowUpAction, idle);
  return (
    <form action={action} key={keyOf(state, current)} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Next follow-up" name="at" htmlFor="lead-follow" state={state}>
          <Input id="lead-follow" name="at" type="datetime-local" defaultValue={fieldDefault(state, "at", current)} className="h-9" {...invalidProps(state, "at", "lead-follow")} />
        </Field>
        <SubmitButton size="sm" variant="outline" pendingLabel="Saving…" className="mb-5">
          Save
        </SubmitButton>
      </div>
      <FormStatus state={state} />
    </form>
  );
}

export function NoteForm({ leadId }: { leadId: string }) {
  const [state, action] = useActionState(leadNoteAction, idle);
  return (
    <form action={action} key={keyOf(state, "note")} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      <Textarea name="text" aria-label="Note" rows={2} required maxLength={5000} placeholder="What happened on the call? What's next?" defaultValue={fieldDefault(state, "text", "")} />
      <div className="flex items-center gap-3">
        <SubmitButton size="sm" pendingLabel="Saving…">
          Add note
        </SubmitButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

type Details = { name: string; phone: string | null; email: string | null; institution: string | null; contactRole: string | null; district: string | null; segment: string | null; channel: string | null; score: string | null; problem: string | null };

function DetailFields({ state, d, prefix }: { state: ActionState; d: Partial<Details>; prefix: string }) {
  const f = (name: keyof Details) => fieldDefault(state, name, (d[name] as string | null | undefined) ?? "");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Contact name" name="name" htmlFor={`${prefix}-name`} state={state}>
        <Input id={`${prefix}-name`} name="name" required maxLength={200} defaultValue={f("name")} className="h-9" {...invalidProps(state, "name", `${prefix}-name`)} />
      </Field>
      <Field label="Phone / WhatsApp" name="phone" htmlFor={`${prefix}-phone`} state={state}>
        <Input id={`${prefix}-phone`} name="phone" inputMode="tel" placeholder="+91…" defaultValue={f("phone")} className="h-9" />
      </Field>
      <Field label="Institution" name="institution" htmlFor={`${prefix}-inst`} state={state}>
        <Input id={`${prefix}-inst`} name="institution" defaultValue={f("institution")} className="h-9" />
      </Field>
      <Field label="Their role" name="contactRole" htmlFor={`${prefix}-role`} state={state}>
        <Input id={`${prefix}-role`} name="contactRole" placeholder="Owner, Director…" defaultValue={f("contactRole")} className="h-9" />
      </Field>
      <Field label="District" name="district" htmlFor={`${prefix}-district`} state={state}>
        <Input id={`${prefix}-district`} name="district" defaultValue={f("district")} className="h-9" />
      </Field>
      <Field label="Email" name="email" htmlFor={`${prefix}-email`} state={state}>
        <Input id={`${prefix}-email`} name="email" type="email" defaultValue={f("email")} className="h-9" {...invalidProps(state, "email", `${prefix}-email`)} />
      </Field>
      <Field label="Source" name="channel" htmlFor={`${prefix}-channel`} state={state}>
        <Select id={`${prefix}-channel`} name="channel" defaultValue={f("channel")} className="h-9">
          <option value="">—</option>
          {SOURCES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </Field>
      <Field label="Score" name="score" htmlFor={`${prefix}-score`} state={state}>
        <Select id={`${prefix}-score`} name="score" defaultValue={f("score")} className="h-9">
          <option value="">—</option>
          {LEAD_SCORES.map((s) => (
            <option key={s} value={s}>
              {s[0]!.toUpperCase() + s.slice(1)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Type of institution" name="segment" htmlFor={`${prefix}-segment`} state={state}>
        <Input id={`${prefix}-segment`} name="segment" placeholder="College, school, coaching…" defaultValue={f("segment")} className="h-9" />
      </Field>
      <Field label="What they need" name="problem" htmlFor={`${prefix}-problem`} state={state} className="sm:col-span-2">
        <Textarea id={`${prefix}-problem`} name="problem" rows={2} maxLength={1000} defaultValue={f("problem")} />
      </Field>
    </div>
  );
}

export function EditLeadForm({ leadId, details }: { leadId: string; details: Details }) {
  const [state, action] = useActionState(leadUpdateAction, idle);
  return (
    <details className="rounded-lg border bg-card shadow-card">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">Edit details</summary>
      <form action={action} key={keyOf(state, JSON.stringify(details))} className="space-y-3 border-t p-4">
        <input type="hidden" name="leadId" value={leadId} />
        <DetailFields state={state} d={details} prefix="edit-lead" />
        <div className="flex items-center gap-3">
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save
          </SubmitButton>
          <FormStatus state={state} />
        </div>
      </form>
    </details>
  );
}

export function NewLeadForm() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createLeadAction, idle);
  if (!open)
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> New lead
      </Button>
    );
  return (
    <form action={action} key={keyOf(state, "new")} className="w-full space-y-3 rounded-lg border bg-card p-4 shadow-card">
      <h2 className="text-sm font-semibold">New lead</h2>
      <DetailFields state={state} d={{}} prefix="new-lead" />
      {state.status === "error" ? <FormStatus state={state} /> : null}
      {state.status === "error" && state.message?.startsWith("Already in Oppllo") ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="allowDuplicate" className="size-4 accent-primary" /> Add anyway (it&apos;s a different lead)
        </label>
      ) : null}
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save lead
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function GoLiveForm() {
  const [state, action] = useActionState(goLiveAction, idle);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Switch Sales to Oppllo One now? From now on leads are worked here, and the morning copy only adds leads that still reach the CRM. Do this on switch day, after pointing the lead sources here and the final copy.")) e.preventDefault();
      }}
      className="space-y-2"
    >
      <SubmitButton size="sm" variant="outline" pendingLabel="Switching…">
        Switch Sales to Oppllo One
      </SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}

/** Tags as one comma-separated box; known tags are suggested. */
export function TagsForm({ leadId, tags, known }: { leadId: string; tags: string[]; known: string[] }) {
  const [state, action] = useActionState(leadTagsAction, idle);
  return (
    <form action={action} key={keyOf(state, tags.join(","))} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Tags (comma between)" name="tags" htmlFor="lead-tags" state={state} className="min-w-0 flex-1">
          <Input id="lead-tags" name="tags" list="lead-known-tags" placeholder="NEET, Malappuram, Referral" defaultValue={fieldDefault(state, "tags", tags.join(", "))} className="h-9" {...invalidProps(state, "tags", "lead-tags")} />
        </Field>
        <datalist id="lead-known-tags">
          {known.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <SubmitButton size="sm" variant="outline" pendingLabel="Saving…" className="mb-5">
          Save tags
        </SubmitButton>
      </div>
      <FormStatus state={state} />
    </form>
  );
}
