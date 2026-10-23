// Idea Board tools in the browser (Stage 13.1): stickies, the mind-map child (Tab), stamps, images, export and saving.
// `lib` is the Excalidraw module the canvas hands over once loaded, so this file never imports it itself.
import type { BoardCardKind } from "@/lib/types";
import { CARD_SIZES, cardElement } from "@/services/rules/board-templates";
import { cardUrl, parseCardUrl } from "@/services/rules/references";
import { contentsOf } from "@/services/rules/sections";
import type { ExcalidrawImperativeAPI, ExcalidrawModule } from "./canvas";
import { outline } from "./section-tools";

type El = Record<string, unknown> & { id: string; type: string; x: number; y: number; width: number; height: number; groupIds: readonly string[]; boundElements: ReadonlyArray<{ id: string; type: string }> | null; customData?: Record<string, unknown>; isDeleted?: boolean };

export const STICKY_SIZES = { S: 120, M: 180, L: 260 } as const;
export const STICKY_PALETTE = ["#fff3bf", "#d3f9d8", "#d0ebff", "#ffdeeb", "#e5dbff", "#ffe8cc"] as const;
export const STAMP_STYLE: Record<string, { label: string; colour: string }> = {
  approved: { label: "✓ Approved", colour: "#2f9e44" },
  idea: { label: "💡 Idea", colour: "#7f21c2" },
  client_no: { label: "✕ Client said no", colour: "#e03131" },
  needs_data: { label: "? Needs data", colour: "#f08c00" },
};

const elementsOf = (api: ExcalidrawImperativeAPI) => api.getSceneElements() as unknown as El[];
export const selectedIds = (api: ExcalidrawImperativeAPI) => Object.keys(api.getAppState().selectedElementIds).filter((id) => api.getAppState().selectedElementIds[id]);
const bump = (e: El, patch: Record<string, unknown>): El => ({ ...e, ...patch, version: ((e.version as number) ?? 1) + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() });

function push(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, next: El[], select: string[]) {
  api.updateScene({
    elements: next as never,
    appState: { selectedElementIds: Object.fromEntries(select.map((id) => [id, true])) } as never,
    captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY,
  });
}

/** The middle of what's on screen, in board coordinates. */
function viewCentre(api: ExcalidrawImperativeAPI) {
  const s = api.getAppState();
  const z = s.zoom.value;
  return { x: -s.scrollX + s.width / 2 / z, y: -s.scrollY + s.height / 2 / z };
}

/** A new sticky in the middle of the screen (or beside the selected one), selected: Enter starts writing on it. */
export function addSticky(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, colour: string, size: number) {
  const els = elementsOf(api);
  const sel = els.find((e) => e.id === selectedIds(api)[0]);
  const at = sel ? { x: sel.x + sel.width + 24, y: sel.y } : (() => { const c = viewCentre(api); return { x: c.x - size / 2, y: c.y - size / 2 }; })();
  const [sticky] = lib.convertToExcalidrawElements([{ type: "rectangle", x: at.x, y: at.y, width: size, height: size, backgroundColor: colour, strokeColor: "transparent", fillStyle: "solid", roughness: 0, roundness: { type: 3 } }] as never) as unknown as El[];
  const s = { ...sticky!, customData: { kind: "sticky" }, frameId: sel?.frameId ?? null };
  push(api, lib, [...els, s], [s.id]);
  api.setToast({ message: "Sticky added: press Enter to write on it.", duration: 2500 });
}

/** Tab on a sticky or shape: a connected child to its right (below the last one), like a mind map. */
export function addChild(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule): boolean {
  const els = elementsOf(api);
  const ids = selectedIds(api);
  const parent = ids.length === 1 ? els.find((e) => e.id === ids[0] && ["rectangle", "ellipse", "diamond"].includes(e.type)) : undefined;
  if (!parent) return false;
  const children = els.filter((e) => e.type === "arrow" && (e.startBinding as { elementId?: string } | null)?.elementId === parent.id);
  const x = parent.x + parent.width + 100;
  const y = parent.y + children.length * (parent.height + 40);
  const [child] = lib.convertToExcalidrawElements([{ type: parent.type as "rectangle", x, y, width: parent.width, height: parent.height, backgroundColor: parent.backgroundColor as string, strokeColor: parent.strokeColor as string, fillStyle: "solid", roughness: 0, roundness: parent.roundness as never }] as never) as unknown as El[];
  const c = { ...child!, customData: parent.customData ?? {}, frameId: parent.frameId ?? null };
  const sx = parent.x + parent.width;
  const sy = parent.y + parent.height / 2;
  const [arrow] = lib.convertToExcalidrawElements([{ type: "arrow", x: sx + 8, y: sy, points: [[0, 0], [x - sx - 16, y + c.height / 2 - sy]], strokeWidth: 2, roughness: 0 }] as never) as unknown as El[];
  const a = { ...arrow!, startBinding: { elementId: parent.id, focus: 0, gap: 8 }, endBinding: { elementId: c.id, focus: 0, gap: 8 }, frameId: parent.frameId ?? null };
  const next = els.map((e) => (e.id === parent.id ? bump(e, { boundElements: [...(e.boundElements ?? []), { id: a.id, type: "arrow" }] }) : e));
  push(api, lib, [...next, { ...c, boundElements: [{ id: a.id, type: "arrow" }] }, a], [c.id]);
  return true;
}

/** A stamp on the selected sticky, grouped with it so they move together. */
export function addStamp(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, stamp: string) {
  const els = elementsOf(api);
  const target = els.find((e) => e.id === selectedIds(api)[0]);
  const style = STAMP_STYLE[stamp];
  if (!target || !style) return;
  const old = els.filter((e) => e.customData?.on === target.id && e.customData?.stamp);
  const oldIds = new Set([...old.map((e) => e.id), ...old.flatMap((e) => (e.boundElements ?? []).map((b) => b.id))]);
  const group = target.groupIds[0] ?? `stamp-${target.id}`;
  const made = lib.convertToExcalidrawElements([
    { type: "rectangle", x: target.x + target.width - 70, y: target.y - 16, width: 150, height: 32, backgroundColor: style.colour, strokeColor: style.colour, fillStyle: "solid", roughness: 0, roundness: { type: 3 }, label: { text: style.label, fontSize: 14, strokeColor: "#ffffff", fontFamily: lib.FONT_FAMILY.Nunito } },
  ] as never) as unknown as El[];
  const stampEls = made.map((e, i) => ({ ...e, groupIds: [group], frameId: target.frameId ?? null, ...(i === 0 ? { customData: { stamp, on: target.id } } : {}) }));
  const tied = new Set([target.id, ...(target.boundElements ?? []).filter((b) => b.type === "text").map((b) => b.id)]);
  const next = els.filter((e) => !oldIds.has(e.id)).map((e) => (tied.has(e.id) && !e.groupIds.includes(group) ? bump(e, { groupIds: [group, ...e.groupIds] }) : e));
  push(api, lib, [...next, ...stampEls], [target.id]);
}

/** Colours the selected stickies or shapes. */
export function recolour(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, colour: string) {
  const ids = new Set(selectedIds(api));
  const next = elementsOf(api).map((e) => (ids.has(e.id) && e.type !== "text" && e.type !== "arrow" ? bump(e, { backgroundColor: colour, fillStyle: "solid" }) : e));
  push(api, lib, next, [...ids]);
}

/** The selected elements with everything tied to them (their text, arrows between them), for "Move to a new board". */
export function selectionWithTies(api: ExcalidrawImperativeAPI): El[] {
  const els = elementsOf(api);
  const ids = new Set(selectedIds(api));
  for (const e of els) if (e.containerId && ids.has(e.containerId as string)) ids.add(e.id);
  for (const e of els) if (e.type === "frame" && ids.has(e.id)) for (const c of els) if (c.frameId === e.id) ids.add(c.id);
  return els.filter((e) => ids.has(e.id));
}

/** Takes the moved elements off this board and leaves a link to the new one where they were. */
export function replaceWithLink(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, moved: El[], title: string, href: string) {
  const ids = new Set(moved.map((e) => e.id));
  const x = Math.min(...moved.map((e) => e.x));
  const y = Math.min(...moved.map((e) => e.y));
  const [link] = lib.convertToExcalidrawElements([{ type: "text", x, y, text: `→ ${title} (moved to its own board)`, fontSize: 24, fontFamily: lib.FONT_FAMILY.Nunito, link: href }] as never) as unknown as El[];
  push(api, lib, [...elementsOf(api).filter((e) => !ids.has(e.id)), link!], [link!.id]);
}

export function goTo(api: ExcalidrawImperativeAPI, ids: string[], opts: { select?: boolean; fit?: boolean } = {}) {
  const els = elementsOf(api).filter((e) => ids.includes(e.id));
  if (!els.length) return;
  api.scrollToContent(els as never, { fitToViewport: opts.fit ?? els.length > 1, viewportZoomFactor: 0.85, animate: true, duration: 300 });
  if (opts.select) api.updateScene({ appState: { selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) } as never });
}

// ---------- export ----------

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
const safe = (s: string) => s.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 60) || "board";

/** What to draw for one slide or page: a frame (Excalidraw clips to it), or a section with what it holds. */
function partOf(api: ExcalidrawImperativeAPI, id: string): { elements: readonly unknown[]; frame: unknown } {
  const all = api.getSceneElements();
  const el = all.find((e) => e.id === id) as unknown as El | undefined;
  if (el?.type === "frame") return { elements: all, frame: el };
  if (el?.customData?.section) {
    const keep = new Set([id, ...contentsOf(all, id), ...all.filter((e) => (e as unknown as El).customData?.sectionLabel === id).map((e) => e.id)]);
    return { elements: all.filter((e) => keep.has(e.id)), frame: null };
  }
  return { elements: all, frame: null };
}

export async function exportImage(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, format: "png" | "svg", title: string, frameId?: string) {
  const part = frameId ? partOf(api, frameId) : { elements: api.getSceneElements(), frame: null };
  const elements = part.elements as never;
  const frame = part.frame as never;
  const appState = { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false };
  const label = frameId ? outline(api).find((o) => o.id === frameId)?.name : null;
  const name = `${safe(title)}${label ? ` - ${safe(label)}` : ""}`;
  if (format === "png") download(await lib.exportToBlob({ elements, appState, files: api.getFiles(), exportingFrame: frame, mimeType: "image/png", exportPadding: 24 }), `${name}.png`);
  else {
    const svg = await lib.exportToSvg({ elements, appState, files: api.getFiles(), exportingFrame: frame, exportPadding: 24 });
    download(new Blob([svg.outerHTML], { type: "image/svg+xml" }), `${name}.svg`);
  }
}

/** Every frame and section as a page, then the browser's Print → Save as PDF (no PDF library needed). */
export async function exportPdf(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, title: string): Promise<string | null> {
  const frames = outline(api);
  if (!frames.length) return "Add frames (F) or sections first: each one becomes a page.";
  const w = window.open("", "_blank");
  if (!w) return "Allow pop-ups for Oppllo One to export the PDF.";
  w.document.title = title;
  w.document.body.innerHTML = "<p style='font-family:sans-serif'>Making the pages…</p>";
  const pages: string[] = [];
  for (const f of frames) {
    const part = partOf(api, f.id);
    const blob = await lib.exportToBlob({ elements: part.elements as never, appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false }, files: api.getFiles(), exportingFrame: part.frame as never, mimeType: "image/png", maxWidthOrHeight: 2000 });
    pages.push(await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); }));
  }
  w.document.body.innerHTML = "";
  const style = w.document.createElement("style");
  style.textContent = "@page{size:landscape;margin:10mm}body{margin:0}figure{margin:0;page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;height:95vh}img{max-width:100%;max-height:88vh}figcaption{font:14px sans-serif;margin-top:6px}";
  w.document.head.append(style);
  frames.forEach((f, i) => {
    const fig = w.document.createElement("figure");
    const img = w.document.createElement("img");
    img.src = pages[i]!;
    img.alt = f.name;
    const cap = w.document.createElement("figcaption");
    cap.textContent = `${i + 1}. ${f.name}`;
    fig.append(img, cap);
    w.document.body.append(fig);
  });
  setTimeout(() => w.print(), 400);
  return null;
}

/** A small picture of the board for the library (PNG data URL). */
export async function thumbnail(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule): Promise<string | null> {
  const elements = api.getSceneElements();
  if (!elements.length) return null;
  const blob = await lib.exportToBlob({ elements, appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false }, files: api.getFiles(), mimeType: "image/png", maxWidthOrHeight: 480, exportPadding: 16 });
  const url = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); });
  return url.length < 190_000 ? url : null;
}

/** The picture of a template (Stage 13.6), drawn from its cleaned elements (no client data, no files). */
export async function templateThumbnail(lib: ExcalidrawModule, elements: unknown[]): Promise<string | null> {
  const els = lib.restoreElements(elements as never, null);
  if (!els.length) return null;
  const blob = await lib.exportToBlob({ elements: els, appState: { exportBackground: true, exportWithDarkMode: false, viewBackgroundColor: "#ffffff" }, files: {}, mimeType: "image/png", maxWidthOrHeight: 480, exportPadding: 16 });
  const url = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); });
  return url.length < 190_000 ? url : null;
}

// ---------- images ----------

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 3_500_000;

/** A picture made smaller (at most 1,600 px, under 3.5 MB) before it goes up. */
async function shrink(blob: Blob): Promise<Blob> {
  if (ALLOWED.includes(blob.type) && blob.size <= 1_000_000) return blob;
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.85, 0.7, 0.5]) {
    const out = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/webp", q));
    if (out && out.size <= MAX_BYTES) return out;
  }
  throw new Error("That image is too big even after shrinking it.");
}

export async function uploadImage(boardId: string, key: string, dataURL: string): Promise<string | null> {
  try {
    const blob = await shrink(await (await fetch(dataURL)).blob());
    const form = new FormData();
    form.set("key", key);
    form.set("file", new File([blob], key, { type: blob.type }));
    const res = await fetch(`/api/boards/${boardId}/images`, { method: "POST", body: form });
    return res.ok ? null : ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "The image wasn't saved.";
  } catch (e) {
    return e instanceof Error ? e.message : "The image wasn't saved.";
  }
}

/** Images load after the board has opened, a few at a time. */
export async function loadImages(api: ExcalidrawImperativeAPI, boardId: string, keys: string[]) {
  const queue = [...keys];
  const one = async () => {
    for (let key = queue.shift(); key; key = queue.shift()) {
      const res = await fetch(`/api/boards/${boardId}/images/${encodeURIComponent(key)}`);
      if (!res.ok) continue;
      const blob = await res.blob();
      const dataURL = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); });
      api.addFiles([{ id: key as never, dataURL: dataURL as never, mimeType: blob.type as never, created: Date.now() }]);
    }
  };
  await Promise.all([one(), one(), one()]);
}

// ---------- saving ----------

export type SaveResult = { ok: true; version: number; tooBig: boolean } | { ok: false; conflict: boolean; message: string };

/** The scene, gzipped (a big board is megabytes of JSON), to /api/boards/[id]. */
export async function saveScene(boardId: string, body: { baseVersion: number; elements: readonly unknown[]; appState: Record<string, unknown>; thumbnail?: string | null }): Promise<SaveResult> {
  try {
    const json = new Blob([JSON.stringify(body)]).stream().pipeThrough(new CompressionStream("gzip"));
    const res = await fetch(`/api/boards/${boardId}`, { method: "POST", body: await new Response(json).arrayBuffer(), headers: { "content-type": "application/octet-stream", "x-body-encoding": "gzip" } });
    const data = (await res.json().catch(() => ({}))) as { version?: number; tooBig?: boolean; error?: string };
    if (res.ok && data.version) return { ok: true, version: data.version, tooBig: Boolean(data.tooBig) };
    return { ok: false, conflict: res.status === 409, message: data.error ?? "Not saved. Check your connection." };
  } catch {
    return { ok: false, conflict: false, message: "Not saved: you seem to be offline. It will try again." };
  }
}

/** The end-of-timer sound: a short chime made in the browser, no file. */
export function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880, 990].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.5);
    });
  } catch {
    // No sound available: the timer still shows 0:00.
  }
}

// ---------- live cards (Stage 13.2) ----------

/**
 * A live card in the middle of the screen, or under an element (a sticky's task badge, grouped with it so they move
 * together). Excalidraw draws it from /board-cards with the viewer's own rights.
 */
export function insertCard(api: ExcalidrawImperativeAPI, lib: ExcalidrawModule, kind: BoardCardKind, id: string, opts: { under?: string } = {}) {
  const els = elementsOf(api);
  const under = opts.under ? els.find((e) => e.id === opts.under) : undefined;
  const size = under ? "badge" : kind;
  const { width, height } = CARD_SIZES[size] ?? CARD_SIZES.task!;
  const c = viewCentre(api);
  const at = under ? { x: under.x, y: under.y + under.height + 8 } : { x: c.x - width / 2, y: c.y - height / 2 };
  // Several cards added in a row cascade instead of landing on top of each other.
  if (!under) while (els.some((e) => Math.abs(e.x - at.x) < 24 && Math.abs(e.y - at.y) < 24)) Object.assign(at, { x: at.x + 32, y: at.y + 32 });
  const card = cardElement(() => crypto.randomUUID(), cardUrl(kind, id), at.x, at.y, size) as unknown as El;
  if (!under) return push(api, lib, [...els, { ...card, customData: { card: kind } }], [card.id]);
  const group = under.groupIds[0] ?? `task-${under.id}`;
  const tied = new Set([under.id, ...(under.boundElements ?? []).filter((b) => b.type === "text").map((b) => b.id)]);
  const next = els.map((e) => (tied.has(e.id) && !e.groupIds.includes(group) ? bump(e, { groupIds: [group, ...e.groupIds] }) : e));
  push(api, lib, [...next, { ...card, groupIds: [group], frameId: under.frameId ?? null, customData: { card: kind, badge: true } }], [under.id]);
}

/** Where a card's link leads when someone opens it (the card pages have their own "Open" too). */
export function cardHref(link: string): string | null {
  const c = parseCardUrl(link);
  if (!c) return null;
  const to: Partial<Record<BoardCardKind, string>> = { task: `/tasks/${c.id}`, creative: `/creatives/${c.id}`, results: `/clients/${c.id}/results`, doc: `/docs/${c.id}`, knowledge: `/clients/${c.id}/knowledge`, ref: `/swipe?item=${c.id}` };
  return to[c.kind] ?? `/board-cards/${c.kind}/${c.id}`;
}
