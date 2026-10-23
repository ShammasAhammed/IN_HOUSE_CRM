// Meetings library (Stage 13.4): every meeting the person can see, as a list or a month calendar, filtered by client
// or space, kind, date and attendee; "what did we decide" across them; a new meeting from the Meeting template.
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, List, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { endOfMonth, isIsoDate, istDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { isId } from "@/lib/id";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { MEETING_KIND_LABELS, MEETING_KINDS } from "@/lib/types";
import type { MeetingRecord } from "@/repositories";
import { calendarMonth } from "@/services/rules/doc-tables";
import { NewMeetingForm } from "./meeting-forms";

export const metadata: Metadata = { title: "Meetings" };

export default function MeetingsPage({ searchParams }: PageProps<"/meetings">) {
  return (
    <>
      <PageHeader title="Meetings" description="Every meeting is a page: attendees, agenda, notes, decisions and action items. Approve an action item to make it a task." />
      <Suspense fallback={<LoadingRows rows={6} columns={3} label="Loading meetings" />}>
        <Meetings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

async function Meetings({ searchParams }: { searchParams: PageProps<"/meetings">["searchParams"] }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const services = getServices();
  const today = istDate();
  const client = str(sp.client);
  const kind = MEETING_KINDS.find((k) => k === sp.kind);
  const attendee = isId(str(sp.attendee)) ? str(sp.attendee) : "";
  const view = sp.view === "calendar" ? "calendar" : "list";
  const month = /^\d{4}-\d{2}$/.test(str(sp.month)) ? str(sp.month) : today.slice(0, 7);
  const from = view === "calendar" ? `${month}-01` : isIsoDate(str(sp.from)) ? str(sp.from) : undefined;
  const to = view === "calendar" ? endOfMonth(`${month}-01`) : isIsoDate(str(sp.to)) ? str(sp.to) : undefined;
  const q = str(sp.q).trim().slice(0, 100);
  const clientFilter = client === "team" ? null : isId(client) ? client : undefined;
  const [list, clients, people, decisions] = await Promise.all([
    services.meetings.list(actor, { clientId: clientFilter, kind, attendee, from, to }),
    services.clients.options(actor),
    services.people.directory(actor),
    q ? services.meetings.decisions(actor, { clientId: clientFilter, q }) : Promise.resolve(null),
  ]);
  const team = people.ok ? people.value.map((p) => ({ id: p.id, name: p.fullName })) : [];
  const keep = { client, kind: kind ?? "", attendee, view, ...(view === "calendar" ? { month } : { from: from ?? "", to: to ?? "" }) };
  const href = (patch: Record<string, string>) => `/meetings?${new URLSearchParams(Object.entries({ ...keep, ...patch }).filter(([, v]) => v))}` as Route;
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
      <div className="space-y-4">
        <form className="flex flex-wrap gap-2" aria-label="Filter meetings">
          <input type="hidden" name="view" value={view} />
          {view === "calendar" ? <input type="hidden" name="month" value={month} /> : null}
          <Select name="client" aria-label="Client or space" defaultValue={client} className="h-9 w-auto max-w-full">
            <option value="">All clients and spaces</option>
            <option value="team">Team meetings</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select name="kind" aria-label="Kind" defaultValue={kind ?? ""} className="h-9 w-auto">
            <option value="">Any kind</option>
            {MEETING_KINDS.map((k) => (
              <option key={k} value={k}>
                {MEETING_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
          <Select name="attendee" aria-label="Attendee" defaultValue={attendee} className="h-9 w-auto max-w-full">
            <option value="">Anyone attending</option>
            {team.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {view === "list" ? (
            <>
              <Input name="from" type="date" aria-label="From" defaultValue={from ?? ""} className="h-9 w-auto" />
              <Input name="to" type="date" aria-label="To" defaultValue={to ?? ""} className="h-9 w-auto" />
            </>
          ) : null}
          <Button type="submit" size="sm" variant="outline" className="h-9">
            Filter
          </Button>
          <div className="ml-auto flex gap-1">
            <Button asChild size="sm" variant={view === "list" ? "secondary" : "ghost"} className="h-9">
              <Link href={href({ view: "list", month: "" })} aria-current={view === "list" ? "page" : undefined}>
                <List /> List
              </Link>
            </Button>
            <Button asChild size="sm" variant={view === "calendar" ? "secondary" : "ghost"} className="h-9">
              <Link href={href({ view: "calendar", from: "", to: "" })} aria-current={view === "calendar" ? "page" : undefined}>
                <CalendarDays /> Calendar
              </Link>
            </Button>
          </div>
        </form>

        {view === "calendar" ? (
          <MonthView meetings={list} month={month} today={today} prev={href({ month: shift(-1) })} next={href({ month: shift(1) })} />
        ) : list.length === 0 ? (
          <EmptyState icon={Users} title="No meetings here yet" description="Create one on the right. Its page starts from the Meeting template." />
        ) : (
          <ul className="divide-y rounded-lg border bg-card shadow-card">
            {list.map((m) => (
              <li key={m.id}>
                <Link href={`/docs/${m.docId}` as Route} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-hover">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground tabular">
                    {formatDate(m.meetingDate)}
                    {m.startTime ? ` ${m.startTime.slice(0, 5)}` : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.title}</span>
                  <span className="text-xs text-muted-foreground">{m.clientName ?? "Team"}</span>
                  <Badge tone={m.kind === "client_call" ? "brand" : m.kind === "review" ? "info" : "neutral"}>{MEETING_KIND_LABELS[m.kind]}</Badge>
                  {m.repeat !== "none" ? <Badge tone="neutral">{m.repeat === "weekly" ? "Weekly" : "Monthly"}</Badge> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>What did we decide?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form role="search" className="flex gap-2">
              {client ? <input type="hidden" name="client" value={client} /> : null}
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search decisions</span>
                <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input name="q" type="search" defaultValue={q} placeholder="budget, launch, fees…" className="h-9 pl-8" />
              </label>
              <Button type="submit" size="sm" variant="outline" className="h-9">
                Search
              </Button>
            </form>
            {decisions ? (
              decisions.length ? (
                <ul className="space-y-2 text-sm">
                  {decisions.slice(0, 50).map((d, i) => (
                    <li key={`${d.meetingId}-${i}`}>
                      <p>{d.text}</p>
                      <Link href={`/docs/${d.docId}` as Route} className="text-xs text-muted-foreground hover:underline">
                        {d.title} · {d.clientName ?? "Team"} · {formatDate(d.meetingDate)}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No decision mentions &quot;{q}&quot;{client ? " for this client" : ""}.</p>
              )
            ) : (
              <p className="text-xs text-muted-foreground">Searches the Decisions of every meeting you can see. Pick a client in the filter to ask about one client.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>New meeting</CardTitle>
          </CardHeader>
          <CardContent>
            <NewMeetingForm clients={clients} people={team} clientId={isId(client) ? client : ""} today={today} />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function MonthView({ meetings, month, today, prev, next }: { meetings: MeetingRecord[]; month: string; today: string; prev: Route; next: Route }) {
  const byId = new Map(meetings.map((m) => [m.id, m]));
  const weeks = calendarMonth(
    meetings.map((m, i) => ({ id: m.id, position: i, cells: { d: m.meetingDate } })),
    { id: "d", name: "Date", type: "date" },
    month,
  );
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Button asChild size="sm" variant="ghost">
          <Link href={prev}>← Earlier</Link>
        </Button>
        <p className="text-sm font-semibold">{label}</p>
        <Button asChild size="sm" variant="ghost">
          <Link href={next}>Later →</Link>
        </Button>
      </div>
      {/* Phones: a day list; wider screens: the month grid. */}
      <ul className="divide-y rounded-lg border bg-card md:hidden">
        {weeks.flat().filter((d) => d.inMonth && d.rows.length).length === 0 ? <li className="px-4 py-3 text-sm text-muted-foreground">No meetings this month.</li> : null}
        {weeks
          .flat()
          .filter((d) => d.inMonth && d.rows.length)
          .map((d) => (
            <li key={d.date} className="px-4 py-2">
              <p className="text-xs text-muted-foreground">{formatDate(d.date)}</p>
              {d.rows.map((r) => (
                <Link key={r.id} href={`/docs/${byId.get(r.id)!.docId}` as Route} className="block truncate text-sm font-medium hover:underline">
                  {byId.get(r.id)!.title}
                </Link>
              ))}
            </li>
          ))}
      </ul>
      <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
        <div className="grid grid-cols-7 border-b text-center text-xs text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-1.5">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((w, i) => (
          <div key={i} className="grid grid-cols-7 border-b last:border-b-0">
            {w.map((d) => (
              <div key={d.date} className={`min-h-20 border-r p-1 last:border-r-0 ${d.inMonth ? "" : "bg-neutral-soft"}`}>
                <p className={`text-xs tabular ${d.date === today ? "font-semibold text-primary" : "text-muted-foreground"}`}>{Number(d.date.slice(8))}</p>
                {d.rows.map((r) => {
                  const m = byId.get(r.id)!;
                  return (
                    <Link key={r.id} href={`/docs/${m.docId}` as Route} title={m.title} className="mt-0.5 block truncate rounded bg-accent text-accent-foreground px-1 text-xs hover:underline">
                      {m.startTime ? `${m.startTime.slice(0, 5)} ` : ""}
                      {m.title}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
