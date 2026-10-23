"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { readClickUpCsv, type ClickUpRead } from "@/lib/clickup";
import type { ImportPreview, ImportResult } from "@/services/import";
import { previewImportAction, runImportAction } from "../actions";
import { countOf } from "@/lib/format";

type Level = "space" | "folder" | "list";
const LEVEL_LABELS: Record<Level, string> = { space: "Space", folder: "Folder", list: "List" };
const STATUS_CHOICES = [
  ["todo", "To do"],
  ["in_progress", "In progress"],
  ["in_review", "In review"],
  ["blocked", "Blocked"],
  ["skip", "Leave behind (closed)"],
] as const;
/** Keep each request under the server's 4 MB limit. */
const MAX_BYTES = 3_800_000;

/**
 * 1. Pick the ClickUp CSV export: it's read here, in the browser. 2. Check how it maps. 3. Import.
 * The plan's advice: export everything first and keep the file; import clients and open tasks only.
 */
export function ClickUpImport() {
  const [read, setRead] = useState<ClickUpRead | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [clientFrom, setClientFrom] = useState<Level>("folder");
  const [projectFrom, setProjectFrom] = useState<Level | "none">("list");
  const [clients, setClients] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = (file: File) => {
    setProblem(null);
    setResult(null);
    setPreview(null);
    start(async () => {
      const r = readClickUpCsv(await file.text());
      setRead(r);
      if (r.tasks.length === 0) return setProblem("No tasks found. Is this the CSV export from ClickUp, with a Task Name column?");
      if (new Blob([JSON.stringify(r.tasks)]).size > MAX_BYTES) return setProblem("This export is too big to import in one go. Export a few lists or folders at a time.");
      const p = await previewImportAction(r.tasks);
      if (!p.ok) return setProblem(p.message);
      setPreview(p.preview);
      setClientFrom(p.preview.defaults.clientFrom);
      setProjectFrom(p.preview.defaults.projectFrom);
      setStatuses(Object.fromEntries(p.preview.statuses.map((x) => [x.name, x.suggestion])));
      setPeople(Object.fromEntries(p.preview.people.map((x) => [x.name, x.suggestion])));
      setClients({});
    });
  };

  const sourceClients = preview ? preview.levels[clientFrom].clients : [];
  const clientChoice = (name: string, suggestion: string) => clients[name] ?? suggestion;

  const run = () => {
    if (!read || !preview) return;
    setProblem(null);
    start(async () => {
      const r = await runImportAction({
        tasks: read.tasks,
        mapping: {
          clientFrom,
          projectFrom,
          clients: Object.fromEntries(sourceClients.map((c) => [c.name, clientChoice(c.name, c.suggestion)])),
          statuses,
          people,
        },
      });
      if (!r.ok) setProblem(r.message);
      else setResult(r.result);
    });
  };

  if (result) {
    return (
      <div className="max-w-xl space-y-3 rounded-lg border bg-card p-5 shadow-card">
        <p className="flex items-center gap-2 font-medium text-success">
          <CheckCircle2 className="size-5" /> Imported
        </p>
        <ul className="space-y-1 text-sm">
          <li>
            <span className="tabular font-medium">{result.tasks}</span> tasks and <span className="tabular font-medium">{result.subtasks}</span> subtasks
          </li>
          <li>
            <span className="tabular font-medium">{result.clients}</span> new clients, <span className="tabular font-medium">{result.projects}</span> new projects
          </li>
          {result.alreadyImported ? <li className="text-muted-foreground">{result.alreadyImported} were already imported, left as they are</li> : null}
          <li className="text-muted-foreground">
            {result.closed} closed and {result.leftOut} from left-out clients stayed behind
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">New clients need their details, contacts and engagements: open each from Clients.</p>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link href="/clients">Go to Clients</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => (setResult(null), setRead(null), setPreview(null))}>
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="max-w-3xl space-y-3 rounded-lg border bg-card p-4 shadow-card md:p-5">
        <div>
          <h2 className="text-sm font-semibold">1. The ClickUp export</h2>
          <p className="text-xs text-muted-foreground">
            In ClickUp: Settings → Import/Export → Export, as CSV. Keep that file safe — it holds the completed history, which is not imported. Only open tasks
            come across. Importing the same file again adds nothing twice.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed p-4 text-sm hover:bg-hover">
          {pending && !preview ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <FileUp className="size-5 text-muted-foreground" />}
          <span>{read ? `${countOf(read.tasks.length, "task")} read. Pick another file to start again.` : "Choose the CSV file…"}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        </label>
        {read && (read.badDates || read.skippedRows || read.missing.length) ? (
          <p className="text-xs text-muted-foreground">
            {read.skippedRows ? `${read.skippedRows} rows had no task name and were skipped. ` : ""}
            {read.badDates ? `${read.badDates} dates couldn't be read and were left empty. ` : ""}
            {read.missing.length ? `Columns not found: ${read.missing.join(", ")}.` : ""}
          </p>
        ) : null}
      </section>

      {problem ? (
        <p role="alert" className="flex max-w-3xl items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {problem}
        </p>
      ) : null}

      {preview ? (
        <>
          <section className="max-w-3xl space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
            <div>
              <h2 className="text-sm font-semibold">2. Clients and projects</h2>
              <p className="text-xs text-muted-foreground">Which ClickUp level is a client, and which is a project inside it.</p>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="clientFrom">Each client is a ClickUp</Label>
                <Select
                  id="clientFrom"
                  value={clientFrom}
                  onChange={(e) => {
                    const next = e.target.value as Level;
                    setClientFrom(next);
                    // Clients and projects can't both be the same level: move projects to the next level that has values.
                    if (projectFrom === next) setProjectFrom((Object.keys(LEVEL_LABELS) as Level[]).find((l) => l !== next && preview.levels[l].filled > 0) ?? "none");
                  }}
                  className="w-44"
                >
                  {(Object.keys(LEVEL_LABELS) as Level[]).map((l) => (
                    <option key={l} value={l} disabled={preview.levels[l].filled === 0}>
                      {LEVEL_LABELS[l]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="projectFrom">Each project is a ClickUp</Label>
                <Select id="projectFrom" value={projectFrom} onChange={(e) => setProjectFrom(e.target.value as Level | "none")} className="w-44">
                  {(Object.keys(LEVEL_LABELS) as Level[])
                    .filter((l) => l !== clientFrom)
                    .map((l) => (
                      <option key={l} value={l} disabled={preview.levels[l].filled === 0}>
                        {LEVEL_LABELS[l]}
                      </option>
                    ))}
                  <option value="none">One project per client</option>
                </Select>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">In ClickUp</th>
                  <th className="py-2 text-right font-medium">Tasks</th>
                  <th className="py-2 pl-4 font-medium">In Oppllo One</th>
                </tr>
              </thead>
              <tbody>
                {sourceClients.map((c) => (
                  <tr key={c.name} className="border-b last:border-0">
                    <td className="py-2">{c.name}</td>
                    <td className="tabular py-2 text-right text-muted-foreground">{c.tasks}</td>
                    <td className="py-2 pl-4">
                      <Select aria-label={`Client for ${c.name}`} value={clientChoice(c.name, c.suggestion)} onChange={(e) => setClients((m) => ({ ...m, [c.name]: e.target.value }))} className="h-8">
                        <option value="new">Add as a new client</option>
                        <option value="skip">Leave out</option>
                        <optgroup label="Same as">
                          {preview.options.clients.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </optgroup>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="grid max-w-3xl gap-5 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
              <h2 className="text-sm font-semibold">3. Statuses</h2>
              {preview.statuses.map((x) => (
                <div key={x.name} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {x.name} <span className="tabular text-xs text-muted-foreground">· {x.tasks}</span>
                  </span>
                  <Select aria-label={`Status for ${x.name}`} value={statuses[x.name] ?? x.suggestion} onChange={(e) => setStatuses((m) => ({ ...m, [x.name]: e.target.value }))} className="h-8 w-56">
                    {STATUS_CHOICES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            <div className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
              <h2 className="text-sm font-semibold">4. People</h2>
              {preview.people.length === 0 ? <p className="text-sm text-muted-foreground">No assignees in the export.</p> : null}
              {preview.people.map((x) => (
                <div key={x.name} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {x.name} <span className="tabular text-xs text-muted-foreground">· {x.tasks}</span>
                  </span>
                  <Select aria-label={`Person for ${x.name}`} value={people[x.name] ?? x.suggestion} onChange={(e) => setPeople((m) => ({ ...m, [x.name]: e.target.value }))} className="h-8 w-48">
                    <option value="">Nobody</option>
                    {preview.options.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </section>

          <div className="flex max-w-3xl flex-wrap items-center gap-3">
            <Button onClick={run} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? "Importing…" : "Import open tasks"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {countOf(preview.tasks, "task")} in the file{preview.alreadyImported ? `, ${preview.alreadyImported} already imported` : ""}. Each task&apos;s first matched
              assignee becomes its owner, and owners join their client&apos;s team.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
