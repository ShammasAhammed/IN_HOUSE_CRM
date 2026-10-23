"use client";

// "Draft reply" (Stage 12.4): the assistant writes a reply into this form's box for the person to edit. Nothing is sent
// until they press the form's own send button.
import { useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { draftReplyAction, type DraftTarget } from "@/app/(app)/me/assistant-actions";

export function DraftReplyButton({ target }: { target: DraftTarget }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    const r = await draftReplyAction(target);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    const box = ref.current?.closest("form")?.querySelector<HTMLTextAreaElement>('textarea[name="body"]');
    if (!box) return;
    box.value = r.value;
    // Let the box's own handlers (mentions, sizing) see the new text.
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.focus();
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button ref={ref} type="button" onClick={run} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-hover hover:text-foreground disabled:opacity-60">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Draft reply
      </button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
