"use client";

import { useActionState } from "react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { AI_DRAFT_KIND_LABELS, AI_DRAFT_KINDS } from "@/lib/types";
import { decideDraftAction, requestDraftAction } from "./ai-actions";

export function RequestDraftForm({ taskId }: { taskId: string }) {
  const [state, action] = useActionState(requestDraftAction, idle);
  return (
    <form action={action} className="space-y-3" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <input type="hidden" name="taskId" value={taskId} />
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <Field label="Draft" name="kind" htmlFor="ai-kind" state={state}>
          <Select id="ai-kind" name="kind" defaultValue={fieldDefault(state, "kind", "caption")}>
            {AI_DRAFT_KINDS.map((k) => (
              <option key={k} value={k}>
                {AI_DRAFT_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Anything to add (optional)" name="instructions" htmlFor="ai-instructions" state={state}>
          <Input id="ai-instructions" name="instructions" maxLength={1000} placeholder="Mention the scholarship test on 2 Nov" defaultValue={fieldDefault(state, "instructions", "")} {...invalidProps(state, "instructions", "ai-instructions")} />
        </Field>
      </div>
      <FormStatus state={state} />
      <SubmitButton size="sm" pendingLabel="Writing the draft…">
        Ask the AI teammate
      </SubmitButton>
    </form>
  );
}

export function DecideDraftForm({ draftId, body }: { draftId: string; body: string }) {
  const [state, action] = useActionState(decideDraftAction, idle);
  return (
    <form action={action} className="space-y-2" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <input type="hidden" name="draftId" value={draftId} />
      <Field label="Edit before approving" name="body" htmlFor={`draft-${draftId}`} state={state}>
        <Textarea id={`draft-${draftId}`} name="body" rows={8} maxLength={20000} defaultValue={fieldDefault(state, "body", body)} {...invalidProps(state, "body", `draft-${draftId}`)} />
      </Field>
      <FormStatus state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" name="decision" value="approve" pendingLabel="Saving…">
          Approve
        </SubmitButton>
        <SubmitButton size="sm" variant="outline" name="decision" value="reject" pendingLabel="Saving…">
          Reject
        </SubmitButton>
      </div>
    </form>
  );
}
