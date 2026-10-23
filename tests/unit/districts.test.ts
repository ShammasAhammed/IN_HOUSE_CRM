import { describe, expect, it } from "vitest";
import { districtName, districtSpellings } from "@/services/rules/districts";

describe("district names (QA S6-B3)", () => {
  it("group spellings and old names under the official name", () => {
    expect(["Kozhikkodu", "Kozhikode", "kozhikode ", "Calicut"].map(districtName)).toEqual(["Kozhikode", "Kozhikode", "Kozhikode", "Kozhikode"]);
    expect(districtName("Malapuram")).toBe("Malappuram");
    expect(districtName("Trivandrum")).toBe("Thiruvananthapuram");
    expect(districtName("Coimbatore")).toBe("Coimbatore");
    expect(districtSpellings("Kozhikode", ["Kozhikkodu", "Kozhikode", "Kollam", "Calicut"])).toEqual(["Kozhikkodu", "Kozhikode", "Calicut"]);
  });
});
