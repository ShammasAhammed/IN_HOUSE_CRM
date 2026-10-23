"use client";

import { useActionState } from "react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Input, Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { commentAction, decideAction, requestAction } from "../actions";

export function DecideCreative({ assetId, versionId }: { assetId: string; versionId: string }) {
  const [state, action] = useActionState(decideAction, idle);
  const id = `n-${assetId}`;
  return (
    <form action={action} className="space-y-2" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="versionId" value={versionId} />
      <Field label="Note (needed when asking for changes)" name="note" htmlFor={id} state={state}>
        <Textarea id={id} name="note" rows={2} maxLength={2000} defaultValue={fieldDefault(state, "note", "")} {...invalidProps(state, "note", id)} />
      </Field>
      <FormStatus state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" name="decision" value="approve" pendingLabel="Saving…">
          Approve
        </SubmitButton>
        <SubmitButton size="sm" variant="outline" name="decision" value="changes" pendingLabel="Saving…">
          Ask for changes
        </SubmitButton>
      </div>
    </form>
  );
}

export function CommentCreative({ assetId, versionId }: { assetId: string; versionId: string }) {
  const [state, action] = useActionState(commentAction, idle);
  const id = `c-${assetId}`;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="versionId" value={versionId} />
      <Field label="Comment" name="body" htmlFor={id} state={state} className="min-w-48 flex-1">
        <Input id={id} name="body" maxLength={2000} defaultValue={fieldDefault(state, "body", "")} {...invalidProps(state, "body", id)} />
      </Field>
      <SubmitButton size="sm" variant="outline" pendingLabel="Sending…">
        Send
      </SubmitButton>
      <FormStatus state={state} className="basis-full" />
    </form>
  );
}

export function RequestForm() {
  const [state, action] = useActionState(requestAction, idle);
  return (
    <form action={action} className="space-y-3" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <Field label="What do you need?" name="title" htmlFor="r-title" state={state}>
        <Input id="r-title" name="title" maxLength={150} placeholder="Poster for the scholarship test" defaultValue={fieldDefault(state, "title", "")} {...invalidProps(state, "title", "r-title")} />
      </Field>
      <Field label="Details (optional)" name="details" htmlFor="r-details" state={state}>
        <Textarea id="r-details" name="details" rows={4} maxLength={3000} defaultValue={fieldDefault(state, "details", "")} />
      </Field>
      <Field label="Needed by (optional)" name="neededBy" htmlFor="r-date" state={state}>
        <Input id="r-date" name="neededBy" type="date" defaultValue={fieldDefault(state, "neededBy", "")} {...invalidProps(state, "neededBy", "r-date")} />
      </Field>
      <FormStatus state={state} />
      <SubmitButton pendingLabel="Sending…">Send request</SubmitButton>
    </form>
  );
}
