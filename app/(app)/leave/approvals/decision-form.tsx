"use client";

import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idle } from "@/lib/action-state";
import { decideLeaveAction, revokeLeaveAction } from "../actions";

export function DecisionForm({ requestId, kind }: { requestId: string; kind: "leave" | "cut_short" }) {
  const [state, action] = useActionState(decideLeaveAction, idle);
  if (state.status === "ok") return <FormStatus state={state} />;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="kind" value={kind} />
      <Input name="note" placeholder="Note to them (optional)" maxLength={500} className="h-8" />
      <div className="flex gap-2">
        <SubmitButton name="decision" value="approve" size="sm">
          <Check /> {kind === "cut_short" ? "End it early" : "Approve"}
        </SubmitButton>
        <SubmitButton name="decision" value="reject" size="sm" variant="outline">
          <X /> {kind === "cut_short" ? "Keep as planned" : "Decline"}
        </SubmitButton>
      </div>
      <FormStatus state={state} />
    </form>
  );
}

export function RevokeForm({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(revokeLeaveAction, idle);
  if (state.status === "ok") return <FormStatus state={state} />;
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Revoke
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <Input name="note" placeholder="Why? They will see this." required minLength={3} maxLength={500} className="h-8" />
      <div className="flex gap-2">
        <SubmitButton size="sm" variant="destructive">
          Revoke leave
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
      <FormStatus state={state} />
    </form>
  );
}
