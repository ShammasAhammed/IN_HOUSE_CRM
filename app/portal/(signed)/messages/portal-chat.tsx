"use client";

// The client's chat with Oppllo (Stage 12.6): phone first, checks for new messages every few seconds while visible.
// Their own messages can be changed for 15 minutes and removed any time ("Message removed").
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, FileText, Link2, Loader2, Lock, Paperclip, Send, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PortalMessage } from "@/services/client-chat";
import { ACCEPTED_TASK_FILE_EXTENSIONS } from "@/services/rules/task-files";
import { portalEditMessageAction, portalRemoveMessageAction, portalSendMessageAction } from "../../actions";

type Msg = Omit<PortalMessage, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };
const POLL_MS = 5000;
const OVERLAP_MS = 5000;
const wire = (m: PortalMessage | Msg): Msg => JSON.parse(JSON.stringify(m)) as Msg;
const merge = (cur: Msg[], add: Msg[]) => {
  const byId = new Map(cur.map((m) => [m.id, m]));
  for (const m of add) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
};

function Parts({ m }: { m: Msg }) {
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {m.parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.text}</span>
        ) : p.kind === "portal" ? (
          <Link key={i} href={p.href as Route} className="mx-0.5 inline-flex items-center gap-1 rounded-md border bg-card px-1.5 text-xs font-medium hover:bg-hover">
            <Link2 className="size-3" /> {p.label}
          </Link>
        ) : p.kind === "link" ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
            {p.text}
          </a>
        ) : (
          <span key={i} className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-subtle px-1.5 text-xs text-muted-foreground">
            <Lock className="size-3" /> internal link
          </span>
        ),
      )}
    </p>
  );
}

function Bubble({ m, onChange }: { m: Msg; onChange: (m: Msg | null, error?: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body ?? "");
  const [confirm, setConfirm] = useState(false);
  return (
    <li className={cn("flex gap-2", m.mine && "flex-row-reverse")}>
      {m.mine ? null : <Avatar name={m.authorName} size="sm" />}
      <div className={cn("max-w-[85%] space-y-1 rounded-lg px-3 py-2", m.mine ? "bg-accent" : "border bg-card")}>
        <p className="text-xs text-muted-foreground">
          {m.mine ? "You" : m.authorName} · {formatTime(new Date(m.createdAt))}
          {m.edited ? " · edited" : ""}
        </p>
        {m.removed ? (
          <p className="text-sm text-muted-foreground italic">Message removed</p>
        ) : editing ? (
          <div className="space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} aria-label="Change your message" />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!draft.trim()}
                onClick={async () => {
                  const r = await portalEditMessageAction(m.id, draft);
                  if (r.ok) setEditing(false);
                  onChange(r.ok ? wire(r.value) : null, r.ok ? undefined : r.message);
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {m.parts.length ? <Parts m={m} /> : null}
            {m.file ? (
              <a href={`/api/portal-chat-files/${m.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-2 rounded-md border bg-card px-2 py-1 text-sm hover:bg-hover">
                <FileText className="size-4 shrink-0 text-muted-foreground" /> <span className="truncate">{m.file.name}</span>
              </a>
            ) : null}
          </>
        )}
        {m.mine && !m.removed && !editing ? (
          <p className="flex gap-3 text-xs text-muted-foreground">
            {m.canEdit ? (
              <button type="button" onClick={() => (setDraft(m.body ?? ""), setEditing(true))} className="hover:text-foreground">
                Edit
              </button>
            ) : null}
            {confirm ? (
              <>
                Remove it?
                <button
                  type="button"
                  className="font-medium text-danger"
                  onClick={async () => {
                    const r = await portalRemoveMessageAction(m.id);
                    setConfirm(false);
                    onChange(r.ok ? { ...m, removed: true, parts: [], body: null, file: null, canEdit: false, canRemove: false } : null, r.ok ? undefined : r.message);
                  }}
                >
                  Remove
                </button>
                <button type="button" onClick={() => setConfirm(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirm(true)} className="hover:text-foreground">
                Remove
              </button>
            )}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function PortalChat({ initial, serverTime }: { initial: Msg[]; serverTime: string }) {
  const [messages, setMessages] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const since = useRef(serverTime);
  const form = useRef<HTMLFormElement>(null);
  const toBottom = () => window.scrollTo({ top: document.documentElement.scrollHeight });

  useEffect(() => {
    toBottom();
  }, []);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch(`/api/portal-chat?since=${encodeURIComponent(new Date(Date.parse(since.current) - OVERLAP_MS).toISOString())}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: Msg[]; serverTime: string };
      since.current = data.serverTime;
      if (data.messages.length) setMessages((cur) => merge(cur, data.messages));
    } catch {
      // Offline for a moment: the next check catches up.
    }
  }, []);

  useEffect(() => {
    // shortcut: checks every 5 seconds while visible, like staff chat (D-12.1b).
    const t = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [poll]);

  const send = async () => {
    if (!form.current || sending) return;
    const data = new FormData(form.current);
    if (!String(data.get("body") ?? "").trim() && !fileName) return;
    setSending(true);
    setError(null);
    const r = await portalSendMessageAction(data);
    setSending(false);
    if (!r.ok) return setError(r.message);
    setMessages((cur) => merge(cur, [wire(r.value)]));
    form.current.reset();
    setFileName(null);
    requestAnimationFrame(toBottom);
  };

  return (
    <div className="space-y-3">
      {messages.length ? (
        <ol aria-label="Messages" aria-live="polite" className="space-y-3">
          {messages.map((m) => (
            <Bubble key={m.id} m={m} onChange={(next, err) => (next ? setMessages((cur) => merge(cur, [next])) : setError(err ?? null))} />
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground">No messages yet. Say hello to the Oppllo team.</p>
      )}
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="sticky bottom-0 space-y-2 rounded-lg border bg-card p-3 shadow-card"
      >
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        ) : null}
        <Textarea
          name="body"
          rows={2}
          aria-label="Your message"
          placeholder="Write a message…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex items-center gap-2">
          <input id="portal-file" type="file" name="file" accept={ACCEPTED_TASK_FILE_EXTENSIONS} className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
          <label htmlFor="portal-file" className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-hover hover:text-foreground">
            <Paperclip className="size-4" /> <span>Photo or file</span>
          </label>
          {fileName ? (
            <span className="flex min-w-0 items-center gap-1 rounded-md bg-subtle px-2 py-1 text-xs">
              <span className="truncate">{fileName}</span>
              <button type="button" aria-label="Remove the file" onClick={() => (form.current?.reset(), setFileName(null))}>
                <X className="size-3" />
              </button>
            </span>
          ) : null}
          <Button type="submit" size="sm" className="ml-auto" disabled={sending}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />} Send
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Files up to 3.5 MB; for bigger ones, share a Drive link.</p>
      </form>
    </div>
  );
}
