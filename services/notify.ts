// The event bus (Stage 8.1, D82): every committed change already writes events; these rules turn some of them into
// notifications for the people who need to act, inside the same transaction. Never the person who acted.
import { newId } from "@/lib/id";
import type { NewEvent, NotificationWrite, Repositories } from "@/repositories";
import { spaceGuard } from "./spaces";

type Rule = (repos: Repositories, e: NewEvent, batch: readonly NewEvent[]) => Promise<NotificationWrite[]>;

const name = async (repos: Repositories, id: string | null | undefined) => (id ? ((await repos.people.findById(id))?.fullName ?? "Someone") : "Someone");
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** The client's lead strategist reviews its creatives. */
async function reviewersOf(repos: Repositories, clientId: string | null | undefined): Promise<string[]> {
  if (!clientId) return [];
  const client = await repos.clients.findById(clientId, { kind: "all" });
  return client?.leadStrategist ? [client.leadStrategist.id] : [];
}

/** Whoever makes the creative: the owner of its task, and whoever added it. */
async function makersOf(repos: Repositories, assetId: string): Promise<string[]> {
  const a = await repos.assets.findById(assetId, { kind: "all" });
  return a ? [a.taskOwnerId, a.createdById].filter((x): x is string => Boolean(x)) : [];
}

/** Everyone on a task (Stage 9b.2): owner, reviewer, other assignees and watchers; or only the watchers. */
async function onTask(repos: Repositories, taskId: string, only?: "watcher"): Promise<string[]> {
  const [t, people] = await Promise.all([repos.tasks.findById(taskId, { kind: "all" }), repos.tasks.people(taskId)]);
  if (!t) return [];
  const ids = only ? people.filter((p) => p.role === only).map((p) => p.personId) : [t.ownerId, t.reviewerId, ...people.map((p) => p.personId)];
  return [...new Set(ids.filter((x): x is string => Boolean(x)))];
}

const STATUS_WORDS: Record<string, string> = { todo: "back to To do", in_progress: "in progress", in_review: "ready for review", blocked: "blocked", done: "done" };

/** Watchers hear when a task moves: finished, reopened, or a new status. */
const statusRule: Rule = async (repos, e) => {
  const title = str(e.data?.title) ?? "A task";
  const to = str(e.data?.to) ?? (e.action === "task.completed" ? "done" : null);
  const words = to ? (STATUS_WORDS[to] ?? to) : "reopened";
  return (await onTask(repos, e.entityId, "watcher")).map((personId) => ({ personId, kind: "task.watched", title: `${title} is ${words}`, link: `/tasks/${e.entityId}` }));
};

const RULES: Record<string, Rule> = {
  "leave.requested": async (repos, e, batch) => {
    // Auto-approved (the owner's own, or recorded by HR) needs nobody.
    if (batch.some((b) => b.entityId === e.entityId && b !== e)) return [];
    const r = await repos.leave.findRequest(e.entityId);
    if (!r?.approverId) return [];
    return [{ personId: r.approverId, kind: "leave.requested", title: `${await name(repos, r.personId)} asked for leave`, link: "/leave/approvals" }];
  },
  "leave.approved": async (repos, e) => (e.personId ? [{ personId: e.personId, kind: "leave.approved", title: "Your leave was approved", link: "/leave" }] : []),
  "leave.rejected": async (repos, e) => (e.personId ? [{ personId: e.personId, kind: "leave.rejected", title: "Your leave request was declined", body: str(e.data?.note), link: "/leave" }] : []),
  "lead.auto_assigned": async (repos, e) => {
    const to = str(e.data?.to);
    return to ? [{ personId: to, kind: "lead.assigned", title: `New lead for you: ${str(e.data?.name) ?? "a lead"}`, link: `/sales/leads/${e.entityId}` }] : [];
  },
  "task.created": async (repos, e) => {
    const owner = str(e.data?.ownerId);
    return owner && !e.data?.recurring ? [{ personId: owner, kind: "task.assigned", title: `New task: ${str(e.data?.title) ?? "a task"}`, link: `/tasks/${e.entityId}` }] : [];
  },
  "task.reassigned": async (repos, e) => {
    const to = str(e.data?.to);
    return to ? [{ personId: to, kind: "task.assigned", title: "A task was given to you", link: `/tasks/${e.entityId}` }] : [];
  },
  "task.commented": async (repos, e) => {
    const mentioned = Array.isArray(e.data?.mentions) ? (e.data.mentions as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const who = await name(repos, e.actorId);
    const title = str(e.data?.title) ?? "a task";
    const body = str(e.data?.excerpt);
    const link = `/tasks/${e.entityId}`;
    const rest = (await onTask(repos, e.entityId)).filter((p) => !mentioned.includes(p));
    return [
      ...mentioned.map((personId) => ({ personId, kind: "task.mentioned", title: `${who} mentioned you on ${title}`, body, link })),
      ...rest.map((personId) => ({ personId, kind: "task.comment", title: `${who} commented on ${title}`, body, link })),
    ];
  },
  "task.person_added": async (repos, e) => {
    const personId = str(e.data?.personId);
    if (!personId) return [];
    const title = str(e.data?.title) ?? "a task";
    const who = await name(repos, e.actorId);
    return [{ personId, kind: e.data?.role === "assignee" ? "task.assigned" : "task.watched", title: e.data?.role === "assignee" ? `${who} added you to ${title}` : `${who} asked you to watch ${title}`, link: `/tasks/${e.entityId}` }];
  },
  "task.completed": async (repos, e, batch) => {
    // Whoever does a task that waited on this one can start now (when nothing else holds it up).
    const waiting = (await repos.tasks.dependencyLinks([e.entityId])).filter((l) => l.dependsOnId === e.entityId);
    const ready: NotificationWrite[] = [];
    for (const l of waiting) {
      const t = await repos.tasks.findById(l.taskId, { kind: "all" });
      if (!t || t.status === "done") continue;
      const others = (await repos.tasks.dependencyLinks([t.id])).filter((x) => x.taskId === t.id && x.dependsOnId !== e.entityId);
      const open = others.length ? (await repos.tasks.list({ scope: { kind: "all" }, ids: others.map((x) => x.dependsOnId) })).filter((x) => x.status !== "done") : [];
      if (open.length) continue;
      for (const personId of [t.ownerId, ...t.assignees.map((a) => a.id)].filter((x): x is string => Boolean(x))) {
        ready.push({ personId, kind: "task.unblocked", title: `Ready to start: ${t.title}`, body: "Everything it waited on is done.", link: `/tasks/${t.id}` });
      }
    }
    return [...ready, ...(await statusRule(repos, e, batch))];
  },
  "task.reopened": statusRule,
  "task.status_changed": statusRule,
  "asset.submit": async (repos, e) => (await reviewersOf(repos, e.clientId)).map((personId) => ({ personId, kind: "asset.review", title: "A creative is ready for your review", link: `/creatives/${e.entityId}` })),
  "asset.created": async (repos, e) => (e.data?.submitted ? RULES["asset.submit"]!(repos, e, []) : []),
  "asset.version_added": async (repos, e) => (e.data?.submitted ? RULES["asset.submit"]!(repos, e, []) : []),
  "asset.request_changes": async (repos, e) => (await makersOf(repos, e.entityId)).map((personId) => ({ personId, kind: "asset.changes", title: "Changes asked on your creative", body: str(e.data?.note), link: `/creatives/${e.entityId}` })),
  "asset.approve": async (repos, e) => (await makersOf(repos, e.entityId)).map((personId) => ({ personId, kind: "asset.approved", title: "Your creative was approved", link: `/creatives/${e.entityId}` })),
};
RULES["content.ready"] = async (repos, e) => {
  const item = await repos.content.findById(e.entityId);
  return item?.ownerId ? [{ personId: item.ownerId, kind: "content.ready", title: `Ready to publish: ${item.title}`, link: `/clients/${item.clientId}/calendar?month=${item.publishOn.slice(0, 7)}` }] : [];
};
/** Approved leave: the leads of the clients whose tasks fall due while the person is away arrange cover (plan/3). */
async function leaveCover(repos: Repositories, e: NewEvent): Promise<NotificationWrite[]> {
  const r = await repos.leave.findRequest(e.entityId);
  if (!r) return [];
  const due = await repos.tasks.list({ scope: { kind: "all" }, ownerId: r.personId, statuses: ["todo", "in_progress", "in_review", "blocked"], dueFrom: r.startDate, dueTo: r.endDate, anyLevel: true });
  const byLead = new Map<string, number>();
  for (const t of due) {
    const lead = (await repos.clients.findById(t.clientId, { kind: "all" }))?.leadStrategist?.id;
    if (lead && lead !== r.personId) byLead.set(lead, (byLead.get(lead) ?? 0) + 1);
  }
  const who = await name(repos, r.personId);
  return [...byLead].map(([personId, n]) => ({
    personId,
    kind: "leave.cover",
    title: `${who} is on leave ${r.startDate === r.endDate ? r.startDate : `${r.startDate} to ${r.endDate}`}`,
    body: `${n} ${n === 1 ? "task falls" : "tasks fall"} due then: plan cover.`,
    link: "/board",
  }));
}
const leaveApproved = RULES["leave.approved"]!;
RULES["leave.approved"] = async (repos, e, batch) => [...(await leaveApproved(repos, e, batch)), ...(await leaveCover(repos, e))];
/** Access to spaces (Stage 14.2): approvers hear of requests; members read what they got; the owner hears of sensitive grants. */
const keepers = async (repos: Repositories) => (await repos.people.listActive()).filter((p) => p.roles.includes("owner") || p.roles.includes("hr"));
RULES["space.access_requested"] = async (repos, e) => {
  const d = e.data ?? {};
  return (await keepers(repos)).map((p) => ({ personId: p.id, kind: "space.access_requested", title: `Access to approve: ${str(d.name)} in ${str(d.space)} (${str(d.level)})`, body: d.sensitive ? "Sensitive space: the owner and HR both take part." : null, link: "/spaces/access" }));
};
RULES["space.access_approved"] = async (repos, e) => {
  const d = e.data ?? {};
  const out: NotificationWrite[] = [{ personId: e.personId!, kind: "space.access_granted", title: `Access to ${str(d.space)}: read it and press "I understand"`, body: str(d.message), link: "/me/access" }];
  const asker = str(d.requestedById);
  if (asker) out.push({ personId: asker, kind: "space.access_decided", title: `Approved: ${str(d.name)} in ${str(d.space)}`, link: "/spaces/access" });
  if (d.sensitive) for (const p of await keepers(repos)) if (p.roles.includes("owner") && p.id !== asker) out.push({ personId: p.id, kind: "space.access_sensitive", title: `Sensitive access approved: ${str(d.name)} in ${str(d.space)} (${str(d.level)})`, body: d.ownerAlone ? "Approved by the owner alone: there is no HR person." : null, link: "/spaces/access" });
  return out;
};
RULES["space.access_refused"] = async (repos, e) => {
  const asker = str(e.data?.requestedById);
  return asker ? [{ personId: asker, kind: "space.access_decided", title: `Refused: ${str(e.data?.name)} in ${str(e.data?.space)}`, body: str(e.data?.note), link: "/spaces/access" }] : [];
};
const accessEnded = (why: string): Rule => async (repos, e) =>
  e.personId ? [{ personId: e.personId, kind: "space.access_ended", title: `Your access to ${str(e.data?.space)} ${why}`, body: str(e.data?.note), link: "/me/access" }] : [];
RULES["space.access_removed"] = accessEnded("was removed");
RULES["space.access_expired"] = accessEnded("has ended");
/** Idea Boards (Stage 13.1): @mentions in a board comment, and the board's maker hears of comments. */
RULES["board.commented"] = async (repos, e) => {
  const mentioned = Array.isArray(e.data?.mentions) ? (e.data.mentions as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const who = await name(repos, e.actorId);
  const title = str(e.data?.title) ?? "a board";
  const body = str(e.data?.excerpt);
  const link = `/boards/${e.entityId}${e.data?.elementId ? `?on=${encodeURIComponent(String(e.data.elementId))}` : ""}`;
  const maker = str(e.data?.createdById);
  return [
    ...mentioned.map((personId) => ({ personId, kind: "board.mentioned", title: `${who} mentioned you on the board ${title}`, body, link })),
    ...(maker && !mentioned.includes(maker) ? [{ personId: maker, kind: "board.comment", title: `${who} commented on your board ${title}`, body, link }] : []),
  ];
};
/** Docs (Stage 13.4): @mentions in a page or a page comment (the service already kept only people who can open it). */
RULES["doc.mentioned"] = async (repos, e) => {
  const mentioned = Array.isArray(e.data?.mentions) ? (e.data.mentions as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const who = await name(repos, e.actorId);
  return mentioned.map((personId) => ({ personId, kind: "doc.mentioned", title: `${who} mentioned you in ${str(e.data?.title) ?? "a page"}`, body: str(e.data?.excerpt), link: `/docs/${e.entityId}` }));
};
RULES["doc.commented"] = async (repos, e) => {
  const to = Array.isArray(e.data?.notify) ? (e.data.notify as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const who = await name(repos, e.actorId);
  return to.map((personId) => ({ personId, kind: "doc.comment", title: `${who} commented on your page ${str(e.data?.title) ?? ""}`.trim(), body: str(e.data?.excerpt), link: `/docs/${str(e.data?.docId) ?? ""}` }));
};
RULES["asset.client_changes"] = RULES["asset.request_changes"]!;
RULES["asset.client_approved"] = RULES["asset.approve"]!;

/** Called by commit() with the events it just recorded. */
export async function dispatch(repos: Repositories, events: readonly NewEvent[]): Promise<void> {
  const rows: Array<NotificationWrite & { id: string }> = [];
  // Nobody hears about a private space they aren't in, not even its task titles (Stage 14.1); emails come from these.
  const outside = spaceGuard(repos);
  for (const e of events) {
    const rule = RULES[e.action];
    if (!rule) continue;
    for (const n of await rule(repos, e, events)) {
      if (n.personId === e.actorId || rows.some((r) => r.personId === n.personId && r.kind === n.kind && r.link === n.link)) continue;
      if (e.clientId && (await outside(n.personId, e.clientId))) continue;
      rows.push({ id: newId(), entityType: e.entityType, entityId: e.entityId, ...n });
    }
  }
  await repos.notifications.create(rows);
}
