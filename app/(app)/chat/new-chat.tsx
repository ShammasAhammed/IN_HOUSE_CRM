"use client";

// New message (one person or a small group) and, for the owner and strategists, a new team channel.
import { useActionState, useState } from "react";
import { Hash, MessageSquarePlus } from "lucide-react";
import { Field, FormStatus, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Input } from "@/components/ui/input";
import { idle } from "@/lib/action-state";
import { MAX_DIRECT_PEOPLE } from "@/services/rules/chat";
import { createTeamChannelAction, startDirectAction } from "./actions";

type Person = { id: string; name: string };

function PeoplePicker({ people, name }: { people: Person[]; name: string }) {
  const [q, setQ] = useState("");
  const shown = people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-2">
      <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" aria-label="Find a person" className="h-9" />
      <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border p-1">
        {people.map((p) => (
          <li key={p.id} hidden={!shown.includes(p)}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-hover">
              <Checkbox name={name} value={p.id} />
              {p.name}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NewChat({ people, canCreateTeam }: { people: Person[]; canCreateTeam: boolean }) {
  const [open, setOpen] = useState<"direct" | "team" | null>(null);
  const [directState, direct] = useActionState(startDirectAction, idle);
  const [teamState, team] = useActionState(createTeamChannelAction, idle);
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setOpen(open === "direct" ? null : "direct")} aria-expanded={open === "direct"}>
        <MessageSquarePlus /> New message
      </Button>
      {canCreateTeam ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(open === "team" ? null : "team")} aria-expanded={open === "team"}>
          <Hash /> New channel
        </Button>
      ) : null}
      {open === "direct" ? (
        <form action={direct} className="w-full space-y-3 rounded-lg border bg-card p-4">
          <p className="text-sm font-semibold">Write to one person, or up to {MAX_DIRECT_PEOPLE - 1} together</p>
          <PeoplePicker people={people} name="personIds" />
          <FormStatus state={directState} />
          <SubmitButton size="sm" pendingLabel="Opening…">
            Open chat
          </SubmitButton>
        </form>
      ) : null}
      {open === "team" ? (
        <form action={team} className="w-full space-y-3 rounded-lg border bg-card p-4">
          <Field label="Channel name" name="name" htmlFor="channel-name" state={teamState}>
            <Input id="channel-name" name="name" required maxLength={60} placeholder="Design" className="h-9" />
          </Field>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Who&apos;s in it</p>
            <PeoplePicker people={people} name="memberIds" />
          </div>
          <FormStatus state={teamState} />
          <SubmitButton size="sm" pendingLabel="Starting…">
            Start channel
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
