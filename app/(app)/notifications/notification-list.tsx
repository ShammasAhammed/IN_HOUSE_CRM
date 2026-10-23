"use client";

import Link from "next/link";
import type { Route } from "next";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NotificationRecord } from "@/repositories";
import { markReadAction } from "./actions";

export function NotificationList({ items }: { items: NotificationRecord[] }) {
  const [pending, start] = useTransition();
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="space-y-3">
      {unread ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => markReadAction("all"))}>
          Mark all read
        </Button>
      ) : null}
      <ul className="divide-y rounded-lg border bg-card shadow-card">
        {items.map((n) => (
          <li key={n.id} className="flex items-start">
            <Link
              href={(n.link ?? "/notifications") as Route}
              onClick={() => (n.readAt ? undefined : void markReadAction([n.id]))}
              className={cn("flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-sm hover:bg-subtle", n.readAt && "text-muted-foreground")}
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={cn("block", !n.readAt && "font-medium")}>{n.title}</span>
                {n.body ? <span className="block truncate text-xs text-muted-foreground">{n.body}</span> : null}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
            </Link>
            {/* One at a time, without opening it (QA S1-01). */}
            {!n.readAt ? (
              <Button type="button" size="sm" variant="ghost" disabled={pending} className="m-1.5 shrink-0 text-xs" aria-label={`Mark "${n.title}" as read`} onClick={() => start(() => markReadAction([n.id]))}>
                Mark read
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
