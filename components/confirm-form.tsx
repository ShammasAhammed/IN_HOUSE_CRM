"use client";

// A one-button form for actions that need a second thought (cancel leave, remove a holiday).
import { useActionState } from "react";
import { idle, type ActionState } from "@/lib/action-state";
import { FormStatus, SubmitButton } from "./form";
import type { Button } from "./ui/button";

export function ConfirmForm({
  action,
  fields,
  confirm,
  label,
  pendingLabel,
  variant = "outline",
  size = "sm",
  showSuccess = true,
  ariaLabel,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  confirm?: string;
  label: string;
  pendingLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  showSuccess?: boolean;
  /** The button's accessible name when its label repeats down a list ("Remove", "Mark removed"). */
  ariaLabel?: string;
}) {
  const [state, formAction] = useActionState(action, idle);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="space-y-2"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel} aria-label={ariaLabel}>
        {label}
      </SubmitButton>
      {state.status === "error" || (showSuccess && state.status === "ok") ? <FormStatus state={state} /> : null}
    </form>
  );
}
