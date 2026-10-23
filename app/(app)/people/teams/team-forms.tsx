"use client";

import { useActionState, useState } from "react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import type { DepartmentRecord } from "@/repositories";
import { removeTeamAction, saveTeamAction } from "../actions";

/** One team (or a new one): its name and head. An empty team can be removed. */
export function TeamForm({ team, people, members, canEdit }: { team: DepartmentRecord | null; people: Array<{ id: string; name: string }>; members: number; canEdit: boolean }) {
  const [state, action] = useActionState(saveTeamAction, idle);
  const [removed, remove] = useActionState(removeTeamAction, idle);
  const [confirming, setConfirming] = useState(false);
  const p = team ? team.id : "new";
  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      {team ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {members} {members === 1 ? "person" : "people"}
        </p>
      ) : (
        <h2 className="mb-3 text-sm font-semibold">Add a team</h2>
      )}
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        {team ? <input type="hidden" name="departmentId" value={team.id} /> : null}
        <Field label="Name" name="name" htmlFor={`${p}-name`} state={state}>
          <Input id={`${p}-name`} name="name" required maxLength={60} disabled={!canEdit} defaultValue={fieldDefault(state, "name", team?.name ?? "")} placeholder="e.g. Design" {...invalidProps(state, "name", `${p}-name`)} />
        </Field>
        <Field label="Head" name="headPersonId" htmlFor={`${p}-head`} state={state}>
          <Select id={`${p}-head`} name="headPersonId" disabled={!canEdit} defaultValue={fieldDefault(state, "headPersonId", team?.headPersonId ?? "")}>
            <option value="">Nobody yet</option>
            {people.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        {canEdit ? (
          <SubmitButton size="sm" pendingLabel="Saving…">
            {team ? "Save" : "Add team"}
          </SubmitButton>
        ) : null}
      </form>
      <FormStatus state={state} className="mt-2" />
      {team && canEdit && members === 0 ? (
        // Asks first, in the page (QA S5-B2): "Remove team X?" with Remove / Keep it.
        confirming ? (
          <form action={remove} className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-subtle px-3 py-2 text-sm">
            <input type="hidden" name="departmentId" value={team.id} />
            <span>Remove team {team.name}?</span>
            <SubmitButton size="sm" variant="outline" pendingLabel="Removing…">
              Remove
            </SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <FormStatus state={removed} className="basis-full" />
          </form>
        ) : (
          <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setConfirming(true)}>
            Remove team
          </Button>
        )
      ) : null}
    </div>
  );
}
