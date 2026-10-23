"use client";

// Comments on a page (Stage 13.4): on the whole page or on words selected in it, with @mentions; resolve when done.
import { useState } from "react";
import { MessageSquareQuote } from "lucide-react";
import { MentionBox } from "@/components/mention-box";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { commentDocAction, removeDocCommentAction, resolveDocCommentAction } from "../actions";

type Comment = { id: string; quote: string | null; body: string; authorName: string; resolvedAt: string | null; resolvedByName: string | null; createdAt: string; mine: boolean };

export function DocComments({ docId, comments, people, canComment }: { docId: string; comments: Comment[]; people: Array<{ id: string; name: string }>; canComment: boolean }) {
  const [quote, setQuote] = useState("");
  const [key, setKey] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const open = comments.filter((c) => !c.resolvedAt);
  const done = comments.filter((c) => c.resolvedAt);
  const run = async (p: Promise<{ ok: boolean; message?: string }>) => {
    const r = await p;
    setProblem(r.ok ? null : (r.message ?? "Not saved."));
    return r.ok;
  };
  const item = (c: Comment) => (
    <li key={c.id} className={cn("space-y-1 rounded-md border p-2 text-sm", c.resolvedAt && "opacity-70")}>
      {c.quote ? <p className="border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground italic">“{c.quote}”</p> : null}
      <p className="break-words whitespace-pre-wrap">{c.body}</p>
      <p className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {c.authorName} · {formatDateTime(new Date(c.createdAt))}
        {c.resolvedAt ? <span>· resolved{c.resolvedByName ? ` by ${c.resolvedByName}` : ""}</span> : null}
        <button type="button" className="text-primary hover:underline" onClick={() => run(resolveDocCommentAction(c.id, !c.resolvedAt))}>
          {c.resolvedAt ? "Reopen" : "Resolve"}
        </button>
        {c.mine ? (
          removing === c.id ? (
            <>
              <button type="button" className="font-medium text-danger" onClick={() => run(removeDocCommentAction(c.id))}>
                Remove
              </button>
              <button type="button" onClick={() => setRemoving(null)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="hover:text-foreground" onClick={() => setRemoving(c.id)}>
              Remove
            </button>
          )
        ) : null}
      </p>
    </li>
  );
  return (
    <div className="space-y-3">
      {open.length ? <ul className="space-y-2">{open.map(item)}</ul> : <p className="text-xs text-muted-foreground">No open comments.</p>}
      {done.length ? (
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowResolved(!showResolved)}>
          {showResolved ? "Hide" : "Show"} {done.length} resolved
        </button>
      ) : null}
      {showResolved ? <ul className="space-y-2">{done.map(item)}</ul> : null}
      {canComment ? (
        <form
          key={key}
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = String(new FormData(e.currentTarget).get("body") ?? "");
            if (await run(commentDocAction({ docId, body, ...(quote ? { quote } : {}) }))) {
              setQuote("");
              setKey(key + 1);
            }
          }}
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onMouseDown={(e) => {
              // Read the selection before the click moves focus.
              e.preventDefault();
              const sel = window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "";
              setQuote(sel.slice(0, 300));
              if (!sel) setProblem("Select some words on the page first, then press this.");
            }}
          >
            <MessageSquareQuote /> Comment on the selected words
          </Button>
          {quote ? (
            <p className="flex items-start gap-2 border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground italic">
              “{quote}”
              <button type="button" className="not-italic" onClick={() => setQuote("")}>
                ✕
              </button>
            </p>
          ) : null}
          <MentionBox people={people} name="body" defaultValue="" placeholder="Write a comment… type @ to mention someone" />
          <Button size="sm" type="submit">
            Comment
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Your access here is view only.</p>
      )}
      {problem ? (
        <p role="alert" className="text-xs text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
