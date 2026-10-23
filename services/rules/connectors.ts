// FigJam-like connectors on Idea Boards (Stage 13.1b). Pure, unit-tested.
// Excalidraw 0.18 already binds arrows to shapes (they follow when shapes move), labels them (double-click) and has
// arrowheads; this adds one-click line styles (straight, curved, elbow), arrowhead sets, and quick-connect: a new
// sticky or shape next to one side of another, joined by a bound connector.
export const CONNECTOR_KINDS = ["straight", "curved", "elbow"] as const;
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];
export const ARROWHEADS = ["none", "end", "start", "both"] as const;
export type Arrowheads = (typeof ARROWHEADS)[number];
export type Side = "right" | "left" | "up" | "down";

type Box = { id: string; x: number; y: number; width: number; height: number };
type Arrow = Box & { points: ReadonlyArray<readonly [number, number]>; startBinding?: { elementId: string } | null; endBinding?: { elementId: string } | null };

const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
/** The side of `a` that faces `b`, as Excalidraw's fixed point (0–1 across the box). */
function facing(a: Box, b: Box): { point: [number, number]; at: { x: number; y: number }; horizontal: boolean } {
  const ca = centre(a);
  const cb = centre(b);
  const horizontal = Math.abs(cb.x - ca.x) / Math.max(1, a.width + b.width) >= Math.abs(cb.y - ca.y) / Math.max(1, a.height + b.height);
  if (horizontal) return cb.x >= ca.x ? { point: [1, 0.5], at: { x: a.x + a.width, y: ca.y }, horizontal } : { point: [0, 0.5], at: { x: a.x, y: ca.y }, horizontal };
  return cb.y >= ca.y ? { point: [0.5, 1], at: { x: ca.x, y: a.y + a.height }, horizontal } : { point: [0.5, 0], at: { x: ca.x, y: a.y }, horizontal };
}

/** What changes on an arrow for a line style, given the shapes it joins (when it joins any). */
export function connectorPatch(arrow: Arrow, kind: ConnectorKind, from?: Box | null, to?: Box | null): Record<string, unknown> {
  const first = arrow.points[0] ?? [0, 0];
  const last = arrow.points[arrow.points.length - 1] ?? [0, 0];
  let sx = arrow.x + first[0];
  let sy = arrow.y + first[1];
  let ex = arrow.x + last[0];
  let ey = arrow.y + last[1];
  let horizontal = Math.abs(ex - sx) >= Math.abs(ey - sy);
  let fixed: { start: [number, number]; end: [number, number] } | null = null;
  if (from && to) {
    const a = facing(from, to);
    const b = facing(to, from);
    [sx, sy, ex, ey] = [a.at.x, a.at.y, b.at.x, b.at.y];
    horizontal = a.horizontal;
    fixed = { start: a.point, end: b.point };
  }
  const dx = ex - sx;
  const dy = ey - sy;
  const base = { x: sx, y: sy, width: Math.abs(dx), height: Math.abs(dy), lastCommittedPoint: null };
  const bindings = (withFixed: boolean) =>
    from && to
      ? {
          startBinding: { elementId: from.id, focus: 0, gap: 6, ...(withFixed && fixed ? { fixedPoint: fixed.start } : {}) },
          endBinding: { elementId: to.id, focus: 0, gap: 6, ...(withFixed && fixed ? { fixedPoint: fixed.end } : {}) },
        }
      : {};
  if (kind === "straight") return { ...base, ...bindings(false), elbowed: false, roundness: null, points: [[0, 0], [dx, dy]], fixedSegments: null, startIsSpecial: null, endIsSpecial: null };
  if (kind === "curved") {
    // A gentle bend: the middle point pushed sideways by a fifth of the length.
    const len = Math.hypot(dx, dy) || 1;
    const mid: [number, number] = [dx / 2 - (dy / len) * len * 0.2, dy / 2 + (dx / len) * len * 0.2];
    return { ...base, ...bindings(false), elbowed: false, roundness: { type: 2 }, points: [[0, 0], mid, [dx, dy]], fixedSegments: null, startIsSpecial: null, endIsSpecial: null };
  }
  // Elbow: right angles only, leaving and arriving straight out of the sides.
  const points: Array<[number, number]> = horizontal
    ? [
        [0, 0],
        [dx / 2, 0],
        [dx / 2, dy],
        [dx, dy],
      ]
    : [
        [0, 0],
        [0, dy / 2],
        [dx, dy / 2],
        [dx, dy],
      ];
  return { ...base, ...bindings(true), elbowed: true, roundness: null, points, fixedSegments: null, startIsSpecial: null, endIsSpecial: null };
}

export const arrowheadPatch = (h: Arrowheads) => ({ startArrowhead: h === "start" || h === "both" ? "arrow" : null, endArrowhead: h === "end" || h === "both" ? "arrow" : null });

/** Where a quick-connected element goes: the same size, a gap away from the chosen side. */
export function besideBox(b: Box, side: Side, gap = 100): { x: number; y: number } {
  if (side === "right") return { x: b.x + b.width + gap, y: b.y };
  if (side === "left") return { x: b.x - gap - b.width, y: b.y };
  if (side === "down") return { x: b.x, y: b.y + b.height + gap };
  return { x: b.x, y: b.y - gap - b.height };
}
