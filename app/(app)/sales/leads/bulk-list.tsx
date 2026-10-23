"use client";

// The leads list with checkboxes and one change for all the ticked leads (Stage 10b).
import { Checkbox } from "@/components/ui/choice";
import { useActionState, useState } from "react";
import { LeadItem, type AiHint } from "@/components/lead-bits";
import { FormStatus, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { idle, type ActionState } from "@/lib/action-state";
import { LEAD_LOST_REASONS, LEAD_STAGES, LEAD_STAGE_LABELS } from "@/lib/types";
import type { LeadRow } from "@/repositories";
import { bulkLeadsAction } from "../lead-actions";
import { cn } from "@/lib/utils";

export function BulkLeadList({ leads, people, tags, hints = {} }: { leads: LeadRow[]; people: Array<{ id: string; fullName: string }>; tags: string[]; hints?: Record<string, AiHint> }) {
  const [ticked, setPicked] = useState<Set<string>>(new Set());
  // Only ticks on leads still in the list count: a filter or a change can take ticked leads out of view.
  const picked = new Set(leads.filter((l) => ticked.has(l.id)).map((l) => l.id));
  const [kind, setKind] = useState("stage");
  const [stage, setStage] = useState("contacted");
  const [state, action] = useActionState(async (prev: ActionState, form: FormData) => {
    const r = await bulkLeadsAction(prev, form);
    if (r.status === "ok") setPicked(new Set());
    return r;
  }, idle);
  const now = new Date();
  const all = picked.size === leads.length && leads.length > 0;
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  return (
    // Room under the last rows for the floating bulk bar (test report BUG-11: it no longer pushes rows down).
    <div className={cn("space-y-2", picked.size > 0 && "pb-28")}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <label className="flex items-center gap-2">
          <Checkbox className="size-4 accent-primary" checked={all} onChange={() => setPicked(all ? new Set() : new Set(leads.map((l) => l.id)))} />
          {picked.size ? `${picked.size} picked` : "Pick all"}
        </label>
        {picked.size ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
            Clear
          </Button>
        ) : null}
      </div>
      {picked.size ? (
        <form
          action={action}
          className="fixed inset-x-3 bottom-20 z-30 mx-auto flex max-w-3xl flex-wrap items-end gap-2 rounded-lg border bg-card p-3 shadow-lg md:right-6 md:bottom-6 md:left-[calc(232px+1.5rem)]"
        >
          {[...picked].map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <Select name="action" aria-label="Change" value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-auto">
            <option value="stage">Move to stage</option>
            <option value="owner">Assign to</option>
            <option value="tag_add">Add tag</option>
            <option value="tag_remove">Remove tag</option>
            <option value="follow_up">Set follow-up</option>
          </Select>
          {kind === "stage" ? (
            <>
              <Select name="stage" aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} className="h-9 w-auto">
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STAGE_LABELS[s]}
                  </option>
                ))}
              </Select>
              {stage === "lost" ? (
                <Select name="lostReason" aria-label="Why lost" required className="h-9 w-auto">
                  <option value="">Why lost…</option>
                  {LEAD_LOST_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              ) : null}
            </>
          ) : kind === "owner" ? (
            <Select name="ownerId" aria-label="Owner" className="h-9 w-auto">
              <option value="">Nobody</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          ) : kind === "follow_up" ? (
            <Input name="at" type="datetime-local" aria-label="Follow-up" className="h-9 w-auto" />
          ) : (
            <>
              <Input name="tag" list="known-tags" aria-label="Tag" required maxLength={30} placeholder="e.g. NEET" className="h-9 w-40" />
              <datalist id="known-tags">
                {tags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </>
          )}
          <SubmitButton size="sm" pendingLabel="Saving…">
            Apply to {picked.size}
          </SubmitButton>
          <FormStatus state={state} className="basis-full" />
        </form>
      ) : state.status === "ok" ? (
        <FormStatus state={state} />
      ) : null}
      <ul className="divide-y rounded-lg border bg-card shadow-card">
        {leads.map((l) => (
          <LeadItem
            key={l.id}
            lead={l}
            now={now}
            hint={hints[l.id]}
            select={<Checkbox aria-label={`Pick ${l.institution ?? l.name}`} className="size-4 accent-primary" checked={picked.has(l.id)} onChange={() => toggle(l.id)} />}
          />
        ))}
      </ul>
    </div>
  );
}
