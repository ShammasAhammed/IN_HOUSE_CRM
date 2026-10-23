// Automations (Stage 9b.5): rules that do the routine moves on tasks — hand reviews over, tag, notify, set dates,
// create the next task. Strategists and the owner.
import type { Metadata } from "next";
import { Suspense } from "react";
import { Zap } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { countOf, formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/types";
import { ACTION_LABELS, TRIGGER_LABELS, type AutomationAction, type AutomationConditions, type AutomationTrigger } from "@/services/rules/automations";
import { EditAutomation, NewAutomation } from "./builder";
import { mergeClients } from "../tasks/client-options";

export const metadata: Metadata = { title: "Automations" };

export default function AutomationsPage() {
  return (
    <>
      <PageHeader title="Automations" description="When something happens to a task, do the routine next step for you. Rules run instantly, never on each other." />
      <Suspense fallback={<LoadingRows rows={4} columns={2} label="Loading automations" />}>
        <Automations />
      </Suspense>
    </>
  );
}

function describe(t: AutomationTrigger, c: AutomationConditions, a: AutomationAction[], names: { people: Map<string, string>; clients: Map<string, string>; projects: Map<string, string> }) {
  const when = TRIGGER_LABELS[t.type] + (t.status ? ` to ${TASK_STATUS_LABELS[t.status]}` : "") + (t.priority ? ` to ${TASK_PRIORITY_LABELS[t.priority]}` : "") + (t.tag ? ` "${t.tag}"` : "");
  const only = [c.clientId ? names.clients.get(c.clientId) ?? "a client" : null, c.projectId ? names.projects.get(c.projectId) ?? "a project" : null, c.hasTag ? `tagged ${c.hasTag}` : null, c.fromForm ? `from ${c.fromForm}` : null].filter(Boolean).join(", ");
  const does = a
    .map((x) => {
      const who = "personId" in x ? names.people.get(x.personId) ?? "someone" : "";
      switch (x.type) {
        case "set_status":
          return `status → ${TASK_STATUS_LABELS[x.status]}`;
        case "set_priority":
          return `priority → ${TASK_PRIORITY_LABELS[x.priority]}`;
        case "assign":
          return `give to ${who}`;
        case "add_watcher":
          return `${who} watches`;
        case "notify":
          return `tell ${who}`;
        case "add_tag":
          return `tag ${x.tag}`;
        case "add_checklist":
          return `${x.steps.length} checklist steps`;
        case "set_due":
          return `due in ${countOf(x.days, "day")}`;
        case "create_task":
          return `then "${x.title}"`;
        default:
          return ACTION_LABELS[(x as AutomationAction).type];
      }
    })
    .join(" · ");
  return { when, only, does };
}

async function Automations() {
  const actor = await requireActor();
  const services = getServices();
  const [r, projects, directory, forms, clientOptions] = await Promise.all([services.automationRules.list(actor), services.projects.list(actor, { statuses: ["active", "planned", "on_hold"] }), services.people.directory(actor), services.requestForms.list(actor), services.clients.options(actor)]);
  if (!r.ok) return <ErrorState error={r.error} />;
  const projectList = projects.ok ? projects.value.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId })) : [];
  // Every live client, with or without projects yet (QA S2-B6).
  const clients = mergeClients(projects.ok ? projects.value : [], clientOptions);
  const people = directory.ok ? directory.value.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.fullName })) : [];
  const names = { people: new Map(people.map((p) => [p.id, p.name])), clients: new Map(clients.map((c) => [c.id, c.name])), projects: new Map(projectList.map((p) => [p.id, p.name])) };
  const formNames = forms.forms.map((f) => f.name);
  const options = { clients, projects: projectList, people, forms: formNames };
  return (
    <div className="space-y-4">
      <NewAutomation {...options} />
      {r.value.rules.length === 0 ? (
        <EmptyState icon={Zap} title="No automations yet" description='Try: when a task moves to "In review", give it to the lead strategist and notify them.' />
      ) : (
        <ul className="space-y-3">
          {r.value.rules.map((rule) => {
            const d = describe(rule.trigger, rule.conditions, rule.actions, names);
            return (
              <li key={rule.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border bg-card p-4 shadow-card">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{rule.name}</p>
                    <Badge tone={rule.active ? "success" : "neutral"}>{rule.active ? "On" : "Off"}</Badge>
                  </div>
                  <p className="text-sm">
                    <span className="text-muted-foreground">When</span> {d.when}
                    {d.only ? (
                      <>
                        {" "}
                        <span className="text-muted-foreground">only</span> {d.only}
                      </>
                    ) : null}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Do</span> {d.does}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ran {rule.runs} {rule.runs === 1 ? "time" : "times"}
                    {rule.lastRunAt ? `, last ${formatDateTime(new Date(rule.lastRunAt))}` : ""}
                    {rule.createdByName ? ` · by ${rule.createdByName}` : ""}
                  </p>
                </div>
                {rule.canEdit ? <EditAutomation {...options} initial={{ id: rule.id, name: rule.name, active: rule.active, trigger: rule.trigger, conditions: rule.conditions, actions: rule.actions }} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
