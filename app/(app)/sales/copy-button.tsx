"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyFromCrmAction, type CopyResult } from "./actions";

export function CopyFromCrmButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CopyResult | null>(null);
  // Asks once before copying (QA S1-04): on a phone the button sits just above the tabs and is easy to tap by mistake.
  const [asking, setAsking] = useState(false);
  return (
    <div className="space-y-2">
      {asking ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-subtle px-3 py-2 text-sm">
          <span className="basis-full sm:basis-auto">Copy every lead from the CRM now? It takes up to a minute.</span>
          <Button size="sm" disabled={pending} onClick={() => (setAsking(false), start(async () => setResult(await copyFromCrmAction())))}>
            Copy now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => (setResult(null), setAsking(true))}>
          <RefreshCw className={pending ? "animate-spin" : ""} /> {pending ? "Copying…" : "Copy from the CRM now"}
        </Button>
      )}
      {result ? (
        <p role="status" className={result.ok ? "text-xs text-success" : "text-xs text-danger"}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
