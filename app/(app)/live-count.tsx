"use client";

import { useEffect } from "react";
import { clearDone, useDoneChanges } from "./done-store";

/** Put once on My Day: when the page is left, its local ticks are forgotten. */
export function DoneScope() {
  useEffect(() => clearDone, []);
  return null;
}

/**
 * A section's count on My Day that follows ticks without a reload (QA S2-B7). "open" sections count their tasks not
 * ticked done since; "done" counts the server's done tasks plus those ticked on this page, less those undone.
 */
export function LiveCount({ ids, kind, className }: { ids: string[]; kind: "open" | "done"; className?: string }) {
  const changes = useDoneChanges();
  const listed = new Set(ids);
  let n = 0;
  if (kind === "open") n = ids.filter((id) => changes.get(id) !== true).length;
  else {
    n = ids.filter((id) => changes.get(id) !== false).length;
    for (const [id, isDone] of changes) if (isDone && !listed.has(id)) n++;
  }
  return <span className={className}>{n}</span>;
}
