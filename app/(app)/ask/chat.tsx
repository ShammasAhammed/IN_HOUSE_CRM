"use client";

// The assistant's chat (Stage 9.2). The conversation lives only in this browser tab; each question sends it along.
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, RotateCcw, SendHorizontal, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatRupees } from "@/lib/format";
import { askAction } from "./actions";

type Message = { role: "user" | "assistant"; text: string; costPaise?: number | null };

const SUGGESTIONS = [
  "What's overdue for me?",
  "Which clients are over their hours this month?",
  "Who is on leave next week?",
  "Any risks I should know about this week?",
  "Write this week's WhatsApp update for a client",
];
const MAX_QUESTION = 4000;

export function Chat({ blocked, firstName }: { blocked: string | null; firstName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  // "My work" (12.4): questions are read as about my own tasks, time, leave and mentions; same tools, same rights.
  const [mode, setMode] = useState<"mine" | "all">("mine");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages.length, pending]);

  function send(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setError(null);
    const history = messages.map(({ role, text }) => ({ role, text }));
    setMessages((m) => [...m, { role: "user", text: q }]);
    setDraft("");
    startTransition(async () => {
      try {
        const r = await askAction(q, history, mode);
        if (r.ok) setMessages((m) => [...m, { role: "assistant", text: r.text, costPaise: r.costPaise }]);
        else {
          setError(r.message);
          // Put the question back so it isn't lost.
          setMessages((m) => m.slice(0, -1));
          setDraft(q);
        }
      } catch {
        setError("Couldn't reach Oppllo One. Check your connection and try again.");
        setMessages((m) => m.slice(0, -1));
        setDraft(q);
      }
    });
  }

  if (blocked && messages.length === 0) return <EmptyState icon={Sparkles} title="The assistant isn't available right now" description={blocked} />;

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <p className="text-sm">
            Hi {firstName}. Ask about your work, a client, a project or the team. You can ask in Malayalam too.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant="outline"
                className="h-auto py-1.5 text-left whitespace-normal"
                onClick={() => {
                  if (s.endsWith("for a client")) {
                    setDraft("Write this week's WhatsApp update for ");
                    box.current?.focus();
                  } else send(s);
                }}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <ol className="space-y-3">
          {messages.map((m, i) => (
            <li key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              {m.role === "user" ? (
                <p className="max-w-[85%] rounded-lg bg-accent px-3 py-2 text-accent-foreground text-sm break-words whitespace-pre-wrap">{m.text}</p>
              ) : (
                <Answer message={m} />
              )}
            </li>
          ))}
          {pending ? (
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4 animate-pulse text-primary" /> Looking it up… this can take up to a minute.
            </li>
          ) : null}
        </ol>
      )}
      <div ref={end} className="sr-only" aria-live="polite">
        {pending ? "Looking it up" : messages.at(-1)?.role === "assistant" ? "Answer ready" : ""}
      </div>

      {error ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <form
        className="sticky bottom-20 space-y-2 rounded-lg border bg-card p-3 shadow-card md:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <Textarea
          ref={box}
          aria-label="Your question"
          rows={2}
          maxLength={MAX_QUESTION}
          value={draft}
          placeholder={pending ? "Wait for the answer…" : "Ask a question, or paste meeting notes to turn into tasks"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(draft);
            }
          }}
          className="min-h-16 resize-y"
        />
        <div className="flex items-center justify-between gap-2">
          {messages.length ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setMessages([]);
                setError(null);
                setDraft("");
              }}
            >
              <RotateCcw /> New chat
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Enter sends · Shift+Enter for a new line</span>
          )}
          <span role="group" aria-label="Ask about" className="ml-auto inline-flex rounded-md border p-0.5 text-xs">
            {(["mine", "all"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={mode === m ? "rounded bg-accent px-2 py-1 font-medium text-accent-foreground" : "rounded px-2 py-1 text-muted-foreground hover:text-foreground"}>
                {m === "mine" ? "My work" : "Everything I see"}
              </button>
            ))}
          </span>
          <Button type="submit" size="sm" disabled={pending || !draft.trim()}>
            <SendHorizontal /> Ask
          </Button>
        </div>
      </form>
    </div>
  );
}

function Answer({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border bg-card p-3 shadow-card">
      <p className="text-sm break-words whitespace-pre-wrap">{message.text}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="tabular text-xs text-muted-foreground">{typeof message.costPaise === "number" ? `Cost ${formatRupees(message.costPaise)}` : ""}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
