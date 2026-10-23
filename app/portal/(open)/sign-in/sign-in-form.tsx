"use client";

import { useActionState } from "react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Input } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { requestLinkAction } from "../../actions";

export function EmailLinkForm() {
  const [state, action] = useActionState(requestLinkAction, idle);
  return (
    <form action={action} className="space-y-3">
      <Field label="Your email" name="email" htmlFor="p-email" state={state}>
        <Input id="p-email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={fieldDefault(state, "email", "")} {...invalidProps(state, "email", "p-email")} />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Sending…">
        Email me a sign-in link
      </SubmitButton>
      <FormStatus state={state} className="break-all" />
    </form>
  );
}
