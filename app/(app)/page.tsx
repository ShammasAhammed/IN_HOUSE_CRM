// My Day — the default screen for everyone (plan/3-projects-module.md): due today and overdue, one-click done,
// one-tap time. Nothing else gets in the way.
import type { Metadata } from "next";
import Link from "next/link";
import { cache, Suspense } from "react";
import { ArrowRight, CalendarCheck2, Inbox, Palette, PartyPopper } from "lucide-react";
import { ErrorState, LoadingRows } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMinutes } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { Actor } from "@/services/permissions";
import type { TaskView } from "@/services/tasks";
import { CheckInCard } from "./attendance/check-in-card";
import { ClientDigest, MorningPlanCard } from "./morning-plan";
import { TaskRow } from "./task-row";
import { DoneScope, LiveCount } from "./live-count";

/** The header and the lists both need My Day; one request reads it once. */
const myDay = cache((actor: Actor) => getServices().tasks.myDay(actor));

export const metadata: Metadata = { title: "My Day" };

const longDate = (d: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export default function MyDayPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Suspense fallback={<Skeleton className="h-12 w-72" />}>
        <Header />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <CheckIn />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <Plan />
      </Suspense>
      <Suspense fallback={null}>
        <Digest />
      </Suspense>
      <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading your day" />}>
        <Lists />
      </Suspense>
    </div>
  );
}

async function Header() {
  const actor = await requireActor();
  const r = await myDay(actor);
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">My Day</h1>
        <p className="text-sm text-muted-foreground">{r.ok ? longDate(r.value.today) : null}</p>
      </div>
      {r.ok ? (
        <p className="rounded-full bg-subtle px-3 py-1 text-sm">
          Logged today <span className="tabular font-semibold">{formatMinutes(r.value.loggedTodayMinutes)}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Check in from My Day. It asks only on a working day you're not on leave (the Attendance page still lets you check in
 * any day), and steps aside once the day is closed.
 */
async function CheckIn() {
  const actor = await requireActor();
  const r = await getServices().attendance.my(actor);
  if (!r.ok) return <ErrorState error={r.error} className="py-3" />;
  const me = r.value;
  if (!me) return null;
  const waiting = me.record ? !me.record.checkOutAt : me.expected;
  if (!waiting && me.openDays.length === 0) return null;
  return <CheckInCard me={me} compact />;
}

/** The morning plan (12.4), or, for someone who switched it off, just what waits on them. */
async function Plan() {
  const actor = await requireActor();
  const services = getServices();
  const [day, status] = await Promise.all([myDay(actor), services.myAssistant.status(actor)]);
  if (!status.prefs.plan || !day.ok) return <Approvals />;
  return <MorningPlanCard actor={actor} plan={await services.myAssistant.plan(actor, day.value)} />;
}

async function Digest() {
  return <ClientDigest actor={await requireActor()} />;
}

/** What waits on me: leave to approve, creatives to review (both one count query, side by side). */
async function Approvals() {
  const actor = await requireActor();
  const services = getServices();
  const [leave, creatives] = await Promise.all([services.leave.waitingOnMeCount(actor), services.assets.waitingForReview(actor)]);
  if (!leave && !creatives.review) return null;
  const banner = "flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-sm text-warning hover:brightness-95";
  return (
    <div className="space-y-2">
      {leave ? (
        <Link href="/leave/approvals" className={banner}>
          <Inbox className="size-4" />
          <span className="flex-1 font-medium">
            {leave} leave {leave === 1 ? "request is" : "requests are"} waiting for you
          </span>
          <ArrowRight className="size-4" />
        </Link>
      ) : null}
      {creatives.review ? (
        <Link href="/creatives?state=internal_review" className={banner}>
          <Palette className="size-4" />
          <span className="flex-1 font-medium">
            {creatives.review} {creatives.review === 1 ? "creative waits" : "creatives wait"} for your review
          </span>
          <ArrowRight className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}

function Section({ title, ids, kind = "open", tone, children }: { title: string; ids?: string[]; kind?: "open" | "done"; tone?: "danger"; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {title}
        {ids ? <LiveCount ids={ids} kind={kind} className={tone === "danger" ? "tabular text-danger" : "tabular text-muted-foreground"} /> : null}
      </h2>
      {children}
    </section>
  );
}

function List({ tasks, today, showLog }: { tasks: TaskView[]; today: string; showLog?: boolean }) {
  return (
    <ul className="divide-y rounded-lg border bg-card shadow-card">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} today={today} showLog={showLog} />
      ))}
    </ul>
  );
}

async function Lists() {
  const actor = await requireActor();
  const result = await myDay(actor);
  if (!result.ok) return <ErrorState error={result.error} />;
  const { overdue, dueToday, comingUp, doneToday, today } = result.value;
  const nothing = overdue.length + dueToday.length === 0;

  return (
    <div className="space-y-6">
      {overdue.length ? (
        <Section title="Overdue" ids={overdue.map((t) => t.id)} tone="danger">
          <List tasks={overdue} today={today} />
        </Section>
      ) : null}
      <DoneScope />
      <Section title="Today" ids={dueToday.map((t) => t.id)}>
        {dueToday.length ? (
          <List tasks={dueToday} today={today} />
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-dashed bg-card px-4 py-5 text-sm text-muted-foreground">
            {nothing ? <PartyPopper className="size-5 text-success" /> : <CalendarCheck2 className="size-5" />}
            {nothing ? (comingUp.length ? "Nothing due today and nothing late. Pick something from below, or enjoy it." : "Nothing due today and nothing late. Nothing coming up this week either.") : "Nothing else due today."}
          </div>
        )}
      </Section>
      {comingUp.length ? (
        <Section title="Coming up this week" ids={comingUp.map((t) => t.id)}>
          <List tasks={comingUp} today={today} />
        </Section>
      ) : null}
      {doneToday.length ? (
        <Section title="Done today" ids={doneToday.map((t) => t.id)} kind="done">
          <List tasks={doneToday} today={today} showLog={false} />
        </Section>
      ) : null}
    </div>
  );
}
