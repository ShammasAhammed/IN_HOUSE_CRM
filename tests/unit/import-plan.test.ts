import { describe, expect, it } from "vitest";
import type { ImportMapping, ImportedTask } from "@/lib/validation/import";
import { FALLBACK_PROJECT, planImport, suggestPerson, suggestStatus } from "@/services/rules/import";

const task = (over: Partial<ImportedTask>): ImportedTask => ({
  ref: "t",
  name: "Task",
  description: null,
  status: "to do",
  dueDate: null,
  startDate: null,
  parentRef: null,
  assignees: [],
  priority: null,
  space: "Clients",
  folder: "Zenith IAS",
  list: "October",
  estimateMinutes: null,
  ...over,
});
const mapping = (over: Partial<ImportMapping> = {}): ImportMapping => ({ clientFrom: "folder", projectFrom: "list", clients: {}, statuses: {}, people: {}, ...over });

describe("suggestions", () => {
  it("maps common ClickUp statuses", () => {
    expect(["to do", "Open", "in progress", "review", "client feedback", "on hold", "complete", "Closed"].map(suggestStatus)).toEqual([
      "todo",
      "todo",
      "in_progress",
      "in_review",
      "in_review",
      "blocked",
      "skip",
      "skip",
    ]);
  });

  it("matches people by full name or a first name only one person has", () => {
    const people = [
      { id: "a", fullName: "Anjali Nair" },
      { id: "v", fullName: "Vishnu Prasad" },
      { id: "v2", fullName: "Vishnu Menon" },
    ];
    expect(suggestPerson("anjali nair", people)).toBe("a");
    expect(suggestPerson("Anjali", people)).toBe("a");
    expect(suggestPerson("Vishnu", people)).toBe("");
    expect(suggestPerson("Someone", people)).toBe("");
    // By exact email first, whatever the case (test report M10).
    expect(suggestPerson("ShammasAhammed169@gmail.com", [...people, { id: "s", fullName: "Shammas Ahammed", email: "shammasahammed169@gmail.com" }])).toBe("s");
  });
});

describe("planning the import", () => {
  it("leaves closed work and left-out clients behind, and names projects from the list", () => {
    const plan = planImport(
      [
        task({ ref: "1", status: "complete" }),
        task({ ref: "2", folder: "Old client" }),
        task({ ref: "3", folder: null }),
        task({ ref: "4", assignees: ["Ghost", "Vishnu"], priority: "urgent", startDate: "2025-10-20", dueDate: "2025-10-10" }),
        task({ ref: "5", list: null }),
      ],
      mapping({ clients: { "Old client": "skip" }, people: { Ghost: "", Vishnu: "v" } }),
    );
    expect(plan.skipped).toEqual({ closed: 1, clientLeftOut: 1, noClient: 1 });
    expect(plan.clients).toEqual([{ key: "Zenith IAS", existingId: null }]);
    expect(plan.projects.map((p) => p.name)).toEqual(["October", FALLBACK_PROJECT]);
    expect(plan.tasks[0]).toMatchObject({ ref: "4", ownerId: "v", priority: "urgent", startDate: null, dueDate: "2025-10-10" });
  });

  it("keeps one level of subtasks, under the top task; a subtask of closed work stands alone", () => {
    const plan = planImport(
      [
        task({ ref: "p" }),
        task({ ref: "c", parentRef: "p", list: "Elsewhere" }),
        task({ ref: "g", parentRef: "c" }),
        task({ ref: "done", status: "closed" }),
        task({ ref: "orphan", parentRef: "done" }),
        task({ ref: "outside", parentRef: "imported-before" }),
      ],
      mapping(),
    );
    const byRef = Object.fromEntries(plan.tasks.map((t) => [t.ref, [t.parentRef, t.projectName]]));
    expect(byRef).toEqual({
      p: [null, "October"],
      c: ["p", "October"],
      g: ["p", "October"],
      orphan: [null, "October"],
      outside: ["imported-before", "October"],
    });
  });

  it("uses an existing client when told to", () => {
    const plan = planImport([task({ ref: "1" })], mapping({ clients: { "Zenith IAS": "0199f3a0-0000-7000-8000-000000000001" } }));
    expect(plan.clients).toEqual([{ key: "Zenith IAS", existingId: "0199f3a0-0000-7000-8000-000000000001" }]);
  });
});
