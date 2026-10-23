"use client";

import { useActionState } from "react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import type { ChecklistKind } from "@/lib/types";
import { setChecklistTemplateAction } from "../actions";

export function TemplateForm({ kind, items }: { kind: ChecklistKind; items: string[] }) {
  const [state, action] = useActionState(setChecklistTemplateAction, idle);
  const id = `template-${kind}`;
  return (
    <form action={action} className="space-y-3 rounded-lg border bg-card p-4 shadow-card" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : items.join("|")}>
      <input type="hidden" name="kind" value={kind} />
      <Field
        label={kind === "joining" ? "When someone joins" : "When someone leaves"}
        name="items"
        htmlFor={id}
        state={state}
        hint={kind === "exit" ? "One step per line. Access, clients and open tasks are added on top of these for each person." : "One step per line."}
      >
        <Textarea id={id} name="items" rows={12} defaultValue={fieldDefault(state, "items", items.join("\n"))} {...invalidProps(state, "items", id)} />
      </Field>
      <FormStatus state={state} />
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
