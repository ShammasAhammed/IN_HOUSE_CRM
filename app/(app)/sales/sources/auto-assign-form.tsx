"use client";

import { useActionState } from "react";
import { FormStatus, SubmitButton } from "@/components/form";
import { idle } from "@/lib/action-state";
import { setAutoAssignAction } from "../actions-settings";

export function AutoAssignForm({ on }: { on: boolean }) {
  const [state, action] = useActionState(setAutoAssignAction, idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="on" value={on ? "" : "on"} />
      <span className="text-sm">{on ? "On" : "Off"}</span>
      <SubmitButton size="sm" variant={on ? "outline" : "default"} pendingLabel="Saving…">
        {on ? "Turn off" : "Turn on"}
      </SubmitButton>
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
    </form>
  );
}
