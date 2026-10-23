// Joining and exit checklists (plan/4-hr-module.md, "Joining and leaving"; D77). Pure, unit-tested.
// HR edits the template lists in People → Checklists; these are the defaults until they do.

export const DEFAULT_JOINING = [
  "Google Workspace account and Oppllo email",
  "Oppllo One login and roles checked",
  "Added to the team WhatsApp groups",
  "Tools they need: Canva, Meta Business Manager, Google Ads (record each in Access)",
  "Laptop or other device handed over",
  "Introduced to the team",
  "First client briefing with their lead",
  "Offer letter signed and filed",
  "ID proof copy filed (last four digits only in Oppllo One)",
  "Emergency contact recorded",
];

export const DEFAULT_EXIT = [
  "Laptop and devices collected",
  "Removed from WhatsApp groups",
  "Google Workspace: email forwarded or transferred, account suspended",
  "Files handed over to the team's shared drive",
  "Exit conversation",
  "Experience or internship letter issued",
  "Final settlement sent to accounts (Zoho)",
];

export type ExitSources = {
  accesses: Array<{ id: string; system: string; account: string | null; level: string | null }>;
  clients: Array<{ id: string; name: string }>;
  openTasks: number;
};

/**
 * The exit checklist: every open access to close first (from the access register), then each client to hand over,
 * open tasks to reassign, then the template. Exit → security: nothing is left open by memory alone.
 */
export function exitItems(template: readonly string[], from: ExitSources): Array<{ title: string; source: string | null }> {
  return [
    ...from.accesses.map((a) => ({
      title: `Remove access: ${a.system}${a.account ? ` — ${a.account}` : ""}${a.level ? ` (${a.level})` : ""}`,
      source: `access:${a.id}`,
    })),
    ...from.clients.map((c) => ({ title: `Hand over ${c.name} to someone on its team`, source: `client:${c.id}` })),
    ...(from.openTasks ? [{ title: `Reassign ${from.openTasks} open ${from.openTasks === 1 ? "task" : "tasks"}`, source: "tasks" }] : []),
    ...template.map((title) => ({ title, source: null })),
  ];
}

/** A template as HR typed it: one item per line, blanks and repeats dropped, each kept to 200 characters. */
export function cleanTemplate(lines: readonly string[]): string[] {
  return [...new Set(lines.map((l) => l.trim().slice(0, 200)).filter(Boolean))].slice(0, 40);
}
