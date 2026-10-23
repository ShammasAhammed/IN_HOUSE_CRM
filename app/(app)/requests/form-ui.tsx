"use client";

// Request forms (Stage 9b.5): the builder leads use, and the form people fill (signed in, or through the public link).
import { Checkbox } from "@/components/ui/choice";
import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { QUESTION_KINDS, QUESTION_KIND_LABELS, type Question, type QuestionKind } from "@/services/rules/request-forms";
import { removeFormAction, saveFormAction } from "./actions";
import { UnsavedGuard } from "@/components/unsaved-guard";

type Option = { id: string; name: string };
type Draft = Question & { optionsText: string };

/** A new question with an id no other question on the form has. */
const newQuestion = (existing: readonly Draft[]): Draft => {
  let k = existing.length;
  while (existing.some((q) => q.id === `qn${k}`)) k++;
  return { id: `qn${k}`, label: "", kind: "short", required: false, options: [], isTitle: existing.length === 0, optionsText: "" };
};

export function FormBuilder({
  initial,
  projects,
  people,
}: {
  initial: { formId?: string; name: string; description: string; projectId: string; ownerId: string; active: boolean; public: boolean; questions: Question[] };
  projects: Array<Option & { clientName: string }>;
  people: Option[];
}) {
  const [state, action] = useActionState(saveFormAction, idle);
  const [questions, setQuestions] = useState<Draft[]>(() => (initial.questions.length ? initial.questions.map((q) => ({ ...q, optionsText: q.options.join("\n") })) : [newQuestion([])]));
  const set = (i: number, patch: Partial<Draft>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : patch.isTitle ? { ...q, isTitle: false } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQuestions((qs) => {
      const next = [...qs];
      [next[i], next[i + d]] = [next[i + d]!, next[i]!];
      return next;
    });
  const payload = JSON.stringify(
    questions.map(({ optionsText, ...q }) => ({ ...q, label: q.label.trim(), options: q.kind === "select" ? optionsText.split(/\n|,/).map((o) => o.trim()).filter(Boolean) : [] })),
  );
  return (
    <form action={action} className="space-y-5">
      <UnsavedGuard />
      {initial.formId ? <input type="hidden" name="formId" value={initial.formId} /> : null}
      <input type="hidden" name="questions" value={payload} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-xs text-muted-foreground">Form name</span>
          <Input name="name" required minLength={2} maxLength={80} defaultValue={fieldDefault(state, "name", initial.name)} placeholder="e.g. Design request" className="h-9" />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-xs text-muted-foreground">Note at the top (optional)</span>
          <Textarea name="description" rows={2} maxLength={1000} defaultValue={fieldDefault(state, "description", initial.description)} placeholder="What to ask for here, and how soon we reply." />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">Requests become tasks in</span>
          <Select name="projectId" required defaultValue={fieldDefault(state, "projectId", initial.projectId)} className="h-9">
            <option value="" disabled>
              Pick a project…
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.clientName} · {p.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">Owner of each new task</span>
          <Select name="ownerId" defaultValue={fieldDefault(state, "ownerId", initial.ownerId)} className="h-9">
            <option value="">Nobody yet (a lead assigns)</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold">Questions</p>
        {questions.map((q, i) => (
          <div key={q.id} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label={`Question ${i + 1}`} value={q.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Question" maxLength={120} className="h-9 min-w-0 flex-1 basis-56" />
              <Select aria-label={`Kind of question ${i + 1}`} value={q.kind} onChange={(e) => set(i, { kind: e.target.value as QuestionKind })} className="h-9 w-auto">
                {QUESTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {QUESTION_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
              <div className="flex items-center">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move question ${i + 1} up`} className="rounded p-1 text-muted-foreground hover:bg-hover disabled:opacity-30">
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" disabled={i === questions.length - 1} onClick={() => move(i, 1)} aria-label={`Move question ${i + 1} down`} className="rounded p-1 text-muted-foreground hover:bg-hover disabled:opacity-30">
                  <ArrowDown className="size-4" />
                </button>
                <button type="button" disabled={questions.length === 1} onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`} className="rounded p-1 text-muted-foreground hover:bg-hover disabled:opacity-30">
                  <X className="size-4" />
                </button>
              </div>
            </div>
            {q.kind === "select" ? <Textarea aria-label={`Choices for question ${i + 1}`} rows={2} value={q.optionsText} onChange={(e) => set(i, { optionsText: e.target.value })} placeholder="Choices, one per line" /> : null}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5">
                <Checkbox className="size-4 accent-primary" checked={q.required} onChange={(e) => set(i, { required: e.target.checked })} /> Must be answered
              </label>
              {q.kind === "short" ? (
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="title-question" className="size-4 accent-primary" checked={q.isTitle} onChange={() => set(i, { isTitle: true })} /> Use as the task&apos;s title
                </label>
              ) : null}
              {q.kind === "date" ? <span>A date question called &quot;Needed by&quot; or &quot;Deadline&quot; becomes the due date.</span> : null}
            </div>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" disabled={questions.length >= 30} onClick={() => setQuestions((qs) => [...qs, newQuestion(qs)])}>
          <Plus /> Add a question
        </Button>
      </div>

      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox name="active" className="size-4 accent-primary" defaultChecked={initial.active} /> Open: people can send requests
        </label>
        <label className="flex items-center gap-2">
          <Checkbox name="public" className="size-4 accent-primary" defaultChecked={initial.public} /> Public link: people outside (clients) can send it without signing in
        </label>
      </div>
      {state.status === "error" ? <FormStatus state={state} /> : null}
      <SubmitButton pendingLabel="Saving…">{initial.formId ? "Save form" : "Create form"}</SubmitButton>
    </form>
  );
}

export function RemoveForm({ formId }: { formId: string }) {
  const [state, action] = useActionState(removeFormAction, idle);
  return (
    <form action={action} onSubmit={(e) => (confirm("Remove this form? Requests already sent stay as tasks.") ? undefined : e.preventDefault())}>
      <input type="hidden" name="formId" value={formId} />
      <Button type="submit" size="sm" variant="ghost">
        Remove form
      </Button>
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  );
}

/** The questions as a form to fill. `hidden` carries the form id or the public slug. */
export function FillForm({
  questions,
  action: serverAction,
  hidden,
  askName = false,
  submitLabel = "Send request",
}: {
  questions: Question[];
  action: (prev: ActionState, f: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  askName?: boolean;
  submitLabel?: string;
}) {
  const [sent, setSent] = useState(0);
  const [state, action] = useActionState(async (prev: ActionState, f: FormData) => {
    const r = await serverAction(prev, f);
    if (r.status === "ok") setSent((n) => n + 1);
    return r;
  }, idle);
  const err = (name: string) => (state.status === "error" ? state.fieldErrors?.[name]?.[0] : undefined);
  return (
    <div className="space-y-4">
      {state.status === "ok" ? <FormStatus state={state} /> : null}
      <form action={action} key={sent} className="space-y-4">
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {askName ? (
          <>
            {/* Hidden from people; bots fill it in. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] size-0 opacity-0" />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">Your name *</span>
                <Input name="submitterName" required minLength={2} maxLength={80} defaultValue={fieldDefault(state, "submitterName", "")} aria-invalid={Boolean(err("submitterName")) || undefined} className="h-9" />
                {err("submitterName") ? <span className="text-xs text-danger">{err("submitterName")}</span> : null}
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">Your email</span>
                <Input name="submitterEmail" type="email" maxLength={200} defaultValue={fieldDefault(state, "submitterEmail", "")} className="h-9" />
              </label>
            </div>
          </>
        ) : null}
        {questions.map((q) => {
          const value = fieldDefault(state, q.id, "");
          const common = { name: q.id, required: q.required, defaultValue: value, "aria-invalid": Boolean(err(q.id)) || undefined };
          return (
            <label key={q.id} className="block space-y-1 text-sm">
              <span className="font-medium">
                {q.label}
                {q.required ? " *" : ""}
              </span>
              {q.kind === "long" ? (
                <Textarea {...common} rows={4} maxLength={5000} />
              ) : q.kind === "select" ? (
                <Select {...common} className="h-9">
                  <option value="">Choose…</option>
                  {q.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  {...common}
                  type={q.kind === "date" ? "date" : q.kind === "link" ? "url" : q.kind === "email" ? "email" : q.kind === "phone" ? "tel" : "text"}
                  maxLength={q.kind === "link" ? 1000 : 200}
                  className="h-9"
                />
              )}
              {err(q.id) ? <span className="block text-xs text-danger">{err(q.id)}</span> : null}
            </label>
          );
        })}
        {state.status === "error" ? <FormStatus state={state} /> : null}
        <SubmitButton pendingLabel="Sending…">{submitLabel}</SubmitButton>
      </form>
    </div>
  );
}
