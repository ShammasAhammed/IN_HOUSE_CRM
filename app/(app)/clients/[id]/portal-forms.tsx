"use client";

import { useActionState } from "react";
import { ConfirmForm } from "@/components/confirm-form";
import { CopyButton } from "@/components/copy-button";
import { FormStatus, SubmitButton } from "@/components/form";
import { idle } from "@/lib/action-state";
import { inviteAction, revokePortalAction, type InviteState } from "./portal-actions";

export function InviteButton({ clientId, contactId, name }: { clientId: string; contactId: string; name: string }) {
  const [state, action] = useActionState<InviteState, FormData>(inviteAction, idle);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="contactId" value={contactId} />
      {state.status === "ok" ? null : (
        <SubmitButton size="sm" variant="outline" pendingLabel="Inviting…" aria-label={`Invite ${name} to the portal`}>
          Invite
        </SubmitButton>
      )}
      <FormStatus state={state} />
      {state.status === "ok" && state.link ? (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-subtle px-2 py-1 text-xs">{state.link}</code>
          <CopyButton text={state.link} label="Copy link" />
        </div>
      ) : null}
    </form>
  );
}

export function RevokeButton({ portalUserId, name }: { portalUserId: string; name: string }) {
  return <ConfirmForm action={revokePortalAction} fields={{ portalUserId }} label="Remove access" pendingLabel="Removing…" variant="ghost" ariaLabel={`Remove ${name}'s portal access`} />;
}
