"use client";

// Form pieces shared by every screen: labelled fields with their errors, a status line, a pending-aware button.
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Label } from "./ui/input";

export function Field({
  label,
  name,
  htmlFor,
  state,
  hint,
  children,
  className,
}: {
  label: string;
  name: string;
  /** The input's id when it isn't just the field name (several forms on one page). */
  htmlFor?: string;
  state?: ActionState;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const errors = state?.status === "error" ? state.fieldErrors?.[name] : undefined;
  const id = htmlFor ?? name;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {errors?.length ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {errors[0]}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Mark an input invalid when its field has an error. Pass the input's id when it isn't the field name. */
export const invalidProps = (state: ActionState | undefined, name: string, id: string = name) =>
  state?.status === "error" && state.fieldErrors?.[name] ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {};

export function FormStatus({ state, className }: { state: ActionState; className?: string }) {
  if (state.status === "idle") return null;
  const ok = state.status === "ok";
  return (
    <p
      role={ok ? "status" : "alert"}
      className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-sm", ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger", className)}
    >
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" />}
      {state.message}
    </p>
  );
}

export function SubmitButton({ children, pendingLabel, disabled, ...props }: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  // `disabled` is taken out of props so it can never override "pending" and allow a double submit.
  return (
    <Button type="submit" {...props} disabled={pending || disabled}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
