// Space kits (Stage 14.4): kit contents are well formed; the owner's changes apply; the plan never repeats an item.
import { describe, expect, it } from "vitest";
import { describeItem, KIT_KEYS, kitPlan, kitWith, SPACE_KITS } from "@/services/rules/space-kits";

describe("kits", () => {
  it("each has one project first, unique keys, valid days and a board", () => {
    for (const k of KIT_KEYS) {
      const kit = SPACE_KITS[k];
      expect(kit.items[0]!.kind).toBe("project");
      expect(new Set(kit.items.map((i) => i.key)).size).toBe(kit.items.length);
      expect(kit.items.some((i) => i.kind === "board")).toBe(true);
      for (const i of kit.items) if (i.kind === "recurring") expect(i.frequency === "weekly" ? i.weekday! >= 1 && i.weekday! <= 6 : i.dayOfMonth! >= 1 && (i.dayOfMonth! <= 28 || i.dayOfMonth === 31)).toBe(true);
    }
    expect(KIT_KEYS.filter((k) => SPACE_KITS[k].private)).toEqual(["finance", "hr", "founder"]);
  });
  it("owner changes, the plan and its wording", () => {
    const k = kitWith(SPACE_KITS.finance, { off: ["expenses", "project"], days: { gstr1: 13 }, targets: { collections: 90 } });
    expect(k.items.some((i) => i.key === "expenses")).toBe(false);
    expect(k.items[0]!.kind).toBe("project"); // the project can't be left out
    expect(describeItem(k.items.find((i) => i.key === "gstr1")!)).toBe("Recurring task “File GSTR-1 (due by the 11th)”, on the 13th of each month");
    const p = kitPlan(k, new Set(["project", "tds"]), { isPrivate: true, isSensitive: true });
    expect(p.existing.map((i) => i.key)).toEqual(["project", "tds"]);
    expect(p.create.map((i) => i.key)).not.toContain("tds");
    expect(p.privacy).toBeNull();
    expect(kitPlan(k, new Set(), null).privacy).toContain("private and sensitive");
  });
});
