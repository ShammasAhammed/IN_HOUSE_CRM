import { describe, expect, it } from "vitest";
import { cleanTemplate, exitItems } from "@/services/rules/checklists";

describe("exit checklist", () => {
  it("lists every open access first, then clients, tasks and the template", () => {
    const items = exitItems(["Laptop collected"], {
      accesses: [
        { id: "a1", system: "Meta Business Manager", account: "Zenith IAS ad account", level: "Admin" },
        { id: "a2", system: "Canva", account: null, level: null },
      ],
      clients: [{ id: "c1", name: "Zenith IAS Academy" }],
      openTasks: 3,
    });
    expect(items).toEqual([
      { title: "Remove access: Meta Business Manager — Zenith IAS ad account (Admin)", source: "access:a1" },
      { title: "Remove access: Canva", source: "access:a2" },
      { title: "Hand over Zenith IAS Academy to someone on its team", source: "client:c1" },
      { title: "Reassign 3 open tasks", source: "tasks" },
      { title: "Laptop collected", source: null },
    ]);
    expect(exitItems([], { accesses: [], clients: [], openTasks: 0 })).toEqual([]);
  });

  it("cleans a typed template", () => {
    expect(cleanTemplate(["  Laptop ", "", "Laptop", "Email"])).toEqual(["Laptop", "Email"]);
  });
});
