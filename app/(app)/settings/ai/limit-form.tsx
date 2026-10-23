"use client";

import { useActionState } from "react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Input } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { setAiLimitAction, setAssistantAiAction, setChatAiAction, setDailySummaryAction } from "../actions";

/** The monthly limit, typed in rupees. */
export function AiLimitForm({ rupees }: { rupees: string }) {
  const [state, action] = useActionState(setAiLimitAction, idle);
  return (
    <form action={action} key={state.status === "error" ? JSON.stringify(state.values ?? {}) : rupees} className="flex flex-wrap items-end gap-2">
      <Field label="Monthly limit (₹)" name="monthly" htmlFor="ai-monthly" state={state} hint="₹0 switches the AI off for the rest of the month.">
        <Input id="ai-monthly" name="monthly" inputMode="numeric" required defaultValue={fieldDefault(state, "monthly", rupees)} className="h-9 w-40" {...invalidProps(state, "monthly", "ai-monthly")} />
      </Field>
      <SubmitButton size="sm" pendingLabel="Saving…" className="mb-5">
        Save
      </SubmitButton>
      <FormStatus state={state} className="basis-full" />
    </form>
  );
}

/** The morning summary (or AI in chat), on or off. */
export function SummaryToggle({ on, of = "summary" }: { on: boolean; of?: "summary" | "chat" | "assistant" }) {
  const [state, action] = useActionState(of === "chat" ? setChatAiAction : of === "assistant" ? setAssistantAiAction : setDailySummaryAction, idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="on" value={on ? "" : "on"} />
      <span className="text-sm">{on ? "On" : "Off"}</span>
      <SubmitButton size="sm" variant={on ? "outline" : "default"} pendingLabel="Saving…">
        {on ? "Turn off" : "Turn on"}
      </SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}
