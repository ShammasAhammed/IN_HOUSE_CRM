// One switch between the four ways to see tasks (Stage 9b.3): list, board, calendar and timeline.
import Link from "next/link";
import type { Route } from "next";
import { CalendarDays, GanttChart, KanbanSquare, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const VIEWS = [
  { key: "list", href: "/tasks", label: "List", icon: ListChecks },
  { key: "board", href: "/board", label: "Board", icon: KanbanSquare },
  { key: "calendar", href: "/tasks/calendar", label: "Calendar", icon: CalendarDays },
  { key: "timeline", href: "/tasks/timeline", label: "Timeline", icon: GanttChart },
] as const;

export function TaskViewSwitch({ current }: { current: (typeof VIEWS)[number]["key"] }) {
  return (
    <nav aria-label="Task views" className="inline-flex rounded-md border bg-card p-0.5">
      {VIEWS.map((v) => (
        <Link
          key={v.key}
          href={v.href as Route}
          aria-current={v.key === current ? "page" : undefined}
          // Named even where the word is hidden on phones (QA S8-B3).
          aria-label={v.label}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm text-muted-foreground hover:text-foreground [&_svg]:size-4",
            v.key === current && "bg-accent font-medium text-accent-foreground",
          )}
        >
          <v.icon />
          <span className="max-sm:sr-only">{v.label}</span>
        </Link>
      ))}
    </nav>
  );
}
