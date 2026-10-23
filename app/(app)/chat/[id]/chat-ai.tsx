"use client";

// AI in chat (Stage 12.2): what only the asker sees. A catch-up summary, and proposed tasks that become real tasks
// only when approved here (through the ordinary task rules); dismissing just drops one.
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { formatRupees } from "@/lib/format";
import type { CatchUp, TaskSuggestions } from "@/services/chat-ai";
import type { Proposal } from "@/services/rules/chat-ai";
import { approveProposalAction } from "../actions";

export type AiPanelState = { kind: "catchup" | "private"; loading: boolean; result?: CatchUp } | { kind: "tasks"; loading: boolean; result?: TaskSuggestions };

export function AiPanel({ panel, onClose }: { panel: AiPanelState; onClose: () => void }) {
  const cost = panel.result?.costPaise;
  return (
    <section aria-label={panel.kind === "catchup" ? "Catch me up" : panel.kind === "private" ? "AI answer for you" : "Suggested tasks"} className="mb-3 rounded-lg border bg-card p-3 shadow-card">
      <header className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">{panel.kind === "catchup" ? "Catch me up" : panel.kind === "private" ? "@AI, for you only" : "Suggested tasks"}</h2>
        <span className="text-xs text-muted-foreground">Only you see this{cost !== null && cost !== undefined ? ` · ${formatRupees(cost)}` : ""}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded p-1 text-muted-foreground hover:bg-hover hover:text-foreground">
          <X className="size-4" />
        </button>
      </header>
      {panel.loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> The AI is reading the chat…
        </p>
      ) : panel.kind !== "tasks" && panel.result ? (
        <p className="text-sm whitespace-pre-wrap">{panel.result.text}</p>
      ) : panel.kind === "tasks" && panel.result ? (
        <Proposals s={panel.result} />
      ) : null}
    </section>
  );
}

function Proposals({ s }: { s: TaskSuggestions }) {
  if (!s.proposals.length) return <p className="text-sm text-muted-foreground">The AI found no clear piece of work to turn into a task.</p>;
  if (!s.projects.length) return <p className="text-sm text-muted-foreground">There&apos;s no active project you can add tasks to here, so these can&apos;t be created yet.</p>;
  return (
    <>
      <p className="mb-2 text-xs text-muted-foreground">Nothing is created until you approve. Check the details first.</p>
      <ul className="space-y-2">
        {s.proposals.map((p, i) => (
          <ProposalCard key={`${i}-${p.title}`} p={p} s={s} />
        ))}
      </ul>
    </>
  );
}

function ProposalCard({ p, s }: { p: Proposal; s: TaskSuggestions }) {
  const [title, setTitle] = useState(p.title);
  const [ownerId, setOwnerId] = useState(p.ownerId ?? "");
  const [dueDate, setDueDate] = useState(p.dueDate ?? "");
  const [projectId, setProjectId] = useState(s.defaultProjectId ?? "");
  const [state, setState] = useState<{ kind: "idle" | "saving" | "dismissed" } | { kind: "created"; id: string } | { kind: "error"; message: string }>({ kind: "idle" });
  if (state.kind === "dismissed") return null;
  if (state.kind === "created")
    return (
      <li className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
        <Check className="size-4" /> Task created.
        <Link href={`/tasks/${state.id}` as Route} className="font-medium underline">
          Open it
        </Link>
      </li>
    );
  const approve = async () => {
    setState({ kind: "saving" });
    const r = await approveProposalAction({ projectId, title, ownerId, dueDate });
    setState(r.ok ? { kind: "created", id: r.value.id } : { kind: "error", message: r.message });
  };
  return (
    <li className="space-y-2 rounded-md border p-2.5">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task title" className="h-9 font-medium" />
      {p.note ? <p className="text-xs text-muted-foreground">{p.note}</p> : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project" className="h-9">
          <option value="">Pick a project…</option>
          {s.projects.map((pr) => (
            <option key={pr.id} value={pr.id}>
              {pr.clientName} · {pr.name}
            </option>
          ))}
        </Select>
        <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-label="Owner" className="h-9">
          <option value="">No owner yet</option>
          {s.people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" className="h-9" />
      </div>
      {state.kind === "error" ? (
        <p role="alert" className="text-xs text-danger">
          {state.message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={approve} disabled={state.kind === "saving" || !projectId || title.trim().length < 2}>
          {state.kind === "saving" ? <Loader2 className="animate-spin" /> : <Check />} Approve
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setState({ kind: "dismissed" })}>
          Dismiss
        </Button>
      </div>
    </li>
  );
}
