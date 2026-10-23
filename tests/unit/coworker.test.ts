// The AI co-worker's rules (Stage 12.5): each problem is found with its facts, look-alikes aren't; cards per chat;
// learning; snoozes; the digest's light.
import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { digestLight, findProblems, quietKind, snoozeUntil, toCards, type Problem, type Snapshot, type SnapTask } from "@/services/rules/coworker";

const today = "2026-10-21"; // a Wednesday
const now = new Date(`${today}T06:30:00Z`);
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const task = (t: Partial<SnapTask> & { id: string }): SnapTask => ({ title: t.id, clientId: "z", ownerId: "anu", ownerName: "Anu", status: "in_progress", dueDate: addDays(today, 5), blockedSince: null, ...t });

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    today,
    now,
    clients: [{ id: "z", name: "Zenith", leadStrategistId: "lead", lastActivityAt: daysAgo(1), health: { level: "on_track", reasons: [] }, nextWeekPosts: 3, avgWeeklyPosts: 3, activeProjectId: "p1" }],
    tasks: [],
    inClientReview: [],
    away: [],
    load: new Map([
      ["anu", { name: "Anu", percent: 80 }],
      ["ravi", { name: "Ravi", percent: 40 }],
      ["lead", { name: "Lead", percent: 90 }],
    ]),
    people: new Map([
      ["anu", "Anu"],
      ["ravi", "Ravi"],
      ["lead", "Lead"],
    ]),
    workingDay: (d) => d,
    ...over,
  };
}
const kinds = (ps: Problem[]) => ps.map((p) => p.kind);

describe("what the co-worker notices", () => {
  it("a space's goal off track (14.3), in that space's chat only; not for a space it can't post in", () => {
    const ps = findProblems(snap({ goalsOffTrack: [{ id: "g1", spaceId: "z", title: "Hire 4 people", reasons: ["25% of the pace expected by now"] }, { id: "g2", spaceId: "gone", title: "Other", reasons: [] }] }));
    expect(ps).toEqual([expect.objectContaining({ kind: "goal_off_track", key: "goal_off_track:g1:2026-10", clientId: "z", title: "The goal “Hire 4 people” is off track", why: ["25% of the pace expected by now"] })]);
  });
  it("late tasks, with the facts and a new date; not tasks due today or done", () => {
    const ps = findProblems(snap({ tasks: [task({ id: "late", dueDate: "2026-10-17" }), task({ id: "today", dueDate: today }), task({ id: "done", dueDate: "2026-10-10", status: "done" })] }));
    expect(ps).toEqual([expect.objectContaining({ kind: "overdue", key: "overdue:late", why: ["Was due 17 Oct, 4 days ago", "Owner: Anu", "Status: in progress"], action: { type: "move_date", taskId: "late", taskTitle: "late", date: "2026-10-23" } })]);
  });

  it("blocked for three days or more; unowned work due within a week goes to the least-loaded teammate", () => {
    const ps = findProblems(snap({ tasks: [task({ id: "stuck", status: "blocked", blockedSince: daysAgo(4) }), task({ id: "fresh", status: "blocked", blockedSince: daysAgo(1) }), task({ id: "nobody", ownerId: null, ownerName: null, dueDate: addDays(today, 3) }), task({ id: "ravi's", ownerId: "ravi", ownerName: "Ravi" }), task({ id: "later", ownerId: null, ownerName: null, dueDate: addDays(today, 20) })] }));
    expect(kinds(ps)).toEqual(["blocked", "unowned"]);
    expect(ps[1]!.action).toMatchObject({ type: "reassign", taskId: "nobody", personId: "ravi" });
  });

  it("an owner on leave while their task is due goes to a teammate who isn't away", () => {
    const ps = findProblems(snap({ tasks: [task({ id: "poster", dueDate: addDays(today, 1) }), task({ id: "r", ownerId: "ravi", ownerName: "Ravi" })], away: [{ personId: "anu", personName: "Anu", until: addDays(today, 2) }] }));
    expect(ps[0]).toMatchObject({ kind: "owner_away", action: { type: "reassign", taskId: "poster", personId: "ravi" } });
    expect(ps[0]!.why).toContain("Anu is on leave until 23 Oct");
  });

  it("someone overloaded next to a teammate with room on the same client", () => {
    const load = new Map([
      ["anu", { name: "Anu", percent: 150 }],
      ["ravi", { name: "Ravi", percent: 40 }],
      ["lead", { name: "Lead", percent: 100 }],
    ]);
    const ps = findProblems(snap({ load, tasks: [task({ id: "a" }), task({ id: "r", ownerId: "ravi", ownerName: "Ravi" })] }));
    expect(ps).toEqual([expect.objectContaining({ kind: "overloaded", action: expect.objectContaining({ taskId: "a", personId: "ravi" }) })]);
    // Nobody with room: nothing to suggest.
    expect(findProblems(snap({ load: new Map([["anu", { name: "Anu", percent: 150 }], ["ravi", { name: "Ravi", percent: 90 }]]), tasks: [task({ id: "a" }), task({ id: "r", ownerId: "ravi" })] }))).toEqual([]);
  });

  it("client approval waiting, a quiet client, results behind, and a content gap", () => {
    const ps = findProblems(
      snap({
        clients: [{ id: "z", name: "Zenith", leadStrategistId: "lead", lastActivityAt: daysAgo(12), health: { level: "off_track", reasons: ["Leads 10 of 60"] }, nextWeekPosts: 0, avgWeeklyPosts: 2.6, activeProjectId: "p1" }],
        inClientReview: [{ id: "c1", title: "Reel", clientId: "z", since: daysAgo(6) }, { id: "c2", title: "Post", clientId: "z", since: daysAgo(2) }],
      }),
    );
    expect(kinds(ps)).toEqual(["client_review", "quiet_client", "results_behind", "calendar_gap"]);
    expect(ps[2]!.why).toEqual(["Leads 10 of 60"]);
    expect(ps[3]!.action).toHaveLength(3);
    expect((ps[3]!.action as Array<{ type: string; title: string }>)[0]).toMatchObject({ type: "create_task", title: "Plan post 1 for the week of 26 Oct" });
    // A client that never plans posts has no gap.
    expect(kinds(findProblems(snap({ clients: [{ ...snap().clients[0]!, nextWeekPosts: 0, avgWeeklyPosts: null }] })))).toEqual([]);
  });
});

describe("cards, learning, snoozes and the digest", () => {
  it("one card per kind (Approve all), at most three per chat, the rest in one", () => {
    const p = (kind: Problem["kind"], key: string): Problem => ({ kind, key, clientId: "z", title: key, why: [key], action: { type: "ping", text: key } });
    const cards = toCards([p("overdue", "o1"), p("overdue", "o2"), p("overdue", "o3"), p("blocked", "b"), p("quiet_client", "q"), p("unowned", "u")]);
    expect(cards.map((c) => [c.kind, c.actions.length])).toEqual([
      ["overdue", 3],
      ["blocked", 1],
      ["mixed", 2],
    ]);
    expect(cards[0]!.title).toBe("3 × late tasks");
  });

  it("goes quiet after eight dismissals in the last ten answers, not before", () => {
    expect(quietKind([...Array(8).fill("dismissed"), "approved", "approved"])).toBe(true);
    expect(quietKind([...Array(7).fill("dismissed"), "approved", "approved", "approved"])).toBe(false);
    expect(quietKind(Array(9).fill("dismissed"))).toBe(false);
  });

  it("snoozes to Monday, three days, or the client's reply (a week at most)", () => {
    const wd = (d: string) => d;
    expect(snoozeUntil("monday", today, wd)).toEqual({ until: "2026-10-26", onClientReply: false });
    expect(snoozeUntil("3_days", today, wd)).toEqual({ until: "2026-10-24", onClientReply: false });
    expect(snoozeUntil("client_reply", today, wd)).toEqual({ until: "2026-10-28", onClientReply: true });
  });

  it("lights the digest", () => {
    expect(digestLight({ health: "off_track", overdue: 0, quietDays: 1 })).toBe("🔴");
    expect(digestLight({ health: null, overdue: 6, quietDays: 1 })).toBe("🔴");
    expect(digestLight({ health: "at_risk", overdue: 0, quietDays: 1 })).toBe("🟡");
    expect(digestLight({ health: null, overdue: 0, quietDays: 12 })).toBe("🟡");
    expect(digestLight({ health: "on_track", overdue: 0, quietDays: 2 })).toBe("🟢");
  });
});
