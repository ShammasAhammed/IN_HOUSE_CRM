"use client";

import { useActionState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { ConfirmForm } from "@/components/confirm-form";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { linkAdAccountAction, refreshAdsAction, unlinkAdAccountAction } from "./ad-actions";

export function LinkAdAccountForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState(linkAdAccountAction, idle);
  return (
    <form action={action} key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "link"} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <Field label="Meta ad account id" name="accountId" htmlFor="ad-account" state={state} hint="In Ads Manager, the number after act_ in the address (or under the account name).">
        <Input id="ad-account" name="accountId" inputMode="numeric" placeholder="act_1234567890" defaultValue={fieldDefault(state, "accountId", "")} className="h-9" {...invalidProps(state, "accountId", "ad-account")} />
      </Field>
      <div className="flex items-center gap-3">
        <SubmitButton size="sm" pendingLabel="Linking…">
          Link
        </SubmitButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function UnlinkAdAccount({ clientId }: { clientId: string }) {
  return <ConfirmForm action={unlinkAdAccountAction} fields={{ clientId }} confirm="Unlink this ad account from the client?" label="Unlink" pendingLabel="Unlinking…" variant="ghost" ariaLabel="Unlink the Meta ad account" />;
}

export function RefreshAds({ clientId, range }: { clientId: string; range: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => refreshAdsAction(clientId, range))}>
      <RefreshCw className={pending ? "animate-spin" : ""} /> {pending ? "Asking Meta…" : "Refresh"}
    </Button>
  );
}
