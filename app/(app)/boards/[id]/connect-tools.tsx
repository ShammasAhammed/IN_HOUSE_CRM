"use client";

// Connectors like FigJam (Stage 13.1b): line style and arrowheads for a selected connector, and quick-connect
// handles: "+" on each side of a selected sticky or shape makes a connected one there (click), or where you drop it
// (drag). Excalidraw keeps connectors attached when shapes move and labels them on double-click.
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { arrowheadPatch, besideBox, connectorPatch, type Arrowheads, type ConnectorKind, type Side } from "@/services/rules/connectors";
import type { ExcalidrawImperativeAPI, ExcalidrawModule } from "./canvas";

type El = Record<string, unknown> & { id: string; type: string; x: number; y: number; width: number; height: number; groupIds: string[]; boundElements: Array<{ id: string; type: string }> | null; customData?: Record<string, unknown>; points?: Array<[number, number]>; startBinding?: { elementId: string } | null; endBinding?: { elementId: string } | null };
const els = (api: ExcalidrawImperativeAPI) => api.getSceneElements() as unknown as El[];
const bump = (e: El, patch: Record<string, unknown>): El => ({ ...e, ...patch, version: ((e.version as number) ?? 1) + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() }) as El;
const selectedOne = (api: ExcalidrawImperativeAPI) => {
  const s = api.getAppState();
  const ids = Object.keys(s.selectedElementIds).filter((k) => s.selectedElementIds[k]);
  return ids.length === 1 ? els(api).find((e) => e.id === ids[0]) : undefined;
};

/** The selected connector (not one our mind maps manage). */
export function selectedArrow(api: ExcalidrawImperativeAPI): El | null {
  const e = selectedOne(api);
  return e && e.type === "arrow" && !e.customData?.mmEdge ? e : null;
}

function restyle(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, patch: (a: El, all: El[]) => Record<string, unknown>) {
  const a = selectedArrow(api);
  if (!a) return;
  const all = els(api);
  api.updateScene({ elements: all.map((e) => (e.id === a.id ? bump(e, patch(e, all)) : e)) as never, captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY });
}

export function ConnectorControls({ api, lib }: { api: ExcalidrawImperativeAPI; lib: ExcalidrawModule }) {
  const a = selectedArrow(api);
  if (!a) return null;
  const kind: ConnectorKind = a.elbowed ? "elbow" : a.roundness ? "curved" : "straight";
  const heads: Arrowheads = a.startArrowhead && a.endArrowhead ? "both" : a.startArrowhead ? "start" : a.endArrowhead ? "end" : "none";
  const set = (k: ConnectorKind) =>
    restyle(api, lib, (arrow, all) => {
      const from = arrow.startBinding ? all.find((e) => e.id === arrow.startBinding!.elementId) : null;
      const to = arrow.endBinding ? all.find((e) => e.id === arrow.endBinding!.elementId) : null;
      return connectorPatch(arrow as never, k, from, to);
    });
  return (
    <div className="space-y-1.5 border-t pt-2" aria-label="Connector">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Line">
        {(["straight", "curved", "elbow"] as const).map((k) => (
          <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} aria-pressed={kind === k} onClick={() => set(k)}>
            {k === "straight" ? "Straight" : k === "curved" ? "Curved" : "Elbow"}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Arrowheads">
        {(["none", "end", "start", "both"] as const).map((h) => (
          <Button key={h} size="sm" variant={heads === h ? "default" : "ghost"} aria-pressed={heads === h} onClick={() => restyle(api, lib, () => arrowheadPatch(h))}>
            {h === "none" ? "—" : h === "end" ? "→" : h === "start" ? "←" : "↔"}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Double-click the line to give it a label. Its ends stay attached when the shapes move.</p>
    </div>
  );
}

/** A connected copy of a sticky or shape beside one side (or at a dropped point), its text editor opened. */
export function quickConnect(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, fromId: string, side: Side, at?: { x: number; y: number }): string | null {
  const all = els(api);
  const from = all.find((e) => e.id === fromId);
  if (!from) return null;
  const pos = at ? { x: at.x - from.width / 2, y: at.y - from.height / 2 } : besideBox(from, side);
  const id = crypto.randomUUID();
  const twin = { ...from, id, x: pos.x, y: pos.y, boundElements: [], groupIds: [], version: 1, versionNonce: Math.floor(Math.random() * 2 ** 31), seed: Math.floor(Math.random() * 2 ** 31), customData: from.customData?.kind === "sticky" ? { kind: "sticky" } : undefined, link: null, locked: false } as El;
  const arrowId = crypto.randomUUID();
  const [base] = lib.convertToExcalidrawElements([{ type: "arrow", x: 0, y: 0, points: [[0, 0], [1, 1]], strokeWidth: 2, roughness: 0, endArrowhead: "arrow" }] as never) as unknown as El[];
  const arrow = { ...base!, id: arrowId, ...connectorPatch({ ...base!, points: [[0, 0], [1, 1]] } as never, "straight", from, twin) } as El;
  const next = all.map((e) => (e.id === from.id ? bump(e, { boundElements: [...(e.boundElements ?? []), { id: arrowId, type: "arrow" }] }) : e));
  api.updateScene({ elements: [...next, { ...twin, boundElements: [{ id: arrowId, type: "arrow" }] }, arrow] as never, appState: { selectedElementIds: { [id]: true } } as never, captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY });
  return id;
}

const SIDES: Side[] = ["up", "right", "down", "left"];

/** The "+" handles around the selected sticky or shape. */
export function QuickConnect({ api, lib, onMade }: { api: ExcalidrawImperativeAPI; lib: ExcalidrawModule; onMade: () => void }) {
  const [, setTick] = useState(0);
  useEffect(() => api.onScrollChange(() => setTick((t) => t + 1)), [api]);
  const e = selectedOne(api);
  if (!e || !["rectangle", "ellipse", "diamond"].includes(e.type) || e.customData?.mm || e.customData?.section || e.locked) return null;
  const s = api.getAppState();
  const point = (x: number, y: number) => {
    const v = lib.sceneCoordsToViewportCoords({ sceneX: x, sceneY: y }, s as never);
    return { left: v.x - s.offsetLeft, top: v.y - s.offsetTop };
  };
  const spots: Record<Side, { left: number; top: number }> = {
    up: point(e.x + e.width / 2, e.y - 18 / s.zoom.value),
    down: point(e.x + e.width / 2, e.y + e.height + 18 / s.zoom.value),
    left: point(e.x - 18 / s.zoom.value, e.y + e.height / 2),
    right: point(e.x + e.width + 18 / s.zoom.value, e.y + e.height / 2),
  };
  return (
    <>
      {SIDES.map((side) => (
        <button
          key={side}
          type="button"
          aria-label={`Add a connected ${e.customData?.kind === "sticky" ? "sticky" : "shape"} ${side === "up" ? "above" : side === "down" ? "below" : `to the ${side}`}`}
          title="Click: add a connected one here. Drag: drop it where you like."
          className={cn("absolute z-10 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary bg-card text-primary shadow-card hover:bg-primary hover:text-primary-foreground")}
          style={spots[side]}
          onPointerDown={(ev) => {
            ev.preventDefault();
            const startX = ev.clientX;
            const startY = ev.clientY;
            const up = (u: PointerEvent) => {
              window.removeEventListener("pointerup", up);
              const moved = Math.hypot(u.clientX - startX, u.clientY - startY) > 12;
              const at = moved ? lib.viewportCoordsToSceneCoords({ clientX: u.clientX, clientY: u.clientY }, api.getAppState() as never) : undefined;
              if (quickConnect(api, lib, e.id, side, at ? { x: at.x, y: at.y } : undefined)) onMade();
            };
            window.addEventListener("pointerup", up);
          }}
        >
          <Plus className="size-3.5" />
        </button>
      ))}
    </>
  );
}
