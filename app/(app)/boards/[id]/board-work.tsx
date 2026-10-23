"use client";

// Boards connected to the work (Stage 13.2): put live cards on the board (tasks, creatives, this month's results,
// sheets, docs, the knowledge base, links), turn a sticky into a task, and save a picture to the swipe file.
import { useEffect, useState } from "react";
import { BarChart3, BookOpen, FileSpreadsheet, FileText, Image as ImageIcon, Link2, ListChecks, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { BoardCardKind } from "@/lib/types";
import { cardOptionsAction, saveReferenceAction, saveScreenshotAction, stickyToTaskAction, type CardOptions } from "./work-actions";

const tagsOf = (s: string) =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

function useOptions(clientId: string) {
  const [options, setOptions] = useState<CardOptions | null>(null);
  useEffect(() => {
    let live = true;
    void cardOptionsAction(clientId).then((o) => live && setOptions(o));
    return () => {
      live = false;
    };
  }, [clientId]);
  return options;
}

/** A pasted link, saved as a reference and drawn as a card. */
export function LinkForm({ clientId, onSaved, onProblem }: { clientId: string; onSaved: (id: string) => void; onProblem: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        setBusy(true);
        const r = await saveReferenceAction({ clientId, url: String(f.get("url") ?? ""), notes: String(f.get("notes") ?? ""), tags: tagsOf(String(f.get("tags") ?? "")) });
        setBusy(false);
        if (!r.ok) return onProblem(r.message);
        form.reset();
        onSaved(r.value.id);
      }}
    >
      <Input name="url" required placeholder="https://… (a page, YouTube, Instagram, Facebook)" aria-label="Link" className="h-8" />
      <Input name="notes" placeholder="Why it's good (a note)" aria-label="Note" className="h-8" maxLength={2000} />
      <Input name="tags" placeholder="Tags: good hook, nursing, trend" aria-label="Tags" className="h-8" />
      <Button size="sm" type="submit" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Link2 />} Add the link
      </Button>
      <p className="text-xs text-muted-foreground">Also in the swipe file. Tip: paste a link straight onto the board.</p>
    </form>
  );
}

export function AddCardPanel({ clientId, canEdit, onInsert, onProblem }: { clientId: string; canEdit: boolean; onInsert: (kind: BoardCardKind, id: string) => void; onProblem: (m: string) => void }) {
  const options = useOptions(clientId);
  const [pick, setPick] = useState<Record<string, string>>({});
  if (!canEdit) return <p className="text-sm text-muted-foreground">Only people who can draw here add cards.</p>;
  if (!options) return <p className="text-sm text-muted-foreground" role="status">Loading what you can add…</p>;
  const picker = (key: "tasks" | "creatives" | "docs" | "sheets", kind: BoardCardKind, label: string, Icon: typeof ListChecks, items: Array<{ id: string; title: string; extra?: string }>) => (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <Icon className="size-3.5 text-muted-foreground" /> {label}
      </p>
      {items.length ? (
        <div className="flex gap-1">
          <Select value={pick[key] ?? ""} onChange={(e) => setPick({ ...pick, [key]: e.target.value })} aria-label={`Pick a ${label.toLowerCase()}`} className="h-8 min-w-0 flex-1 text-xs">
            <option value="">Pick one</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
                {i.extra ? ` (${i.extra})` : ""}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="outline" disabled={!pick[key]} onClick={() => onInsert(kind, pick[key]!)}>
            Add
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">None here yet.</p>
      )}
    </div>
  );
  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-muted-foreground">Cards stay current: everyone sees them as they are now, and only what they may see (“No access” otherwise).</p>
      {picker("tasks", "task", "Task", ListChecks, options.tasks.map((t) => ({ id: t.id, title: t.title, extra: t.status.replace(/_/g, " ") })))}
      {picker("creatives", "creative", "Creative", ImageIcon, options.creatives.map((c) => ({ id: c.id, title: c.title, extra: c.state.replace(/_/g, " ") })))}
      {picker("sheets", "sheet", "Sheet or file (13.0)", FileSpreadsheet, options.sheets.map((s) => ({ id: s.id, title: s.title, extra: s.kind })))}
      {picker("docs", "doc", "Docs page", FileText, options.docs)}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onInsert("results", clientId)}>
          <BarChart3 /> This month&apos;s results
        </Button>
        <Button size="sm" variant="outline" onClick={() => onInsert("knowledge", clientId)}>
          <BookOpen /> Knowledge base
        </Button>
      </div>
      <div className="space-y-1 border-t pt-3">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Link2 className="size-3.5 text-muted-foreground" /> A link (reference)
        </p>
        <LinkForm clientId={clientId} onSaved={(id) => onInsert("ref", id)} onProblem={onProblem} />
      </div>
    </div>
  );
}

/** "Make it a task": project (of this client or space), owner and due date; the title comes from the sticky. */
export function TaskMaker({ clientId, boardId, elementId, text, onMade, onProblem }: { clientId: string; boardId: string; elementId: string; text: string; onMade: (taskId: string) => void; onProblem: (m: string) => void }) {
  const options = useOptions(clientId);
  const [busy, setBusy] = useState(false);
  if (!options) return <p className="text-xs text-muted-foreground">Loading projects…</p>;
  if (!options.projects.length) return <p className="text-xs text-muted-foreground">This client has no open project to add the task to.</p>;
  return (
    <form
      className="space-y-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const val = (k: string) => String(f.get(k) ?? "") || undefined;
        setBusy(true);
        const r = await stickyToTaskAction({ boardId, elementId, projectId: String(f.get("projectId")), ...(val("ownerId") ? { ownerId: val("ownerId") } : {}), ...(val("dueDate") ? { dueDate: val("dueDate") } : {}), ...(val("title") ? { title: val("title") } : {}) });
        setBusy(false);
        if (!r.ok) return onProblem(r.message);
        onMade(r.value.taskId);
      }}
    >
      <Input name="title" defaultValue={text.replace(/\s+/g, " ").slice(0, 200)} aria-label="Task title" className="h-8 text-xs" required minLength={2} />
      <Select name="projectId" required defaultValue={options.projects.length === 1 ? options.projects[0]!.id : ""} aria-label="Project" className="h-8 text-xs">
        <option value="" disabled>
          Project
        </option>
        {options.projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <div className="flex gap-1">
        <Select name="ownerId" defaultValue="" aria-label="Owner" className="h-8 min-w-0 flex-1 text-xs">
          <option value="">No owner yet</option>
          {options.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input name="dueDate" type="date" aria-label="Due date" className="h-8 w-36 text-xs" />
      </div>
      <Button size="sm" type="submit" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <ListChecks />} Make the task
      </Button>
    </form>
  );
}

/** Saves the selected picture (a screenshot on the board) to the client's swipe file. */
export function SaveImage({ clientId, dataURL, onDone, onProblem }: { clientId: string; dataURL: string; onDone: () => void; onProblem: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
          const blob = await (await fetch(dataURL)).blob();
          f.set("file", new File([blob], `screenshot.${blob.type.split("/")[1] ?? "png"}`, { type: blob.type }));
          f.set("clientId", clientId);
          const r = await saveScreenshotAction(f);
          if (!r.ok) onProblem(r.message);
          else onDone();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input name="notes" placeholder="Why it's good" aria-label="Note" className="h-8 text-xs" />
      <Input name="tags" placeholder="Tags, comma between" aria-label="Tags" className="h-8 text-xs" />
      <Button size="sm" type="submit" variant="outline" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <ImageIcon />} Save to swipe file
      </Button>
    </form>
  );
}
