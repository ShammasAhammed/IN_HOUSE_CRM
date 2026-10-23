import { describe, expect, it } from "vitest";
import { actionsSchema, happeningOf, ruleMatches } from "@/services/rules/automations";

const task = { clientId: "c1", projectId: "p1", tags: ["Reel"], priority: "high", status: "in_review" };

describe("happeningOf", () => {
  it("reads the task events rules listen to, and ignores the rest", () => {
    expect(happeningOf({ action: "task.completed", entityType: "task", entityId: "t", data: {} })).toEqual({ taskId: "t", trigger: "status_changed", status: "done" });
    expect(happeningOf({ action: "task.status_changed", entityType: "task", entityId: "t", data: { to: "in_review" } })).toMatchObject({ status: "in_review" });
    expect(happeningOf({ action: "task.created", entityType: "task", entityId: "t", data: { form: "Design request" } })).toEqual({ taskId: "t", trigger: "task_created", form: "Design request" });
    expect(happeningOf({ action: "task.updated", entityType: "task", entityId: "t", data: { fields: ["title"] } })).toBeNull();
    expect(happeningOf({ action: "task.updated", entityType: "task", entityId: "t", data: { fields: ["priority"] } })).toMatchObject({ trigger: "priority_changed" });
    expect(happeningOf({ action: "lead.created", entityType: "lead", entityId: "l" })).toBeNull();
  });
});

describe("ruleMatches", () => {
  const h = { taskId: "t", trigger: "status_changed" as const, status: "in_review" };
  it("needs the trigger, its detail and every condition", () => {
    expect(ruleMatches({ trigger: { type: "status_changed", status: "in_review" }, conditions: {} }, h, task)).toBe(true);
    expect(ruleMatches({ trigger: { type: "status_changed", status: "done" }, conditions: {} }, h, task)).toBe(false);
    expect(ruleMatches({ trigger: { type: "status_changed" }, conditions: { clientId: "c2" } }, h, task)).toBe(false);
    expect(ruleMatches({ trigger: { type: "status_changed" }, conditions: { hasTag: "reel", projectId: "p1" } }, h, task)).toBe(true);
    expect(ruleMatches({ trigger: { type: "task_created" }, conditions: { fromForm: "Design request" } }, { taskId: "t", trigger: "task_created" }, task)).toBe(false);
    expect(ruleMatches({ trigger: { type: "tagged", tag: "urgent" }, conditions: {} }, { taskId: "t", trigger: "tagged", tags: ["Urgent"] }, task)).toBe(true);
  });
});

describe("actions", () => {
  it("checks each action's shape", () => {
    expect(actionsSchema.safeParse([]).success).toBe(false);
    expect(actionsSchema.safeParse([{ type: "set_status", status: "flying" }]).success).toBe(false);
    expect(actionsSchema.safeParse([{ type: "add_tag", tag: "a, b" }]).success).toBe(false);
    expect(actionsSchema.safeParse([{ type: "set_due", days: 3 }, { type: "create_task", title: "Post it", days: 1, ownerId: null }]).success).toBe(true);
  });
});
