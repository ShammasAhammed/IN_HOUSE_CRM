"use client";

// The month: a grid on desktop, a day-by-day list on phones. Click an item (or a day) to edit or plan.
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addDays, eachDay, endOfMonth, startOfWeek } from "@/lib/dates";
import { formatWeekdayDate } from "@/lib/format";
import { CONTENT_CHANNEL_LABELS, CONTENT_STATUS_LABELS, type ContentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { ContentItemRecord } from "@/repositories";
import type { CalendarMonth } from "@/services/content";
import { ContentEditor } from "./content-editor";

const TONE: Record<ContentStatus, BadgeTone> = { idea: "neutral", in_production: "info", ready: "brand", scheduled: "warning", published: "success" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({ data, today }: { data: CalendarMonth; today: string }) {
  const [open, setOpen] = useState<{ item: ContentItemRecord | null; day: string } | null>(null);
  const first = `${data.month}-01`;
  const last = endOfMonth(first);
  const gridDays = eachDay(startOfWeek(first), addDays(startOfWeek(last), 6));
  const byDay = new Map<string, ContentItemRecord[]>();
  for (const i of data.items) byDay.set(i.publishOn, [...(byDay.get(i.publishOn) ?? []), i]);
  const pick = (item: ContentItemRecord | null, day: string) => data.canEdit && setOpen({ item, day });
  const defaultDay = today.startsWith(data.month) ? today : first;

  const Chip = ({ i }: { i: ContentItemRecord }) => (
    <button
      type="button"
      disabled={!data.canEdit}
      onClick={() => pick(i, i.publishOn)}
      className="block w-full rounded-md border bg-card px-1.5 py-1 text-left text-xs hover:border-primary disabled:cursor-default"
      aria-label={`${i.title}, ${CONTENT_CHANNEL_LABELS[i.channel]}, ${CONTENT_STATUS_LABELS[i.status]}`}
    >
      <span className="block truncate font-medium">{i.title}</span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <span className="truncate">
          {i.publishTime ? `${i.publishTime} · ` : ""}
          {CONTENT_CHANNEL_LABELS[i.channel]}
        </span>
      </span>
      <Badge tone={TONE[i.status]} className="mt-0.5">
        {CONTENT_STATUS_LABELS[i.status]}
      </Badge>
    </button>
  );

  return (
    <div className="space-y-4">
      {data.canEdit && !open ? (
        <Button size="sm" onClick={() => setOpen({ item: null, day: defaultDay })}>
          <Plus /> Plan a post or ad
        </Button>
      ) : null}
      {open ? <ContentEditor clientId={data.client.id} item={open.item} day={open.day} options={data} onClose={() => setOpen(null)} /> : null}

      {/* Desktop: the month grid. */}
      <div className="hidden overflow-hidden rounded-lg border bg-card shadow-card md:block">
        <div className="grid grid-cols-7 border-b bg-subtle text-xs font-medium text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((d) => {
            const inMonth = d.startsWith(data.month);
            return (
              <div key={d} className={cn("min-h-28 space-y-1 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-subtle/60")}>
                <div className="flex items-center justify-between">
                  <span className={cn("tabular text-xs", d === today ? "rounded-full bg-primary px-1.5 font-semibold text-primary-foreground" : "text-muted-foreground")}>{Number(d.slice(8))}</span>
                  {data.canEdit && inMonth ? (
                    <button type="button" onClick={() => pick(null, d)} aria-label={`Plan something on ${formatWeekdayDate(d)}`} className="rounded text-muted-foreground hover:text-foreground">
                      <Plus className="size-3.5" />
                    </button>
                  ) : null}
                </div>
                {(byDay.get(d) ?? []).map((i) => (
                  <Chip key={i.id} i={i} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Phones: only days with something on them. */}
      <div className="md:hidden">
        {data.items.length === 0 ? null : (
          <ul className="space-y-3">
            {[...byDay].map(([d, items]) => (
              <li key={d}>
                <p className={cn("mb-1 text-xs font-medium", d === today ? "text-primary" : "text-muted-foreground")}>{formatWeekdayDate(d)}</p>
                <div className="space-y-1.5">
                  {items.map((i) => (
                    <Chip key={i.id} i={i} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
