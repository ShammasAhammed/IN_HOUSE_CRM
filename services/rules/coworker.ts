// The AI co-worker (Stage 12.5): what it notices on the board, by plain rules that cost nothing. Pure, unit-tested.
//
// D-12.5a the rules decide what is suggested; each problem has its "why" (facts straight from the data: dates, counts,
// names) and exactly one action. The AI may only reword a card; it never adds an action or a fact.
import { addDays, diffDays, type IsoDate } from "@/lib/dates";
import { formatShortDate } from "@/lib/format";
import type { CardAction } from "@/repositories";

export type { CardAction };

export const COWORKER_KINDS = ["overdue", "blocked", "unowned", "owner_away", "overloaded", "client_review", "quiet_client", "results_behind", "calendar_gap", "client_waiting", "goal_off_track"] as const;
export type CoworkerKind = (typeof COWORKER_KINDS)[number];
export const COWORKER_KIND_LABELS: Record<CoworkerKind, string> = {
  overdue: "Late tasks",
  blocked: "Blocked tasks",
  unowned: "Tasks with no owner",
  owner_away: "Owner on leave",
  overloaded: "Someone overloaded",
  client_review: "Waiting on client approval",
  quiet_client: "Quiet client",
  results_behind: "Results behind",
  calendar_gap: "Content calendar gap",
  client_waiting: "Client waiting for a reply",
  goal_off_track: "Goal off track",
};

export type Problem = { kind: CoworkerKind; key: string; clientId: string; title: string; why: string[]; action: CardAction | CardAction[] };

// Thresholds, in one place.
export const BLOCKED_DAYS = 3;
export const CLIENT_REVIEW_DAYS = 5;
export const QUIET_DAYS = 10;
export const OVERLOADED_PERCENT = 130;
export const SPARE_PERCENT = 70;
export const MAX_CARDS_PER_CHAT = 3;
export const DISMISS_QUIET_DAYS = 7;
export const LEARN_WINDOW = 10;
export const LEARN_DISMISSED = 8;

export type SnapClient = {
  id: string;
  name: string;
  leadStrategistId: string | null;
  lastActivityAt: Date | null;
  /** 11.1 health this month: level and its reasons. */
  health: { level: "on_track" | "at_risk" | "off_track" | "no_target"; reasons: string[] } | null;
  nextWeekPosts: number;
  /** Posts planned per week over the last four weeks; null with no history. */
  avgWeeklyPosts: number | null;
  activeProjectId: string | null;
};
export type SnapTask = { id: string; title: string; clientId: string; ownerId: string | null; ownerName: string | null; status: string; dueDate: IsoDate | null; blockedSince: Date | null };
export type Snapshot = {
  today: IsoDate;
  now: Date;
  clients: SnapClient[];
  tasks: SnapTask[];
  inClientReview: Array<{ id: string; title: string; clientId: string; since: Date }>;
  away: Array<{ personId: string; personName: string; until: IsoDate }>;
  /** This week's planned load, per person. */
  load: Map<string, { name: string; percent: number | null }>;
  people: Map<string, string>;
  /** The next working day on or after a date. */
  workingDay: (d: IsoDate) => IsoDate;
  /** Clients who wrote last in their shared chat (12.6), and since when. */
  clientWaiting?: Array<{ clientId: string; since: Date }>;
  /** A space's goals off track (14.3), told in that space's own chat. */
  goalsOffTrack?: Array<{ id: string; spaceId: string; title: string; reasons: string[] }>;
};

const ago = (n: number) => (n === 1 ? "1 day ago" : `${n} days ago`);
const when = (d: IsoDate) => formatShortDate(d);

/** The teammates of a client: everyone who owns open work there, plus the lead strategist. */
function teamOf(s: Snapshot, clientId: string): string[] {
  const c = s.clients.find((x) => x.id === clientId);
  return [...new Set([...s.tasks.filter((t) => t.clientId === clientId && t.ownerId).map((t) => t.ownerId!), ...(c?.leadStrategistId ? [c.leadStrategistId] : [])])];
}

/** The least-loaded teammate who isn't away (and isn't `not`). */
function spare(s: Snapshot, clientId: string, not: string | null): { id: string; name: string; percent: number | null } | null {
  const awayIds = new Set(s.away.map((a) => a.personId));
  const candidates = teamOf(s, clientId)
    .filter((id) => id !== not && !awayIds.has(id) && s.people.has(id))
    .map((id) => ({ id, name: s.people.get(id)!, percent: s.load.get(id)?.percent ?? null }))
    .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0));
  return candidates[0] ?? null;
}

/** Every problem on the board, by rule. Each has its facts and one action. */
export function findProblems(s: Snapshot): Problem[] {
  const out: Problem[] = [];
  const name = (c: string) => s.clients.find((x) => x.id === c)?.name ?? "the client";
  const awayById = new Map(s.away.map((a) => [a.personId, a]));
  const soon = addDays(s.today, 2);

  for (const t of s.tasks) {
    if (t.status === "done" || !s.clients.some((c) => c.id === t.clientId)) continue;
    const owner = t.ownerName ?? "nobody";
    const away = t.ownerId ? awayById.get(t.ownerId) : undefined;
    if (away && t.dueDate && t.dueDate >= s.today && t.dueDate <= away.until && t.dueDate <= soon) {
      const to = spare(s, t.clientId, t.ownerId);
      if (to) {
        out.push({ kind: "owner_away", key: `owner_away:${t.id}`, clientId: t.clientId, title: `“${t.title}” is due while ${away.personName} is on leave`, why: [`Due ${when(t.dueDate)}`, `${away.personName} is on leave until ${when(away.until)}`, `${to.name} works on ${name(t.clientId)}${to.percent !== null ? ` and is at ${to.percent}% this week` : ""}`], action: { type: "reassign", taskId: t.id, taskTitle: t.title, personId: to.id, personName: to.name } });
        continue;
      }
    }
    if (t.dueDate && t.dueDate < s.today) {
      const late = diffDays(t.dueDate, s.today);
      out.push({ kind: "overdue", key: `overdue:${t.id}`, clientId: t.clientId, title: `“${t.title}” is ${late === 1 ? "a day" : `${late} days`} late`, why: [`Was due ${when(t.dueDate)}, ${ago(late)}`, `Owner: ${owner}`, `Status: ${t.status.replace("_", " ")}`], action: { type: "move_date", taskId: t.id, taskTitle: t.title, date: s.workingDay(addDays(s.today, 2)) } });
      continue;
    }
    if (t.status === "blocked" && t.blockedSince) {
      const days = Math.floor((s.now.getTime() - t.blockedSince.getTime()) / 86_400_000);
      if (days >= BLOCKED_DAYS)
        out.push({ kind: "blocked", key: `blocked:${t.id}`, clientId: t.clientId, title: `“${t.title}” has been blocked for ${days} days`, why: [`Blocked since ${formatShortDate(t.blockedSince.toISOString().slice(0, 10))}`, `Owner: ${owner}`], action: { type: "ping", text: `${t.ownerName ? `@${t.ownerName} ` : ""}“${t.title}” has been blocked for ${days} days. What does it need to move?` } });
      continue;
    }
    if (!t.ownerId && t.dueDate && t.dueDate <= addDays(s.today, 7)) {
      const to = spare(s, t.clientId, null);
      if (to) out.push({ kind: "unowned", key: `unowned:${t.id}`, clientId: t.clientId, title: `“${t.title}” has no owner`, why: [`Due ${when(t.dueDate)}`, "Nobody owns it", `${to.name} works on ${name(t.clientId)}${to.percent !== null ? ` and is at ${to.percent}% this week` : ""}`], action: { type: "reassign", taskId: t.id, taskTitle: t.title, personId: to.id, personName: to.name } });
    }
  }

  // Overloaded: someone above 130% this week with a teammate on the same client below 70%.
  for (const c of s.clients) {
    for (const id of teamOf(s, c.id)) {
      const l = s.load.get(id);
      if (!l || l.percent === null || l.percent <= OVERLOADED_PERCENT || awayById.has(id)) continue;
      const to = spare(s, c.id, id);
      if (!to || to.percent === null || to.percent >= SPARE_PERCENT) continue;
      const task = s.tasks.filter((t) => t.clientId === c.id && t.ownerId === id && t.status !== "done" && t.dueDate && t.dueDate >= s.today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
      if (!task) continue;
      out.push({ kind: "overloaded", key: `overloaded:${id}:${c.id}`, clientId: c.id, title: `${l.name} is at ${l.percent}% this week`, why: [`${l.name}: ${l.percent}% of capacity this week`, `${to.name}: ${to.percent}%, also on ${c.name}`, `Next due of theirs here: “${task.title}”, ${when(task.dueDate!)}`], action: { type: "reassign", taskId: task.id, taskTitle: task.title, personId: to.id, personName: to.name } });
    }
  }

  for (const a of s.inClientReview) {
    const days = Math.floor((s.now.getTime() - a.since.getTime()) / 86_400_000);
    if (days >= CLIENT_REVIEW_DAYS && s.clients.some((c) => c.id === a.clientId))
      out.push({ kind: "client_review", key: `client_review:${a.id}`, clientId: a.clientId, title: `“${a.title}” has waited ${days} days for ${name(a.clientId)}'s approval`, why: [`Sent for client approval ${ago(days)}`], action: { type: "ping", text: `“${a.title}” has waited ${days} days for ${name(a.clientId)}'s approval. Could whoever talks to them give a gentle nudge?` } });
  }

  for (const c of s.clients) {
    const quiet = c.lastActivityAt ? Math.floor((s.now.getTime() - c.lastActivityAt.getTime()) / 86_400_000) : null;
    if (quiet !== null && quiet >= QUIET_DAYS)
      out.push({ kind: "quiet_client", key: `quiet_client:${c.id}`, clientId: c.id, title: `Nothing has happened on ${c.name} for ${quiet} days`, why: [`Last activity ${formatShortDate(c.lastActivityAt!.toISOString().slice(0, 10))}, ${ago(quiet)}`], action: { type: "flag_owner", text: `${c.name} has had no activity for ${quiet} days.` } });
    if (c.health && (c.health.level === "off_track" || c.health.level === "at_risk"))
      out.push({ kind: "results_behind", key: `results_behind:${c.id}`, clientId: c.id, title: `${c.name}'s results are ${c.health.level === "off_track" ? "off track" : "at risk"} this month`, why: c.health.reasons.length ? c.health.reasons : ["Behind this month's targets"], action: { type: "flag_owner", text: `${c.name} is ${c.health.level === "off_track" ? "off track" : "at risk"}: ${c.health.reasons.join("; ") || "behind target"}.` } });
    // Content calendar gap: nothing planned next week, for a client that plans posts.
    if (c.nextWeekPosts === 0 && c.avgWeeklyPosts !== null && c.avgWeeklyPosts > 0 && c.activeProjectId) {
      const n = Math.min(7, Math.max(1, Math.round(c.avgWeeklyPosts)));
      const monday = addDays(s.today, ((8 - new Date(`${s.today}T00:00:00Z`).getUTCDay()) % 7) || 7);
      out.push({
        kind: "calendar_gap",
        key: `calendar_gap:${c.id}:${monday}`,
        clientId: c.id,
        title: `No posts are planned for ${c.name} next week`,
        why: [`0 posts planned for the week of ${when(monday)}`, `About ${Math.round(c.avgWeeklyPosts)} a week over the last four weeks`],
        action: Array.from({ length: n }, (_, i) => ({ type: "create_task" as const, projectId: c.activeProjectId!, title: `Plan post ${i + 1} for the week of ${when(monday)}`, dueDate: s.workingDay(addDays(s.today, 2)) })),
      });
    }
  }
  // A client waiting at least a working day for a reply in their shared chat (12.6): a teammate is asked to answer.
  for (const w of s.clientWaiting ?? []) {
    const c = s.clients.find((x) => x.id === w.clientId);
    if (!c) continue;
    const since = w.since.toISOString().slice(0, 10);
    if (s.workingDay(addDays(since, 1)) > s.today) continue;
    const to = spare(s, c.id, null);
    const hours = Math.floor((s.now.getTime() - w.since.getTime()) / 3_600_000);
    out.push({ kind: "client_waiting", key: `client_waiting:${c.id}:${since}`, clientId: c.id, title: `${c.name} has waited ${hours >= 48 ? `${Math.floor(hours / 24)} days` : `${hours} hours`} for a reply`, why: [`Their message in the client chat since ${when(since)}`, "No reply from the team after it"], action: { type: "ping", text: `${to ? `@${to.name} ` : ""}${c.name} has been waiting since ${when(since)} for a reply in the client chat. Could you answer them?` } });
  }
  for (const g of s.goalsOffTrack ?? []) {
    const c = s.clients.find((x) => x.id === g.spaceId);
    if (!c) continue;
    out.push({ kind: "goal_off_track", key: `goal_off_track:${g.id}:${s.today.slice(0, 7)}`, clientId: c.id, title: `The goal “${g.title}” is off track`, why: g.reasons.length ? g.reasons : ["Behind the pace for this period"], action: { type: "flag_owner", text: `${c.name}'s goal “${g.title}” is off track: ${g.reasons.join("; ") || "behind the pace"}. A check-in with what will change would help.` } });
  }
  return out;
}

export type Card = { kind: CoworkerKind | "mixed"; clientId: string; keys: string[]; title: string; why: string[]; actions: CardAction[] };

/**
 * Problems for one chat as cards: one per kind (three late tasks make one card with Approve all), at most three cards,
 * the rest in one "also worth a look" card. Severity order decides which come first.
 */
export function toCards(problems: readonly Problem[]): Card[] {
  const ORDER: CoworkerKind[] = ["client_waiting", "owner_away", "overdue", "blocked", "results_behind", "unowned", "overloaded", "client_review", "goal_off_track", "calendar_gap", "quiet_client"];
  const byKind = new Map<CoworkerKind, Problem[]>();
  for (const p of problems) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p]);
  const cards: Card[] = ORDER.filter((k) => byKind.has(k)).map((kind) => {
    const ps = byKind.get(kind)!;
    return {
      kind,
      clientId: ps[0]!.clientId,
      keys: ps.map((p) => p.key),
      title: ps.length === 1 ? ps[0]!.title : `${ps.length} × ${COWORKER_KIND_LABELS[kind].toLowerCase()}`,
      why: ps.length === 1 ? ps[0]!.why : ps.map((p) => `${p.title}: ${p.why.join(", ")}`),
      actions: ps.flatMap((p) => (Array.isArray(p.action) ? p.action : [p.action])),
    };
  });
  if (cards.length <= MAX_CARDS_PER_CHAT) return cards;
  const rest = cards.slice(MAX_CARDS_PER_CHAT - 1);
  return [...cards.slice(0, MAX_CARDS_PER_CHAT - 1), { kind: "mixed", clientId: rest[0]!.clientId, keys: rest.flatMap((c) => c.keys), title: `Also worth a look (${rest.reduce((n, c) => n + c.actions.length, 0)})`, why: rest.flatMap((c) => c.why), actions: rest.flatMap((c) => c.actions) }];
}

/** Learning (D-12.5c): of the last ten answers for a kind and client, eight or more dismissed → that kind goes quiet. */
export function quietKind(lastAnswers: ReadonlyArray<"approved" | "dismissed">): boolean {
  const last = lastAnswers.slice(0, LEARN_WINDOW);
  return last.length >= LEARN_WINDOW && last.filter((a) => a === "dismissed").length >= LEARN_DISMISSED;
}

/** Snooze choices → the day it wakes (and whether a client reply wakes it sooner). */
export function snoozeUntil(choice: "monday" | "3_days" | "client_reply", today: IsoDate, workingDay: (d: IsoDate) => IsoDate): { until: IsoDate; onClientReply: boolean } {
  if (choice === "3_days") return { until: workingDay(addDays(today, 3)), onClientReply: false };
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  if (choice === "monday") return { until: addDays(today, ((8 - dow) % 7) || 7), onClientReply: false };
  return { until: addDays(today, 7), onClientReply: true };
}

/** The Monday digest's light: red off track or many late, amber at risk or some late or quiet, else green. */
export function digestLight(d: { health: string | null; overdue: number; quietDays: number | null }): "🟢" | "🟡" | "🔴" {
  if (d.health === "off_track" || d.overdue >= 5) return "🔴";
  if (d.health === "at_risk" || d.overdue > 0 || (d.quietDays !== null && d.quietDays >= QUIET_DAYS)) return "🟡";
  return "🟢";
}
