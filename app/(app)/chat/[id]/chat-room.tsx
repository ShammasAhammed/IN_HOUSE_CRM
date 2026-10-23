"use client";

// The conversation (Stage 12.1): messages, the box to write in, and a check for new ones every few seconds while
// the page is visible (D-12.1b). Enter sends, Shift+Enter starts a new line. With the AI on (Stage 12.2): @AI answers in
// the chat, Catch me up and Suggest tasks show only to the person who asked.
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, FileText, ListPlus, Link2, Loader2, Paperclip, Send, Sparkles, X } from "lucide-react";
import { DraftReplyButton } from "@/components/draft-reply";
import { MentionBox } from "@/components/mention-box";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { istDate } from "@/lib/dates";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { messageParts } from "@/services/rules/chat";
import { asksAi } from "@/services/rules/chat-ai";
import { clientWarnings } from "@/services/rules/client-chat";
import { ACCEPTED_TASK_FILE_EXTENSIONS } from "@/services/rules/task-files";
import { askAiAction, askPrivatelyAction, catchUpAction, earlierChatAction, editChatAction, removeChatAction, sendChatAction, suggestTasksAction } from "../actions";
import type { WireMessage } from "../wire";
import { AiPanel, type AiPanelState } from "./chat-ai";
import { CoworkerCard } from "./coworker-card";
import type { CardView } from "@/services/coworker";

const POLL_MS = 4000;
/** Ask a little further back than the last answer, so a message saved during the last check is never missed. */
const OVERLAP_MS = 5000;
const GROUP_MS = 5 * 60_000;

type Person = { id: string; name: string };

function order(list: WireMessage[]): WireMessage[] {
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function merge(current: WireMessage[], incoming: WireMessage[]): WireMessage[] {
  if (!incoming.length) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return order([...byId.values()]);
}

function Body({ m, appOrigin, names }: { m: WireMessage; appOrigin: string; names: string[] }) {
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {messageParts(m.body, appOrigin, names).map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.text}</span>
        ) : p.kind === "mention" ? (
          <span key={i} className="rounded bg-accent px-0.5 font-medium text-accent-foreground">
            {p.text}
          </span>
        ) : p.kind === "chip" ? (
          <Link key={i} href={p.href as Route} className="mx-0.5 inline-flex items-center gap-1 rounded-md border bg-subtle px-1.5 text-xs font-medium hover:bg-hover">
            <Link2 className="size-3" /> {p.label}
          </Link>
        ) : (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
            {p.text}
          </a>
        ),
      )}
    </p>
  );
}

function Message({
  m,
  showHeader,
  appOrigin,
  names,
  onChange,
  onMakeTasks,
  card,
}: {
  m: WireMessage;
  showHeader: boolean;
  appOrigin: string;
  names: string[];
  onChange: (m: WireMessage | null, error?: string) => void;
  onMakeTasks: ((messageId: string) => void) | null;
  /** The co-worker card this message shows, when it is one (12.5). */
  card?: { view: CardView; people: Person[] } | null;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const removed = Boolean(m.deletedAt);
  const ai = Boolean(m.aiReplyTo);
  const coworker = Boolean(m.coworkerId);

  const save = async () => {
    setBusy(true);
    const r = await editChatAction(m.id, draft);
    setBusy(false);
    if (r.ok) {
      onChange(r.value);
      setEditing(false);
    } else onChange(null, r.message);
  };
  const remove = async () => {
    setBusy(true);
    const r = await removeChatAction(m.id);
    setBusy(false);
    setConfirming(false);
    if (r.ok) onChange({ ...m, body: "", file: null, deletedAt: new Date().toISOString(), canEdit: false, canRemove: false });
    else onChange(null, r.message);
  };

  return (
    <li className={cn("group flex gap-2.5", showHeader ? "pt-3" : "pt-0.5")}>
      <div className="w-8 shrink-0">
        {showHeader ? (
          ai || coworker ? (
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-accent text-primary" aria-hidden>
              <Sparkles className="size-3.5" />
            </span>
          ) : (
            <Avatar name={m.authorName} size="sm" />
          )
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        {showHeader ? (
          <p className="flex items-baseline gap-2">
            {coworker ? (
              <span className="text-sm font-semibold">AI co-worker</span>
            ) : ai ? (
              <>
                <Badge tone="brand">AI</Badge>
                <span className="text-xs text-muted-foreground">answer for {m.authorName}</span>
              </>
            ) : (
              <span className="text-sm font-semibold">{m.authorName}</span>
            )}
            <span className="text-xs text-muted-foreground tabular">{formatTime(new Date(m.createdAt))}</span>
          </p>
        ) : null}
        {removed ? (
          <p className="text-sm text-muted-foreground italic">Message removed</p>
        ) : editing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              aria-label="Change message"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void save();
                } else if (e.key === "Escape") setEditing(false);
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={busy || !draft.trim()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {card ? <CoworkerCard initial={card.view} people={card.people} /> : m.body ? <Body m={m} appOrigin={appOrigin} names={names} /> : null}
            {m.file ? (
              <a href={`/api/chat-files/${m.id}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm hover:bg-hover">
                {m.file.isLink ? <Link2 className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                <span className="truncate font-medium">{m.file.name}</span>
                {m.file.size ? <span className="shrink-0 text-xs text-muted-foreground">{m.file.size}</span> : null}
              </a>
            ) : null}
            {m.editedAt ? <span className="text-xs text-muted-foreground"> (edited)</span> : null}
          </>
        )}
        {!removed && !editing && (m.canEdit || m.canRemove || onMakeTasks) ? (
          <div className="mt-0.5 flex gap-3 text-xs text-muted-foreground md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
            {m.canEdit ? (
              <button type="button" onClick={() => (setDraft(m.body), setEditing(true))} className="hover:text-foreground">
                Edit
              </button>
            ) : null}
            {onMakeTasks ? (
              <button type="button" onClick={() => onMakeTasks(m.id)} className="inline-flex items-center gap-1 hover:text-foreground">
                <ListPlus className="size-3" /> Make tasks
              </button>
            ) : null}
            {confirming ? (
              <span className="flex gap-2">
                Remove this message?
                <button type="button" onClick={remove} disabled={busy} className="font-medium text-danger">
                  Remove
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="hover:text-foreground">
                  Keep
                </button>
              </span>
            ) : m.canRemove ? (
              <button type="button" onClick={() => setConfirming(true)} className="hover:text-foreground">
                Remove
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function ChatRoom(props: {
  channelId: string;
  initial: WireMessage[];
  hasEarlier: boolean;
  serverTime: string;
  canPost: boolean;
  readOnlyReason: string | null;
  mentionable: Person[];
  appOrigin: string;
  lastReadAt: string | null;
  ai: { ready: boolean; reason: string | null; canSuggestTasks: boolean };
  /** The personal assistant's "Draft reply" (12.4). */
  canDraft?: boolean;
  /** The AI co-worker's cards in this chat (12.5), and who a task can be given to. */
  cards?: Record<string, CardView>;
  people?: Person[];
  /** A chat the client sees (12.6): warn before internal things reach them, and keep @AI private. */
  shared?: { otherClients: string[] } | null;
}) {
  const { channelId, canPost, readOnlyReason, appOrigin, ai } = props;
  // "AI" is offered after "@" like a person, when it can answer.
  const mentionable = ai.ready && canPost ? [{ id: "ai", name: "AI" }, ...props.mentionable] : props.mentionable;
  const [messages, setMessages] = useState(props.initial);
  const [hasEarlier, setHasEarlier] = useState(props.hasEarlier);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<AiPanelState | null>(null);
  const [warning, setWarning] = useState<string[] | null>(null);
  const since = useRef(props.serverTime);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const names = [...mentionable.map((p) => p.name), ...new Set(messages.map((m) => m.authorName))];

  const nearBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200;
  // The page's very end, so the newest message sits above the sticky composer, not behind it.
  const toBottom = () => window.scrollTo({ top: document.documentElement.scrollHeight });

  useEffect(() => {
    toBottom();
  }, []);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const from = new Date(Date.parse(since.current) - OVERLAP_MS).toISOString();
      const res = await fetch(`/api/chat/${channelId}?since=${encodeURIComponent(from)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: WireMessage[]; serverTime: string };
      since.current = data.serverTime;
      if (data.messages.length) {
        const stick = nearBottom();
        setMessages((cur) => merge(cur, data.messages));
        if (stick) requestAnimationFrame(toBottom);
      }
    } catch {
      // Offline for a moment: the next check catches up.
    }
  }, [channelId]);

  useEffect(() => {
    // shortcut: checks every 4 seconds while visible; move to a live-message service (D-12.1b) if it feels slow.
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  const send = async (anyway = false) => {
    const form = formRef.current;
    if (!form || sending) return;
    const data = new FormData(form);
    const text = String(data.get("body") ?? "").trim();
    if (!text && !fileName) return;
    if (props.shared) {
      // D-12.6a: @AI here answers only you; the question isn't posted for the client to read.
      if (asksAi(text)) {
        if (!ai.ready) return setNotice(ai.reason);
        setPanel({ kind: "private", loading: true });
        const r = await askPrivatelyAction(channelId, text.replace(/@ai\b/i, "").trim());
        if (!r.ok) return (setPanel(null), setError(r.message));
        form.reset();
        return setPanel({ kind: "private", loading: false, result: r.value });
      }
      // D-12.6c: a warning, never a block.
      const why = anyway ? [] : clientWarnings(text, props.shared.otherClients);
      if (why.length) return setWarning(why);
      setWarning(null);
    }
    setSending(true);
    setError(null);
    const r = await sendChatAction(data);
    setSending(false);
    if (!r.ok) return setError(r.message);
    setMessages((cur) => merge(cur, [r.value]));
    form.reset();
    setFileName(null);
    requestAnimationFrame(toBottom);
    form.querySelector("textarea")?.focus();
    if (asksAi(r.value.body)) {
      if (!ai.ready) return setNotice(ai.reason);
      setThinking(true);
      const a = await askAiAction(r.value.id);
      setThinking(false);
      if (!a.ok) return setError(a.message);
      setMessages((cur) => merge(cur, [a.value]));
      requestAnimationFrame(toBottom);
    }
  };

  const catchUp = async () => {
    setPanel({ kind: "catchup", loading: true });
    const r = await catchUpAction({ channelId, since: props.lastReadAt });
    if (!r.ok) return (setPanel(null), setError(r.message));
    setPanel({ kind: "catchup", loading: false, result: r.value });
  };

  const suggest = async (messageId: string | null) => {
    setPanel({ kind: "tasks", loading: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
    const r = await suggestTasksAction(channelId, messageId);
    if (!r.ok) return (setPanel(null), setError(r.message));
    setPanel({ kind: "tasks", loading: false, result: r.value });
  };
  const makeTasks = ai.ready && ai.canSuggestTasks ? (id: string) => void suggest(id) : null;

  const loadEarlier = async () => {
    const first = messages[0];
    if (!first) return;
    setLoadingEarlier(true);
    const r = await earlierChatAction(channelId, { createdAt: first.createdAt, id: first.id });
    setLoadingEarlier(false);
    if (!r.ok) return setError(r.message);
    setMessages((cur) => merge(cur, r.value.messages));
    setHasEarlier(r.value.hasEarlier);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {ai.ready ? (
          <>
            <Button size="sm" variant="outline" onClick={catchUp} disabled={panel?.loading}>
              <Sparkles /> Catch me up
            </Button>
            {ai.canSuggestTasks ? (
              <Button size="sm" variant="outline" onClick={() => void suggest(null)} disabled={panel?.loading}>
                <ListPlus /> Suggest tasks
              </Button>
            ) : null}
            <span className="text-xs text-muted-foreground">Type @AI to ask. Its answers use only what everyone in this chat can see.</span>
          </>
        ) : ai.reason ? (
          <span className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" /> {ai.reason}
          </span>
        ) : null}
      </div>
      {panel ? <AiPanel panel={panel} onClose={() => setPanel(null)} /> : null}
      {hasEarlier ? (
        <div className="mb-2 text-center">
          <Button size="sm" variant="ghost" onClick={loadEarlier} disabled={loadingEarlier}>
            {loadingEarlier ? <Loader2 className="animate-spin" /> : null} Load earlier messages
          </Button>
        </div>
      ) : null}
      {messages.length ? (
        <ol aria-label="Messages" aria-live="polite" className="pb-4">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const day = istDate(new Date(m.createdAt));
            const newDay = !prev || istDate(new Date(prev.createdAt)) !== day;
            const showHeader = newDay || !prev || Boolean(m.aiReplyTo || m.coworkerId) || Boolean(prev.aiReplyTo || prev.coworkerId) || prev.authorId !== m.authorId || Date.parse(m.createdAt) - Date.parse(prev.createdAt) > GROUP_MS;
            return (
              <li key={m.id} className="list-none">
                {newDay ? (
                  <p className="my-3 flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                    {day === istDate() ? "Today" : formatDate(day)}
                  </p>
                ) : null}
                <ol>
                  <Message m={m} showHeader={showHeader} appOrigin={appOrigin} names={names} onMakeTasks={m.coworkerId ? null : makeTasks} card={m.coworkerId && props.cards?.[m.coworkerId] ? { view: props.cards[m.coworkerId]!, people: props.people ?? [] } : null} onChange={(next, err) => (next ? setMessages((cur) => merge(cur, [next])) : setError(err ?? null))} />
                </ol>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>
      )}
      {thinking ? (
        <p className="flex items-center gap-2 pb-3 pl-10 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" /> The AI is answering…
        </p>
      ) : null}
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:px-0">
        {notice ? (
          <p role="status" className="mb-2 flex items-start gap-2 rounded-md bg-subtle px-3 py-2 text-sm text-muted-foreground">
            <Sparkles className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{notice}</span>
            <button type="button" aria-label="Close" onClick={() => setNotice(null)}>
              <X className="size-4" />
            </button>
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mb-2 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}
        {warning ? (
          <div role="alert" className="mb-2 space-y-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
            <p>
              <strong>Send to the client?</strong> This mentions {warning.join(", ")}.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void send(true)}>
                Send anyway
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setWarning(null)}>
                Edit it
              </Button>
            </div>
          </div>
        ) : null}
        {canPost ? (
          <form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="space-y-2"
          >
            <input type="hidden" name="channelId" value={channelId} />
            <MentionBox name="body" people={mentionable} defaultValue="" rows={2} required={false} label="Message" placeholder="Write a message… @ to mention, Enter to send" onEnter={() => void send()} />
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" name="file" accept={ACCEPTED_TASK_FILE_EXTENSIONS} className="sr-only" id={`file-${channelId}`} onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
              <label htmlFor={`file-${channelId}`} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-hover hover:text-foreground">
                <Paperclip className="size-4" />
                <span className="sr-only sm:not-sr-only">Attach</span>
              </label>
              {fileName ? (
                <span className="flex min-w-0 items-center gap-1 rounded-md bg-subtle px-2 py-1 text-xs">
                  <span className="truncate">{fileName}</span>
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    onClick={() => {
                      if (fileRef.current) fileRef.current.value = "";
                      setFileName(null);
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ) : (
                <span className="hidden text-xs text-muted-foreground sm:inline">Files up to 3.5 MB; share a Drive link for bigger ones.</span>
              )}
              {props.canDraft && messages.length ? <DraftReplyButton target={{ kind: "chat", channelId }} /> : null}
              <Button type="submit" size="sm" className="ml-auto" disabled={sending}>
                {sending ? <Loader2 className="animate-spin" /> : <Send />} Send
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{readOnlyReason ?? "You can read this chat but not write in it."}</p>
        )}
      </div>
    </div>
  );
}
