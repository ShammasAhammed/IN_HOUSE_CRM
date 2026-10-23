// Connectors (Stage 13.1b): line styles between two shapes, arrowheads, and quick-connect placement.
import { describe, expect, it } from "vitest";
import { arrowheadPatch, besideBox, connectorPatch } from "@/services/rules/connectors";

const a = { id: "a", x: 0, y: 0, width: 100, height: 60 };
const b = { id: "b", x: 300, y: 100, width: 100, height: 60 };
const arrow = { id: "x", x: 100, y: 30, width: 200, height: 200, points: [[0, 0] as const, [200, 200] as const], startBinding: { elementId: "a" }, endBinding: { elementId: "b" } };

describe("connectorPatch", () => {
  it("elbow: right angles from the facing sides, fixed to them", () => {
    const p = connectorPatch(arrow, "elbow", a, b) as { points: number[][]; elbowed: boolean; startBinding: { elementId: string; fixedPoint: number[] }; endBinding: { fixedPoint: number[] }; x: number; y: number };
    expect(p.elbowed).toBe(true);
    expect([p.x, p.y]).toEqual([100, 30]);
    for (let i = 1; i < p.points.length; i++) {
      const [x1, y1] = p.points[i - 1]!;
      const [x2, y2] = p.points[i]!;
      expect(x1 === x2 || y1 === y2).toBe(true);
    }
    expect([p.startBinding.elementId, p.startBinding.fixedPoint, p.endBinding.fixedPoint]).toEqual(["a", [1, 0.5], [0, 0.5]]);
  });
  it("straight and curved keep the binding; curved bends", () => {
    const s = connectorPatch(arrow, "straight", a, b) as { points: number[][]; roundness: unknown; elbowed: boolean };
    expect([s.points.length, s.roundness, s.elbowed]).toEqual([2, null, false]);
    const c = connectorPatch(arrow, "curved", a, b) as { points: number[][]; roundness: { type: number } };
    expect([c.points.length, c.roundness.type]).toEqual([3, 2]);
    expect(c.points[1]).not.toEqual([100, 100]);
  });
  it("works on a loose arrow too (no shapes)", () => {
    const p = connectorPatch({ ...arrow, startBinding: null, endBinding: null }, "elbow") as { points: number[][]; startBinding?: unknown };
    expect(p.points).toHaveLength(4);
    expect(p.startBinding).toBeUndefined();
  });
});

describe("arrowheads and quick-connect", () => {
  it("sets the ends", () => {
    expect(arrowheadPatch("both")).toEqual({ startArrowhead: "arrow", endArrowhead: "arrow" });
    expect(arrowheadPatch("none")).toEqual({ startArrowhead: null, endArrowhead: null });
  });
  it("places the new shape beside the chosen side", () => {
    expect(besideBox(a, "right")).toEqual({ x: 200, y: 0 });
    expect(besideBox(a, "down")).toEqual({ x: 0, y: 160 });
    expect(besideBox(a, "left")).toEqual({ x: -200, y: 0 });
    expect(besideBox(a, "up")).toEqual({ x: 0, y: -160 });
  });
});
