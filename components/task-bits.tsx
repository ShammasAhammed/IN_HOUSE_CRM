// Small pieces every task list shares: priority mark, due chip, meta line.
import { CheckSquare, Clock, MessageSquare } from "lucide-react";
import { diffDays, type IsoDate } from "@/lib/dates";
import { formatMinutes, formatShortDate, formatWeekdayDate } from "@/lib/format";
import type { TaskPriority } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRIORITY: Record<TaskPriority, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-danger" },
  high: { label: "High", className: "bg-warning" },
  normal: { label: "Normal", className: "bg-transparent" },
  low: { label: "Low", className: "bg-border-strong" },
};

export function PriorityMark({ priority }: { priority: TaskPriority }) {
  if (priority === "normal") return null;
  return <span title={`${PRIORITY[priority].label} priority`} className={cn("inline-block size-2 shrink-0 rounded-full", PRIORITY[priority].className)} />;
}

/** "Today", "Tomorrow", "3 days late", "Fri, 16 Oct". */
export function DueChip({ due, today, done }: { due: IsoDate | null; today: IsoDate; done?: boolean }) {
  if (!due) return null;
  const days = diffDays(today, due);
  const late = !done && days < 0;
  const label = days === 0 ? "Today" : days === 1 ? "Tomorrow" : late ? `${-days} ${days === -1 ? "day" : "days"} late` : days < 7 ? formatWeekdayDate(due) : formatShortDate(due);
  return <span className={cn("tabular whitespace-nowrap", late ? "font-medium text-danger" : "text-muted-foreground")}>{label}</span>;
}

export function TaskCounts({ subtasksDone, subtasksTotal, commentCount, loggedMinutes, estimateMinutes }: {
  subtasksDone: number;
  subtasksTotal: number;
  commentCount: number;
  /** Null when the hours aren't this person's to see (D15). */
  loggedMinutes: number | null;
  estimateMinutes: number | null;
}) {
  return (
    <span className="flex items-center gap-2.5 whitespace-nowrap text-muted-foreground [&_svg]:size-3.5">
      {subtasksTotal > 0 ? (
        <span className="tabular flex items-center gap-1" title="Subtasks done">
          <CheckSquare /> {subtasksDone}/{subtasksTotal}
        </span>
      ) : null}
      {commentCount > 0 ? (
        <span className="tabular flex items-center gap-1" title="Comments">
          <MessageSquare /> {commentCount}
        </span>
      ) : null}
      {loggedMinutes === null ? (
        estimateMinutes ? (
          <span className="tabular flex items-center gap-1" title="Estimate">
            <Clock /> {formatMinutes(estimateMinutes)}
          </span>
        ) : null
      ) : loggedMinutes > 0 || estimateMinutes ? (
        <span className="tabular flex items-center gap-1" title="Logged / estimate">
          <Clock /> {formatMinutes(loggedMinutes)}
          {estimateMinutes ? ` / ${formatMinutes(estimateMinutes)}` : ""}
        </span>
      ) : null}
    </span>
  );
}
