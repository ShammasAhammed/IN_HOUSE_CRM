// Live cards on Idea Boards (Stage 13.2, D-13.2a): what a card shows, read fresh whenever it is drawn, always with the
// viewer's own rights through the owning service. A card the viewer can't open is "No access" — never its title.
import { formatRupees } from "@/lib/format";
import { isId } from "@/lib/id";
import { CLIENT_LINK_KIND_LABELS, type BoardCardKind } from "@/lib/types";
import type { Result } from "@/lib/result";
import type { DataStore } from "@/repositories";
import type { Clock } from "./clock";
import { clientScope, type Actor } from "./permissions";
import type { SwipeView } from "./swipe";

export type CardView =
  | { state: "no_access" }
  | { state: "ok"; kind: "task"; title: string; status: string; ownerName: string | null; dueDate: string | null; overdue: boolean; clientName: string; href: string }
  | { state: "ok"; kind: "creative"; title: string; approvalState: string; version: number; clientName: string; href: string }
  | { state: "ok"; kind: "results"; clientName: string; month: string; numbers: Array<{ label: string; value: string }>; href: string }
  | { state: "ok"; kind: "sheet"; title: string; kindLabel: string; changed: string | null; summary: Array<{ label: string; value: string | null; problem: string | null }>; href: string }
  | { state: "ok"; kind: "doc"; title: string; excerpt: string; href: string }
  | { state: "ok"; kind: "knowledge"; clientName: string; tone: string; dos: string[]; donts: string[]; href: string }
  | { state: "ok"; kind: "ref"; item: SwipeView };

type R<T> = Promise<Result<T>>;
/** The services a card reads through (each checks the viewer). */
export type CardSources = {
  tasks: { get(actor: Actor, id: string): R<{ title: string; status: string; ownerName: string | null; dueDate: string | null; overdue: boolean; clientName: string }> };
  assets: { page(actor: Actor, id: string): R<{ asset: { title: string; approvalState: string; currentVersion: number; clientName: string } }> };
  results: { forClient(actor: Actor, clientId: string): R<{ thisMonth: string; months: Array<{ month: string; result: { leads: number | null; spendPaise: number | null; admissions: number | null; costPerLeadPaise: number | null; targetLeads: number | null } | null }> }> };
  clientLinks: { page(actor: Actor, clientId: string): R<{ links: Array<{ id: string; title: string; kind: keyof typeof CLIENT_LINK_KIND_LABELS; openUrl: string; meta: { modifiedTime?: string | null; modifiedBy?: string | null } | null }> }>; summary(actor: Actor, linkId: string): R<Array<{ label: string; value: string | null; problem: string | null }>> };
  docs: { get(actor: Actor, id: string): R<{ title: string; body: string }> };
  knowledge: { forClient(actor: Actor, clientId: string): R<{ knowledge: { tone: string; dos: string; donts: string } }> };
  swipe: { get(actor: Actor, id: string): Promise<SwipeView | null> };
};

const NO: CardView = { state: "no_access" };
const lines = (s: string, n: number) =>
  s
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, n);

export function createBoardCardsService(deps: { store: DataStore; clock: Clock; sources: CardSources }) {
  const { store, sources } = deps;
  const clientName = async (actor: Actor, id: string) => (isId(id) ? ((await store.clients.findById(id, clientScope(actor)))?.name ?? null) : null);

  return {
    async card(actor: Actor, kind: BoardCardKind, id: string): Promise<CardView> {
      if (!isId(id)) return NO;
      switch (kind) {
        case "task": {
          const t = await sources.tasks.get(actor, id);
          return t.ok ? { state: "ok", kind, title: t.value.title, status: t.value.status, ownerName: t.value.ownerName, dueDate: t.value.dueDate, overdue: t.value.overdue, clientName: t.value.clientName, href: `/tasks/${id}` } : NO;
        }
        case "creative": {
          const a = await sources.assets.page(actor, id);
          return a.ok ? { state: "ok", kind, title: a.value.asset.title, approvalState: a.value.asset.approvalState, version: a.value.asset.currentVersion, clientName: a.value.asset.clientName, href: `/creatives/${id}` } : NO;
        }
        case "results": {
          const [r, name] = await Promise.all([sources.results.forClient(actor, id), clientName(actor, id)]);
          if (!r.ok || !name) return NO;
          const m = r.value.months.find((x) => x.month === r.value.thisMonth)?.result ?? null;
          const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("en-IN"));
          return {
            state: "ok",
            kind,
            clientName: name,
            month: r.value.thisMonth,
            numbers: [
              { label: "Leads", value: m ? `${n(m.leads)}${m.targetLeads ? ` / ${n(m.targetLeads)}` : ""}` : "—" },
              { label: "Spend", value: m?.spendPaise !== null && m?.spendPaise !== undefined ? formatRupees(m.spendPaise) : "—" },
              { label: "Cost per lead", value: m?.costPerLeadPaise ? formatRupees(m.costPerLeadPaise) : "—" },
              { label: "Admissions", value: n(m?.admissions) },
            ],
            href: `/clients/${id}/results`,
          };
        }
        case "sheet": {
          const link = await store.clientLinks.find(id);
          if (!link) return NO;
          const [page, summary] = await Promise.all([sources.clientLinks.page(actor, link.clientId), sources.clientLinks.summary(actor, id)]);
          const l = page.ok ? page.value.links.find((x) => x.id === id) : null;
          if (!l) return NO;
          return { state: "ok", kind, title: l.title, kindLabel: CLIENT_LINK_KIND_LABELS[l.kind], changed: l.meta?.modifiedTime ? `${l.meta.modifiedTime.slice(0, 10)}${l.meta.modifiedBy ? ` by ${l.meta.modifiedBy}` : ""}` : null, summary: summary.ok ? summary.value : [], href: `/clients/${link.clientId}/files/${id}` };
        }
        case "doc": {
          const d = await sources.docs.get(actor, id);
          return d.ok ? { state: "ok", kind, title: d.value.title, excerpt: d.value.body.replace(/[#>*_`[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 240), href: `/docs/${id}` } : NO;
        }
        case "knowledge": {
          const [k, name] = await Promise.all([sources.knowledge.forClient(actor, id), clientName(actor, id)]);
          return k.ok && name ? { state: "ok", kind, clientName: name, tone: k.value.knowledge.tone.slice(0, 200), dos: lines(k.value.knowledge.dos, 3), donts: lines(k.value.knowledge.donts, 3), href: `/clients/${id}/knowledge` } : NO;
        }
        case "ref": {
          const item = await sources.swipe.get(actor, id);
          return item ? { state: "ok", kind, item } : NO;
        }
      }
    },
  };
}

export type BoardCardsService = ReturnType<typeof createBoardCardsService>;
