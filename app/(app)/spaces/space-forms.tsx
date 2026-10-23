"use client";

import { useActionState } from "react";
import { ConfirmForm } from "@/components/confirm-form";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Input, Select } from "@/components/ui/input";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { addSuggestedAction, createSpaceAction, removeMemberAction, updateSpaceAction } from "./actions";

/** A tick box after an error shows what was sent (unticked boxes aren't sent at all). */
const checked = (state: ActionState, name: string, initial: boolean) => (state.status === "error" && state.values ? state.values[name] === "on" : initial);

export function NewSpaceForm({ kits = [] }: { kits?: Array<{ key: string; name: string; private: boolean }> }) {
  const [state, action] = useActionState(createSpaceAction, idle);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <Field label="Name" name="name" htmlFor="space-name" state={state} className="min-w-48 flex-1">
        <Input id="space-name" name="name" maxLength={60} placeholder="Legal" defaultValue={fieldDefault(state, "name", "")} {...invalidProps(state, "name", "space-name")} />
      </Field>
      <label className="flex h-9 items-center gap-2 text-sm">
        <input type="checkbox" name="isPrivate" defaultChecked={checked(state, "isPrivate", false)} className="accent-primary" /> Private
      </label>
      {kits.length ? (
        <Field label="Start with" name="kit" htmlFor="space-kit" state={state} className="min-w-48">
          <Select id="space-kit" name="kit" defaultValue={fieldDefault(state, "kit", "")}>
            <option value="">An empty space</option>
            {kits.map((k) => (
              <option key={k.key} value={k.key}>
                {k.name} kit{k.private ? " (private)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <SubmitButton size="sm" pendingLabel="Adding…">
        Add space
      </SubmitButton>
      <FormStatus state={state} className="basis-full" />
    </form>
  );
}

export function AddSuggested({ names }: { names: string[] }) {
  const [state, action] = useActionState(addSuggestedAction, idle);
  return (
    <form action={action} className="space-y-2">
      <p className="text-sm text-muted-foreground">Suggested to start: {names.join(", ")}. Founder office, Finance and HR start private.</p>
      <SubmitButton size="sm" variant="outline" pendingLabel="Adding…">
        Add the suggested spaces
      </SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}

export function EditSpaceForm({ space, owner }: { space: { id: string; name: string; isPrivate: boolean; isSensitive: boolean; isSelf: boolean; archived: boolean }; owner: boolean }) {
  const [state, action] = useActionState(updateSpaceAction, idle);
  const id = `s-${space.id}`;
  return (
    <form action={action} className="space-y-3" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <input type="hidden" name="spaceId" value={space.id} />
      <Field label="Name" name="name" htmlFor={`${id}-name`} state={state}>
        <Input id={`${id}-name`} name="name" maxLength={60} defaultValue={fieldDefault(state, "name", space.name)} {...invalidProps(state, "name", `${id}-name`)} />
      </Field>
      <div className="flex flex-wrap gap-4 text-sm">
        {owner ? (
          <>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isPrivate" defaultChecked={checked(state, "isPrivate", space.isPrivate)} className="accent-primary" /> Private: only members and the owner see it
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isSensitive" defaultChecked={checked(state, "isSensitive", space.isSensitive)} className="accent-primary" /> Sensitive: access needs both the owner and HR
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isSelf" defaultChecked={checked(state, "isSelf", space.isSelf)} className="accent-primary" /> Oppllo&apos;s own marketing: results and a monthly self-report like a client (one space only)
            </label>
          </>
        ) : (
          <>
            {/* Managers rename and archive; privacy stays as it is (the owner's choice). */}
            {space.isPrivate ? <input type="hidden" name="isPrivate" value="on" /> : null}
            {space.isSensitive ? <input type="hidden" name="isSensitive" value="on" /> : null}
            {space.isSelf ? <input type="hidden" name="isSelf" value="on" /> : null}
          </>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" name="archived" defaultChecked={checked(state, "archived", space.archived)} className="accent-primary" /> Archived
        </label>
      </div>
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save
      </SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}

export function RemoveMember({ spaceId, personId, name }: { spaceId: string; personId: string; name: string }) {
  return <ConfirmForm action={removeMemberAction} fields={{ spaceId, personId }} label="Remove" pendingLabel="Removing…" variant="ghost" showSuccess={false} ariaLabel={`Remove ${name}`} />;
}
