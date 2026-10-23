// Global search (Stage 9b.4, ClickUp parity): one box for tasks, clients, projects, people, leads and creatives.
// Each kind is searched with the same rights as its own screen, so nobody finds what they couldn't open.
import { ok, type Result } from "@/lib/result";
import type { DataStore } from "@/repositories";
import type { Clock } from "./clock";
import { assetScope } from "./assets";
import { can, clientScope, type Actor } from "./permissions";
import { projectScope } from "./projects";
import { taskScope } from "./tasks";
import { APPROVAL_STATE_LABELS, LEAD_STAGE_LABELS, PROJECT_STATUS_LABELS } from "@/lib/types";

export type SearchHit = { id: string; title: string; detail: string; href: string };
export type SearchResults = { query: string; docs: SearchHit[]; tasks: SearchHit[]; clients: SearchHit[]; projects: SearchHit[]; people: SearchHit[]; leads: SearchHit[]; creatives: SearchHit[]; total: number };

const PER_KIND = 8;
const norm = (s: string) => s.toLowerCase().normalize("NFKD");

export function createSearchService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;
  return {
    async search(actor: Actor, raw: string): Promise<Result<SearchResults>> {
      const query = raw.trim().replace(/\s+/g, " ").slice(0, 100);
      const empty = { query, docs: [], tasks: [], clients: [], projects: [], people: [], leads: [], creatives: [], total: 0 };
      if (query.length < 2) return ok(empty);
      const q = norm(query);
      const has = (...parts: Array<string | null | undefined>) => parts.some((p) => p && norm(p).includes(q));
      const clientScopeNow = clientScope(actor);
      const docClientIds = clientScopeNow.kind === "all" && !clientScopeNow.viewerId ? ("all" as const) : await store.clients.visibleIds(clientScopeNow);
      const [tasks, clients, projects, people, leads, creatives] = await Promise.all([
        store.tasks.list({ scope: taskScope(actor), search: query, anyLevel: true, sort: { by: "created", dir: "desc" }, limit: PER_KIND }),
        store.clients.list(clientScope(actor)),
        store.projects.list({ scope: projectScope(actor), today: clock.today() }),
        store.people.listActive(),
        can(actor, "leads.read") ? store.leads.list({ search: query, limit: PER_KIND }) : Promise.resolve([]),
        can(actor, "assets.read") ? store.assets.list({ scope: assetScope(actor), search: query, limit: PER_KIND }) : Promise.resolve([]),
      ]);
      const docs = await store.docs.list(docClientIds, { search: query });
      const r: SearchResults = {
        query,
        docs: docs.slice(0, PER_KIND).map((d) => ({ id: d.id, title: d.title, detail: `${d.clientName ?? "Team"} page`, href: `/docs/${d.id}` })),
        tasks: tasks.map((t) => ({ id: t.id, title: t.title, detail: `${t.clientName} · ${t.projectName}${t.ownerName ? ` · ${t.ownerName}` : ""}${t.status === "done" ? " · Done" : ""}`, href: `/tasks/${t.id}` })),
        clients: clients.filter((c) => has(c.name)).slice(0, PER_KIND).map((c) => ({ id: c.id, title: c.name, detail: "Client", href: `/clients/${c.id}` })),
        projects: projects.filter((p) => has(p.name)).slice(0, PER_KIND).map((p) => ({ id: p.id, title: p.name, detail: `${p.clientName} · ${PROJECT_STATUS_LABELS[p.status]}`, href: `/projects/${p.id}` })),
        people: people.filter((p) => has(p.fullName, p.jobTitle)).slice(0, PER_KIND).map((p) => ({ id: p.id, title: p.fullName, detail: p.jobTitle, href: `/people/${p.id}` })),
        leads: leads.map((l) => ({ id: l.id, title: l.institution ?? l.name, detail: [l.institution ? l.name : null, l.district, LEAD_STAGE_LABELS[l.stage]].filter(Boolean).join(" · "), href: `/sales/leads/${l.id}` })),
        creatives: creatives.map((a) => ({ id: a.id, title: a.title, detail: `${a.clientName} · ${APPROVAL_STATE_LABELS[a.approvalState]}`, href: `/creatives/${a.id}` })),
        total: 0,
      };
      r.total = r.docs.length + r.tasks.length + r.clients.length + r.projects.length + r.people.length + r.leads.length + r.creatives.length;
      return ok(r);
    },
  };
}

export type SearchService = ReturnType<typeof createSearchService>;
