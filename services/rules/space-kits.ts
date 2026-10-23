// Space kits (Stage 14.4): a new team space starts ready to work. Each kit is a starter project (stages, recurring
// tasks, one-off tasks), Docs pages, team goals and a board, plus whether the space should be private and sensitive
// and the access level suggested for its members. Pure data and rules, unit-tested; nothing here names a person:
// every task and goal starts unowned until the owner or HR picks someone (D-14.4a).
import type { AccessLevel, ContentChannel, GoalPeriod, GoalSource, GoalUnit } from "@/lib/types";
import { columnsScene, STICKY_COLOURS, templateScene } from "./board-templates";
import { meetingBody } from "./doc-templates";
import { DEFAULT_JOINING } from "./checklists";

export type KitItem =
  | { key: string; kind: "project"; name: string; stages: string[]; description: string }
  | { key: string; kind: "recurring"; title: string; description: string; frequency: "weekly" | "monthly"; weekday?: number; dayOfMonth?: number; leadWorkingDays: number }
  | { key: string; kind: "task"; title: string; description: string; dueInDays: number }
  | { key: string; kind: "doc"; title: string; body: string }
  | { key: string; kind: "goal"; title: string; unit: GoalUnit; target: number; period: GoalPeriod; source: GoalSource }
  | { key: string; kind: "board"; title: string; scene: (makeId: () => string) => { elements: unknown[] } }
  // Stage 14.5 (Oppllo Marketing): mark the space as Oppllo's own marketing; this month's results targets; next month's
  // content calendar as ideas.
  | { key: string; kind: "self" }
  | { key: string; kind: "results_targets"; leads: number; won: number }
  | { key: string; kind: "content"; posts: Array<{ title: string; channel: ContentChannel; day: number }> };
export type SpaceKit = { key: KitKey; name: string; description: string; private: boolean; memberLevel: AccessLevel; tags: string[]; items: KitItem[] };

export const KIT_KEYS = ["finance", "hr", "sales", "marketing", "founder", "operations"] as const;
export type KitKey = (typeof KIT_KEYS)[number];

/** What the owner may change in a kit (kept in settings): items left out, recurring days, goal targets. */
export type KitOverrides = { off?: string[]; days?: Record<string, number>; targets?: Record<string, number> };

const C = STICKY_COLOURS;
const checklist = (items: readonly string[]) => items.map((i) => `- [ ] ${i}`).join("\n");

export const SPACE_KITS: Record<KitKey, SpaceKit> = {
  finance: {
    key: "finance",
    name: "Finance",
    description: "GST and TDS dates, the monthly invoice run and follow-ups, payroll and expense checks, month-end close.",
    private: true,
    memberLevel: "edit",
    tags: ["finance"],
    items: [
      { key: "project", kind: "project", name: "Finance: monthly compliance and close", stages: ["This month", "Filed or paid", "Closed"], description: "Statutory dates, invoicing and the month-end close." },
      { key: "tds", kind: "recurring", title: "Pay TDS for last month (due by the 7th)", description: "Challan 281 on the income-tax portal; keep the challan in Finance files.", frequency: "monthly", dayOfMonth: 7, leadWorkingDays: 2 },
      { key: "gstr1", kind: "recurring", title: "File GSTR-1 (due by the 11th)", description: "Outward supplies for last month. Check the invoice list against Zoho Books first.", frequency: "monthly", dayOfMonth: 11, leadWorkingDays: 2 },
      { key: "gstr3b", kind: "recurring", title: "File GSTR-3B and pay GST (due by the 20th)", description: "Match input tax credit with GSTR-2B before filing.", frequency: "monthly", dayOfMonth: 20, leadWorkingDays: 2 },
      { key: "invoices", kind: "recurring", title: "Monthly invoice run", description: "Make the month's invoices as Zoho drafts from each client's Billing card (Oppllo One never sends them); review and send from Zoho.", frequency: "monthly", dayOfMonth: 1, leadWorkingDays: 0 },
      { key: "followups", kind: "recurring", title: "Payment follow-ups", description: "Unpaid invoices over 15 days: call or message the client's contact and note it on the client.", frequency: "weekly", weekday: 2, leadWorkingDays: 0 },
      { key: "payroll", kind: "recurring", title: "Payroll check before month end", description: "Attendance, leave and salary changes checked before salaries go out.", frequency: "monthly", dayOfMonth: 25, leadWorkingDays: 1 },
      { key: "expenses", kind: "recurring", title: "Expense review", description: "Last month's expenses against budget; tools nobody uses.", frequency: "monthly", dayOfMonth: 5, leadWorkingDays: 0 },
      { key: "close_doc", kind: "doc", title: "Month-end close checklist", body: `:::note\nWork through this in the first week of the month. Keep amounts in Zoho Books; this page is the checklist.\n:::\n\n## Before the 7th\n\n${checklist(["TDS paid and challan filed", "Bank statements downloaded", "All invoices for the month raised (drafts reviewed and sent from Zoho)"])}\n\n## Before the 20th\n\n${checklist(["GSTR-1 filed", "Input tax credit matched with GSTR-2B", "GSTR-3B filed and GST paid"])}\n\n## Close\n\n${checklist(["Receivables over 30 days listed with next step", "Expenses categorised", "Payroll reconciled", "Month closed in Zoho Books"])}` },
      { key: "collections", kind: "goal", title: "Collections ≥ 95% of invoiced", unit: "percent", target: 95, period: "quarter", source: "manual" },
      { key: "board", kind: "board", title: "Spend, save, invest", scene: (id) => columnsScene([{ name: "Spend less on", stickies: ["Add an idea"], colour: C.pink }, { name: "Save by", stickies: ["Add an idea"], colour: C.yellow }, { name: "Invest in", stickies: ["Add an idea"], colour: C.green }], id) },
    ],
  },
  hr: {
    key: "hr",
    name: "HR",
    description: "A hiring pipeline, onboarding, attendance and quarterly reviews, policy upkeep.",
    private: true,
    memberLevel: "edit",
    tags: ["hr"],
    items: [
      { key: "project", kind: "project", name: "Hiring pipeline", stages: ["Sourcing", "Screening", "Interview", "Offer", "Joined"], description: "One task per candidate; move it through the stages." },
      { key: "attendance", kind: "recurring", title: "Monthly attendance review", description: "Late marks, missing check-ins and leave balances on Attendance; talk to anyone with a pattern.", frequency: "monthly", dayOfMonth: 3, leadWorkingDays: 0 },
      { key: "policies", kind: "recurring", title: "Policy updates", description: "Anything in the handbook out of date? Leave rules, holidays, tools, WFH.", frequency: "monthly", dayOfMonth: 15, leadWorkingDays: 0 },
      { key: "reviews", kind: "task", title: "Quarterly reviews for everyone", description: "One-to-ones and growth pages; book a slot with each person.", dueInDays: 75 },
      { key: "onboarding_doc", kind: "doc", title: "Onboarding checklist", body: `:::tip\nEach new joiner also gets their own joining checklist on their People page.\n:::\n\n## Before day one\n\n${checklist(DEFAULT_JOINING.slice(0, 5))}\n\n## First week\n\n${checklist(DEFAULT_JOINING.slice(5))}` },
      { key: "hire", kind: "goal", title: "Hire N people by the end of the quarter", unit: "count", target: 0, period: "quarter", source: "hires" },
      { key: "board", kind: "board", title: "Hiring plan", scene: (id) => columnsScene(["Roles we need", "Where to find them", "Interview questions"].map((name) => ({ name, stickies: ["Add one"], colour: C.blue })), id) },
    ],
  },
  sales: {
    key: "sales",
    name: "Sales",
    description: "Weekly pipeline review, follow-up hygiene, monthly targets, objection handling.",
    private: false,
    memberLevel: "edit",
    tags: ["sales"],
    items: [
      { key: "project", kind: "project", name: "Sales rhythm", stages: ["This week", "Following up", "Done"], description: "The team's regular sales work; leads themselves live in Sales." },
      { key: "pipeline", kind: "recurring", title: "Weekly pipeline review", description: "Every open lead: stage right, next follow-up set, owner clear. Sales → Pipeline.", frequency: "weekly", weekday: 1, leadWorkingDays: 0 },
      { key: "hygiene", kind: "recurring", title: "Follow-up hygiene", description: "Leads with no follow-up date or overdue ones: set a date or close them.", frequency: "weekly", weekday: 4, leadWorkingDays: 0 },
      { key: "targets", kind: "recurring", title: "Set this month's sales targets", description: "Calls, meetings and won deals per person for the month.", frequency: "monthly", dayOfMonth: 1, leadWorkingDays: 0 },
      { key: "won", kind: "goal", title: "Won deals this month", unit: "count", target: 0, period: "month", source: "won_leads" },
      { key: "board", kind: "board", title: "Objection handling", scene: (id) => columnsScene([{ name: "Objection", stickies: ["“Too expensive”", "“We tried ads before”"], colour: C.pink }, { name: "What they really mean", stickies: ["Add one"], colour: C.yellow }, { name: "Our answer", stickies: ["Add one"], colour: C.green }, { name: "Proof", stickies: ["Case study", "Numbers from a similar college"], colour: C.blue }], id) },
    ],
  },
  marketing: {
    key: "marketing",
    name: "Oppllo Marketing",
    description: "Oppllo's own content calendar, campaign planning and case studies.",
    private: false,
    memberLevel: "edit",
    tags: ["content", "ads"],
    items: [
      { key: "project", kind: "project", name: "Oppllo's own marketing", stages: ["Ideas", "Making", "Published"], description: "Content, campaigns and case studies for Oppllo itself." },
      { key: "calendar", kind: "recurring", title: "Plan next month's content calendar", description: "Reels, posts and stories for Oppllo's pages, on the content calendar.", frequency: "monthly", dayOfMonth: 22, leadWorkingDays: 1 },
      { key: "casestudy", kind: "recurring", title: "Case-study pipeline", description: "One client result written up each month (with the client's okay).", frequency: "monthly", dayOfMonth: 15, leadWorkingDays: 0 },
      { key: "self", kind: "self" },
      { key: "targets", kind: "results_targets", leads: 40, won: 2 },
      {
        key: "calendar_month",
        kind: "content",
        posts: [
          { title: "Reel: a result we got for a college (with their okay)", channel: "instagram_reel", day: 3 },
          { title: "Post: admissions tip for principals", channel: "linkedin", day: 8 },
          { title: "Reel: behind the scenes at Oppllo", channel: "instagram_reel", day: 15 },
          { title: "Post: case study carousel", channel: "instagram_post", day: 22 },
        ],
      },
      { key: "leads", kind: "goal", title: "Oppllo leads this month", unit: "count", target: 0, period: "month", source: "new_leads" },
      { key: "content_board", kind: "board", title: "Content month", scene: (id) => templateScene("content_month", id) },
      { key: "board", kind: "board", title: "Campaign plan", scene: (id) => templateScene("campaign_plan", id) },
    ],
  },
  founder: {
    key: "founder",
    name: "Founder office",
    description: "The weekly review, quarterly goals review and investor or partner updates. Private.",
    private: true,
    memberLevel: "view",
    tags: ["planning"],
    items: [
      { key: "project", kind: "project", name: "Founder rhythm", stages: ["This week", "This quarter", "Done"], description: "The founder's regular reviews and updates." },
      { key: "weekly", kind: "recurring", title: "Weekly review", description: "Goals, cash, pipeline, people. Notes on the Weekly review page (Meeting template).", frequency: "weekly", weekday: 1, leadWorkingDays: 0 },
      { key: "updates", kind: "recurring", title: "Investor and partner update", description: "What happened, numbers, what's next, asks.", frequency: "monthly", dayOfMonth: 5, leadWorkingDays: 1 },
      { key: "quarterly", kind: "task", title: "Quarterly goals review", description: "Company goals on Goals: keep, change or drop; set next quarter's.", dueInDays: 80 },
      { key: "weekly_doc", kind: "doc", title: "Weekly review", body: meetingBody({ agenda: ["Goals: on track?", "Cash and collections", "Pipeline", "People", "Decisions this week"] }) },
      { key: "board", kind: "board", title: "Quarter priorities", scene: (id) => columnsScene([{ name: "Now", stickies: ["Add one"], colour: C.purple }, { name: "Next", stickies: ["Add one"], colour: C.blue }, { name: "Later", stickies: ["Add one"], colour: C.yellow }], id) },
    ],
  },
  operations: {
    key: "operations",
    name: "Operations",
    description: "Tool renewals, vendor payments and keeping SOPs current.",
    private: false,
    memberLevel: "edit",
    tags: ["planning"],
    items: [
      { key: "project", kind: "project", name: "Operations upkeep", stages: ["To do", "Doing", "Done"], description: "Tools, vendors and how-tos." },
      { key: "renewals", kind: "recurring", title: "Tool renewals due next month", description: "Canva, Google Workspace, domains, Meta verified, software: renew, downgrade or drop.", frequency: "monthly", dayOfMonth: 20, leadWorkingDays: 0 },
      { key: "vendors", kind: "recurring", title: "Vendor payments", description: "Freelancers, printers, venues: bills checked and paid.", frequency: "monthly", dayOfMonth: 10, leadWorkingDays: 1 },
      { key: "sops", kind: "recurring", title: "SOP upkeep", description: "One SOP in Docs reviewed each month; owners and dates updated.", frequency: "monthly", dayOfMonth: 25, leadWorkingDays: 0 },
      { key: "tools_doc", kind: "doc", title: "Tools and renewals", body: "## Tools\n\n| Tool | Plan | Renews on | Owner | Monthly cost |\n| --- | --- | --- | --- | --- |\n|  |  |  |  |  |\n\n:::warning\nLogins stay in the password manager, never on this page.\n:::" },
      { key: "board", kind: "board", title: "Tools and vendors", scene: (id) => columnsScene([{ name: "Tools", stickies: ["Add one"], colour: C.blue }, { name: "Vendors", stickies: ["Add one"], colour: C.green }, { name: "Renewing soon", stickies: ["Add one"], colour: C.orange }], id) },
    ],
  },
};

/** A kit with the owner's changes: items left out, other days for recurring tasks, other goal targets. */
export function kitWith(kit: SpaceKit, o: KitOverrides = {}): SpaceKit {
  const off = new Set(o.off ?? []);
  return {
    ...kit,
    items: kit.items
      .filter((i) => i.kind === "project" || !off.has(i.key))
      .map((i) => {
        const day = o.days?.[i.key];
        if (i.kind === "recurring" && day !== undefined) return i.frequency === "monthly" ? { ...i, dayOfMonth: day } : { ...i, weekday: day };
        if (i.kind === "goal" && o.targets?.[i.key] !== undefined) return { ...i, target: o.targets[i.key]! };
        if (i.kind === "results_targets" && o.targets?.[i.key] !== undefined) return { ...i, leads: o.targets[i.key]! };
        return i;
      }),
  };
}

/** What applying a kit would do to a space that already has `done` of its items: create the rest, nothing twice. */
export function kitPlan(kit: SpaceKit, done: ReadonlySet<string>, space: { isPrivate: boolean; isSensitive: boolean } | null): { create: KitItem[]; existing: KitItem[]; privacy: string | null } {
  const create = kit.items.filter((i) => !done.has(i.key));
  const existing = kit.items.filter((i) => done.has(i.key));
  const privacy = kit.private && (!space || !space.isPrivate || !space.isSensitive) ? "The space becomes private and sensitive: only its members and the owner see it." : null;
  return { create, existing, privacy };
}

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** One line per item, for previews and the MCP. */
export function describeItem(i: KitItem): string {
  switch (i.kind) {
    case "project":
      return `Project “${i.name}” (stages: ${i.stages.join(" → ")})`;
    case "recurring":
      return `Recurring task “${i.title}”, ${i.frequency === "weekly" ? `every ${DAYS[i.weekday ?? 1]}` : i.dayOfMonth === 31 ? "on the last working day" : `on the ${i.dayOfMonth}${[1, 21].includes(i.dayOfMonth ?? 0) ? "st" : [2, 22].includes(i.dayOfMonth ?? 0) ? "nd" : [3, 23].includes(i.dayOfMonth ?? 0) ? "rd" : "th"} of each month`}`;
    case "task":
      return `Task “${i.title}”, due in about ${Math.round(i.dueInDays / 7)} weeks`;
    case "doc":
      return `Docs page “${i.title}”`;
    case "goal":
      return `Team goal “${i.title}”${i.target ? "" : " (target to set)"}${i.source === "manual" ? "" : ", live"}`;
    case "board":
      return `Board “${i.title}”`;
    case "self":
      return "Mark the space as Oppllo's own marketing (results and a monthly self-report like a client; never billed)";
    case "results_targets":
      return `This month's results targets: ${i.leads} Sales leads, ${i.won} colleges won`;
    case "content":
      return `Next month's content calendar: ${i.posts.length} ideas`;
  }
}
