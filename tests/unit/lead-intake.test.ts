import { describe, expect, it } from "vitest";
import { nextInTurn } from "@/services/rules/lead-intake";

describe("nextInTurn", () => {
  it("goes round, starts at the first, and skips someone who left", () => {
    expect(nextInTurn([], null)).toBeNull();
    expect(nextInTurn(["a", "c"], null)).toBe("a");
    expect(nextInTurn(["a", "c"], "a")).toBe("c");
    expect(nextInTurn(["a", "c"], "c")).toBe("a");
    expect(nextInTurn(["a", "c"], "b")).toBe("c");
    expect(nextInTurn(["a", "c"], "d")).toBe("a");
  });
});
