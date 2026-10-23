"use client";

// Meetings library (Stage 13.4): a new meeting, approving an action item, the next meeting of a series.
import { useActionState, useState } from "react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Checkbox } from "@/components/ui/choice";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { MEETING_KIND_LABELS, MEETING_KINDS } from "@/lib/types";
import { approveItemAction, createMeetingAction, meetingAiAction, nextMeetingAction } from "./actions";

type Option = { id: string; name: string };

export function NewMeetingForm({ clients, people, clientId, today }: { clients: Option[]; people: Option[]; clientId: string; today: string }) {
  const [state, action] = useActionState(createMeetingAction, idle);
  return (
    <form action={action} className="space-y-3">
      <Input name="title" aria-label="Meeting name" placeholder="Meeting name, e.g. Zenith weekly call" required maxLength={150} defaultValue={fieldDefault(state, "title", "")} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Select name="clientId" aria-label="Client or space" defaultValue={fieldDefault(state, "clientId", clientId)}>
          <option value="">Team meeting: everyone sees it</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="kind" aria-label="Kind" defaultValue={fieldDefault(state, "kind", "client_call")}>
          {MEETING_KINDS.map((k) => (
            <option key={k} value={k}>
              {MEETING_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <Input name="meetingDate" type="date" aria-label="Date" required defaultValue={fieldDefault(state, "meetingDate", today)} />
        <Input name="startTime" type="time" aria-label="Start time" defaultValue={fieldDefault(state, "startTime", "")} />
        <Select name="repeat" aria-label="Repeats" defaultValue={fieldDefault(state, "repeat", "none")}>
          <option value="none">Doesn&apos;t repeat</option>
          <option value="weekly">Every week (next page made with open items)</option>
          <option value="monthly">Every month (next page made with open items)</option>
        </Select>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium">Attendees</legend>
        <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <Checkbox name="attendees" value={p.id} /> {p.name}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">The page opens with Attendees, Agenda, Notes, Decisions and Action items. Write an action item as &quot;@Name what by Friday&quot; and Approve turns it into a task.</p>
      {state.status === "error" ? <FormStatus state={state} /> : null}
      <SubmitButton pendingLabel="Creating…">Create meeting</SubmitButton>
    </form>
  );
}

export function ApproveItem({ meetingId, itemKey, projects, projectId }: { meetingId: string; itemKey: string; projects: Option[]; projectId: string | null }) {
  const [state, action] = useActionState(approveItemAction, idle);
  if (!projects.length) return <p className="text-xs text-muted-foreground">Start a project here to turn items into tasks.</p>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="itemKey" value={itemKey} />
      <Select name="projectId" aria-label="Project" defaultValue={projectId ?? projects[0]!.id} className="h-8 w-auto max-w-full text-xs">
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <SubmitButton size="sm" pendingLabel="Making…">
        Approve
      </SubmitButton>
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
    </form>
  );
}

export function NextMeeting({ meetingId, label }: { meetingId: string; label: string }) {
  const [state, action] = useActionState(nextMeetingAction, idle);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="meetingId" value={meetingId} />
      <SubmitButton size="sm" variant="outline" pendingLabel="Making…">
        {label}
      </SubmitButton>
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  );
}

/** AI help on a meeting page; says "the AI isn't switched on yet" until the owner adds a key. */
export function MeetingAi({ meetingId }: { meetingId: string }) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  async function go(kind: "summary" | "actions" | "transcript") {
    setBusy(true);
    const r = await meetingAiAction({ meetingId, kind, transcript: transcript ?? "" });
    setBusy(false);
    setOut(r.ok ? { ok: true, text: r.text } : { ok: false, text: r.message });
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">AI help</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void go("summary")}>
          Summary
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void go("actions")}>
          Find action items
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setTranscript(transcript === null ? "" : null)}>
          From a transcript
        </Button>
      </div>
      {transcript !== null ? (
        <div className="space-y-2">
          <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={4} aria-label="Transcript" placeholder="Paste the transcript. Needs everyone's recording consent on record." maxLength={60000} />
          <Button type="button" size="sm" disabled={busy || transcript.trim().length < 20} onClick={() => void go("transcript")}>
            Make notes
          </Button>
        </div>
      ) : null}
      {busy ? <p className="text-xs text-muted-foreground">Asking the AI…</p> : null}
      {out ? (
        out.ok ? (
          <div className="space-y-1 rounded-md border bg-subtle p-2">
            <pre className="text-xs whitespace-pre-wrap">{out.text}</pre>
            <CopyButton text={out.text} label="Copy to paste into the page" />
          </div>
        ) : (
          <p role="alert" className="text-xs text-muted-foreground">
            {out.text}
          </p>
        )
      ) : null}
    </div>
  );
}
