"use client";

// "Catch me up" on a task's comments (Stage 12.2): a short summary for the person who asked, never posted.
import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRupees } from "@/lib/format";
import { catchUpAction } from "@/app/(app)/chat/actions";

export function TaskCatchUp({ taskId }: { taskId: string }) {
  const [state, setState] = useState<{ kind: "idle" | "loading" } | { kind: "done"; text: string; costPaise: number | null } | { kind: "error"; message: string }>({ kind: "idle" });
  const run = async () => {
    setState({ kind: "loading" });
    const r = await catchUpAction({ taskId });
    setState(r.ok ? { kind: "done", ...r.value } : { kind: "error", message: r.message });
  };
  if (state.kind === "idle" || state.kind === "loading")
    return (
      <Button size="sm" variant="ghost" onClick={run} disabled={state.kind === "loading"}>
        {state.kind === "loading" ? <Loader2 className="animate-spin" /> : <Sparkles />} Catch me up
      </Button>
    );
  return (
    <div role="status" className="basis-full rounded-md bg-subtle px-3 py-2 text-sm">
      <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3.5" /> Only you see this
        {state.kind === "done" && state.costPaise !== null ? ` · ${formatRupees(state.costPaise)}` : ""}
        <button type="button" aria-label="Close" onClick={() => setState({ kind: "idle" })} className="ml-auto">
          <X className="size-3.5" />
        </button>
      </p>
      <p className={state.kind === "error" ? "text-danger" : "whitespace-pre-wrap"}>{state.kind === "done" ? state.text : state.kind === "error" ? state.message : null}</p>
    </div>
  );
}
