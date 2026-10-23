"use client";

// A team channel's settings, for its starter and the owner: name, who's in it, archive.
import { useActionState, useState } from "react";
import { Settings2, X } from "lucide-react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { idle } from "@/lib/action-state";
import { manageChannelAction } from "../actions";

type Member = { personId: string; fullName: string };

export function ChannelSettings({ channelId, name, archived, members, people }: { channelId: string; name: string; archived: boolean; members: Member[]; people: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(manageChannelAction, idle);
  const outside = people.filter((p) => !members.some((m) => m.personId === p.id));
  return (
    <div className="w-full sm:w-auto">
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Settings2 /> Channel settings
      </Button>
      {open ? (
        <div className="mt-3 w-full space-y-4 rounded-lg border bg-card p-4 sm:w-96">
          <form action={action} className="flex gap-2">
            <input type="hidden" name="channelId" value={channelId} />
            <input type="hidden" name="action" value="rename" />
            <Input name="name" defaultValue={name} required minLength={2} maxLength={60} aria-label="Channel name" className="h-9" />
            <SubmitButton size="sm" variant="outline">
              Rename
            </SubmitButton>
          </form>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">People</p>
            <ul className="space-y-1">
              {members.map((m) => (
                <li key={m.personId} className="flex items-center justify-between gap-2 text-sm">
                  {m.fullName}
                  <form action={action}>
                    <input type="hidden" name="channelId" value={channelId} />
                    <input type="hidden" name="action" value="remove" />
                    <input type="hidden" name="personId" value={m.personId} />
                    <button type="submit" aria-label={`Take ${m.fullName} out`} className="rounded p-1 text-muted-foreground hover:bg-hover hover:text-foreground">
                      <X className="size-3.5" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            {outside.length ? (
              <form action={action} className="flex gap-2 pt-1">
                <input type="hidden" name="channelId" value={channelId} />
                <input type="hidden" name="action" value="add" />
                <Select name="personId" aria-label="Person to add" className="h-9 min-w-0 flex-1" required defaultValue="">
                  <option value="" disabled>
                    Add someone…
                  </option>
                  {outside.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <SubmitButton size="sm" variant="outline">
                  Add
                </SubmitButton>
              </form>
            ) : null}
          </div>
          <form action={action}>
            <input type="hidden" name="channelId" value={channelId} />
            <input type="hidden" name="action" value={archived ? "unarchive" : "archive"} />
            <SubmitButton size="sm" variant="ghost">
              {archived ? "Bring back" : "Archive channel"}
            </SubmitButton>
          </form>
          <FormStatus state={state} />
        </div>
      ) : null}
    </div>
  );
}
