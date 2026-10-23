"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Lock } from "lucide-react";
import { Select } from "@/components/ui/input";
import type { DayFill } from "@/services/rules/time";
import type { TimeDay, TimeRow, TimeWeek } from "@/services/time";
import { cn } from "@/lib/utils";
import { setDayTotalAction } from "./actions";

const DAY = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" });
const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const utc = (d: string) => new Date(`${d}T00:00:00Z`);
/** Minutes → hours with up to two decimals ("1.5", "0.02"); cells and totals round the same way (QA S3-B2). */
const toHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
/** A cell: empty for none. */
const hours = (minutes: number | undefined) => (minutes ? String(toHours(minutes)) : "");
/** A total: "0" for none. */
const short = (minutes: number) => (minutes ? toHours(minutes).toLocaleString("en-IN") : "0");

const FILL: Record<DayFill, string> = {
  empty: "bg-danger-soft text-danger",
  short: "bg-warning-soft text-warning",
  ok: "text-success",
  upcoming: "text-muted-foreground",
  off: "text-muted-foreground",
};

export function TimeGrid({ week, lockNote }: { week: TimeWeek; lockNote: boolean }) {
  const [added, setAdded] = useState<TimeRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const rows = [...week.rows, ...added.filter((a) => !week.rows.some((r) => r.taskId === a.taskId))];
  const remaining = week.otherTasks.filter((t) => !rows.some((r) => r.taskId === t.id));
  // Sunday and other days off take less room unless time was logged on them.
  const narrow = (d: TimeDay) => d.expectedMinutes === 0 && d.loggedMinutes === 0;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-subtle">
            <tr className="border-b">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Task</th>
              {week.days.map((d) => (
                <th key={d.date} className={cn("px-1 py-2 text-center text-xs font-medium", narrow(d) ? "w-14 text-muted-foreground/70" : "w-20 text-muted-foreground")}>
                  <span className="block text-foreground-2">{DAY.format(utc(d.date))}</span>
                  <span className="tabular">{DATE.format(utc(d.date))}</span>
                  {d.holiday ? <span className="block truncate text-[11px] text-info" title={d.holiday}>Holiday</span> : d.leave ? <span className="block text-[11px] text-info">{d.leave === 1 ? "Leave" : "½ leave"}</span> : null}
                </th>
              ))}
              <th className="w-16 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Nothing this week yet. {week.mine ? "Add a task below to log time on it." : ""}
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.taskId} className="border-b last:border-0">
                <td className="max-w-72 px-3 py-1.5">
                  <Link href={`/tasks/${r.taskId}`} className={cn("block truncate font-medium hover:underline", r.status === "done" && "text-muted-foreground line-through decoration-1")}>
                    {r.title}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.clientName} · {r.projectName}
                  </span>
                </td>
                {week.days.map((d) => (
                  <td key={d.date} className={cn("px-1 py-1.5 text-center", narrow(d) && "bg-subtle/60")}>
                    {week.mine && d.editable ? (
                      <Cell key={`${r.taskId}-${d.date}-${r.minutes[d.date] ?? 0}`} taskId={r.taskId} date={d.date} minutes={r.minutes[d.date]} title={r.title} onResult={setProblem} />
                    ) : (
                      <span className="tabular text-sm text-foreground-2">{hours(r.minutes[d.date]) || <span className="text-muted-foreground/60">–</span>}</span>
                    )}
                  </td>
                ))}
                <td className="tabular px-3 py-1.5 text-right font-medium">{short(r.totalMinutes)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-subtle/60">
              <td className="px-3 py-2 text-xs font-medium text-muted-foreground">Logged / expected hours</td>
              {week.days.map((d) => (
                <td key={d.date} className="px-1 py-2 text-center">
                  <span className={cn("tabular inline-block rounded-md px-1.5 py-0.5 text-xs font-medium", FILL[d.fill])} title={d.fill === "empty" ? "Nothing logged" : d.fill === "short" ? "Under three quarters of the day" : undefined}>
                    {short(d.loggedMinutes)}
                    {d.expectedMinutes ? <span className="font-normal opacity-70"> / {short(d.expectedMinutes)}</span> : null}
                  </span>
                </td>
              ))}
              <td className="tabular px-3 py-2 text-right text-xs font-semibold">
                {short(week.loggedMinutes)}
                <span className="block font-normal text-muted-foreground">of {short(week.expectedMinutes)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {problem ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {problem}
        </p>
      ) : null}
      {week.mine && remaining.length ? (
        <div className="flex max-w-md items-center gap-2">
          <Select
            aria-label="Add a task row"
            value=""
            onChange={(e) => {
              const t = remaining.find((x) => x.id === e.target.value);
              if (t) setAdded((list) => [...list, { taskId: t.id, title: t.title, clientName: t.clientName, projectName: "", status: "todo", dueDate: null, minutes: {}, totalMinutes: 0 }]);
            }}
          >
            <option value="" disabled>
              Add another of your tasks…
            </option>
            {remaining.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} · {t.clientName}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {lockNote ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3" /> Days of a month are closed for time after the 5th of the next month. Ask your lead to add missed time.
        </p>
      ) : null}
    </div>
  );
}

/** One task on one day: type the hours, then Tab or Enter. Saves the day's total for that task. */
function Cell({ taskId, date, minutes, title, onResult }: { taskId: string; date: string; minutes: number | undefined; title: string; onResult: (problem: string | null) => void }) {
  const [value, setValue] = useState(hours(minutes));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => {
    const before = hours(minutes);
    if (value.trim() === before) return;
    start(async () => {
      const r = await setDayTotalAction({ taskId, workDate: date, hours: value.trim() });
      if (!r.ok) {
        // Keep what was typed, marked red, so it can be corrected (QA S3-B1).
        setError(r.message);
        onResult(`${title}, ${DAY.format(utc(date))} ${DATE.format(utc(date))}: ${r.message}`);
      } else {
        setError(null);
        onResult(null);
      }
    });
  };
  return (
    <div className="relative mx-auto w-16">
      <input
        aria-label={`Hours on ${title}, ${date}`}
        inputMode="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="–"
        title={error ?? undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          "tabular h-8 w-16 rounded-md border border-transparent bg-transparent px-1 text-center text-sm outline-none placeholder:text-muted-foreground/50 hover:border-input focus:border-ring focus:bg-card focus:ring-[3px] focus:ring-ring/25",
          error && "border-danger",
        )}
      />
      {pending ? <Loader2 className="absolute top-2 right-0.5 size-3 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}
