"use client";

// An open Idea Board (Stage 13.1): the Excalidraw canvas plus our own parts around it — autosave with the version
// check, the timer, voting, reactions, stamps, comments with @mentions, the List view, frames outline, presenting,
// export and history. Checks for changes every 5 seconds while visible (live cursors are 13.5).
import type { Route } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookmarkPlus, ChevronLeft, ChevronRight, Download, Grid3x3, History, Keyboard, LayoutTemplate, Lightbulb, List, Maximize, Minimize, Network, SquareDashed, ListTree, Loader2, MessageSquare, Presentation, Timer, Vote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BoardPage, BoardState } from "@/services/boards";
import { boardItems, type BoardItem } from "@/services/rules/boards";
import { looksLikeList, parseHtmlList, parseList, type ListItem } from "@/services/rules/mind-map";

const countItems = (items: readonly ListItem[]): number => items.reduce((n, i) => n + 1 + countItems(i.children), 0);
import { splitBoardAction } from "../actions";
import { templateThumbnailAction } from "../../templates/actions";
import { SaveAsTemplate } from "../../templates/template-forms";
import { addChild, addSticky, templateThumbnail, cardHref, chime, insertCard, exportImage, exportPdf, goTo, loadImages, saveScene, selectedIds, selectionWithTies, replaceWithLink, thumbnail, uploadImage } from "./board-tools";
import type { ExcalidrawImperativeAPI, ExcalidrawModule } from "./canvas";
import { CommentsPanel, HistoryPanel, ListPanel, OutlinePanel, SectionControls, SelectionPanel, TimerControl, VotingPanel } from "./board-panels";
import { AddCardPanel } from "./board-work";
import { ListActions, MindControls, OutlineEditor } from "./mind-panel";
import { ConnectorControls, QuickConnect } from "./connect-tools";
import { KeysPanel } from "./keys-panel";
import { placeList } from "./list-tools";
import { addSection, outline, sectionsAfterDrag, snapshotSections } from "./section-tools";
import { addNode, afterDrag, branchSize, collapseNode, currentNode, deleteNode, editSelected, insertMindMap, nodePositions, outdentNode, relayoutChanged } from "./mind-tools";
import { saveReferenceAction } from "./work-actions";

const Canvas = dynamic(() => import("./canvas"), { ssr: false, loading: () => <CanvasLoading /> });

function CanvasLoading() {
  return (
    <div className="flex size-full items-center justify-center text-sm text-muted-foreground" role="status">
      <Loader2 className="mr-2 size-4 animate-spin" /> Opening the board…
    </div>
  );
}

type Panel = "cards" | "list" | "comments" | "votes" | "outline" | "history" | "template" | "map" | "keys" | null;
type Wire<T> = T extends Date ? string : T extends Array<infer U> ? Array<Wire<U>> : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;
type LiveState = Wire<BoardState> & { items: BoardItem[] };
const SAVE_IDLE_MS = 1500;
const POLL_MS = 5000;
const THUMB_EVERY_MS = 60_000;

export function BoardRoom({ page, focus }: { page: BoardPage; focus: string | null }) {
  const router = useRouter();
  const b = page.board;
  const canEdit = (page.level === "edit" || page.level === "manage") && !b.archivedAt;
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const lib = useRef<ExcalidrawModule | null>(null);
  const [ed, setEd] = useState<{ api: ExcalidrawImperativeAPI; lib: ExcalidrawModule } | null>(null);
  const ready = Boolean(ed);
  const saveRef = useRef<() => Promise<void>>(async () => undefined);
  const base = useRef(b.version);
  const savedSceneVersion = useRef<number | null>(null);
  const seenSceneVersion = useRef<number | null>(null);
  // Mind maps (13.1b): what each map looked like at its last layout, the Enter we send ourselves, and a pending delete.
  const mapSigs = useRef(new Map<string, string>());
  const enterMark = useRef({ skip: false });
  const primed = useRef(false);
  const sceneTickRef = useRef(0);
  const [sceneTick, setSceneTick] = useState(0);
  const relayoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lists (13.1b): a pasted list waiting for "mind map / sticky grid / text", and the map open in the outline editor.
  const [pendingList, setPendingList] = useState<ListItem[] | null>(null);
  const [editingMap, setEditingMap] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; text: string; under: number; root: boolean } | null>(null);
  // Saving starts only once Excalidraw has loaded the scene (it loads after mounting): never save a half-loaded board.
  const initialCount = useMemo(() => (page.scene.elements as Array<{ isDeleted?: boolean }>).filter((e) => !e.isDeleted).length, [page.scene.elements]);
  const loaded = useRef(false);
  // The drawing as it is now, so an editor that mounts again (Fast Refresh, a re-render) continues from here, never
  // from the scene the page first loaded (found in the 13.1b check: that would roll the board back on the next save).
  const latest = useRef<readonly unknown[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingNow = useRef(false);
  const lastThumb = useRef(0);
  const uploaded = useRef(new Set(page.fileKeys));
  const [status, setStatus] = useState<"saved" | "unsaved" | "saving" | "error">("saved");
  const [problem, setProblem] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [newer, setNewer] = useState<string | null>(null);
  const [tooBig, setTooBig] = useState(page.tooBig);
  const [live, setLive] = useState<LiveState>(() => JSON.parse(JSON.stringify({ ...page.state, items: page.items })) as LiveState);
  const [panel, setPanel] = useState<Panel>(focus ? "comments" : null);
  const [selected, setSelected] = useState<string[]>([]);
  const [grid, setGrid] = useState(Boolean(page.scene.appState?.gridModeEnabled));
  const [presenting, setPresenting] = useState<number | null>(null);
  const [full, setFull] = useState<false | "screen" | "focus">(false);
  const [frames, setFrames] = useState(page.frames);
  const [exportOpen, setExportOpen] = useState(false);
  const room = useRef<HTMLDivElement>(null);

  // ---------- saving ----------
  const save = useCallback(async () => {
    const a = api.current;
    const l = lib.current;
    if (!a || !l || !canEdit || conflict || savingNow.current || !loaded.current) return;
    savingNow.current = true;
    setStatus("saving");
    // Images first (resized), so the scene never points at one that isn't stored.
    for (const f of Object.values(a.getFiles())) {
      if (uploaded.current.has(f.id)) continue;
      const err = await uploadImage(b.id, f.id, f.dataURL);
      if (err) setProblem(err);
      else uploaded.current.add(f.id);
    }
    const elements = a.getSceneElements();
    const version = l.getSceneVersion(elements);
    const s = a.getAppState();
    const thumb = Date.now() - lastThumb.current > THUMB_EVERY_MS ? await thumbnail(a, l).catch(() => null) : undefined;
    const r = await saveScene(b.id, { baseVersion: base.current, elements, appState: { viewBackgroundColor: s.viewBackgroundColor, gridModeEnabled: s.gridModeEnabled, gridSize: s.gridSize, gridStep: s.gridStep, objectsSnapModeEnabled: s.objectsSnapModeEnabled }, ...(thumb !== undefined ? { thumbnail: thumb } : {}) });
    savingNow.current = false;
    if (r.ok) {
      base.current = r.version;
      savedSceneVersion.current = version;
      if (thumb !== undefined) lastThumb.current = Date.now();
      setTooBig(r.tooBig);
      // Changed again while saving: go again.
      if (l.getSceneVersion(a.getSceneElements()) !== version) {
        setStatus("unsaved");
        timer.current = setTimeout(() => void saveRef.current(), SAVE_IDLE_MS);
      } else setStatus("saved");
    } else if (r.conflict) {
      setConflict(true);
      setStatus("error");
      setProblem(r.message);
    } else {
      setStatus("error");
      setProblem(r.message);
      timer.current = setTimeout(() => void saveRef.current(), 10_000);
    }
  }, [b.id, canEdit, conflict]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const onChange = useCallback(
    (elements: readonly { id: string }[], appState: { selectedElementIds: Record<string, boolean> }) => {
      const ids = Object.keys(appState.selectedElementIds).filter((k) => appState.selectedElementIds[k]);
      setSelected((cur) => (cur.join() === ids.join() ? cur : ids));
      const l = lib.current;
      if (!l || !canEdit) return;
      // Mind maps re-arrange as people type (after a short pause).
      if (relayoutTimer.current) clearTimeout(relayoutTimer.current);
      relayoutTimer.current = setTimeout(() => {
        // Only once the board has loaded; the first pass just remembers the maps as saved (opening isn't a change).
        if (!api.current || !loaded.current) return;
        relayoutChanged(api.current, l, mapSigs.current, { dry: !primed.current });
        primed.current = true;
      }, 150);
      const v = l.getSceneVersion(elements as never);
      if (loaded.current) latest.current = elements;
      // Panels that read the canvas (mind-map controls) show the drawing as it is now.
      if (v !== sceneTickRef.current) {
        sceneTickRef.current = v;
        setSceneTick(v);
      }
      if (!loaded.current) {
        if (elements.length < (latest.current?.length ?? initialCount)) return;
        loaded.current = true;
        savedSceneVersion.current = v;
        performance.mark("board-loaded");
        return;
      }
      // Excalidraw calls this on every render and pointer move: only a changed drawing restarts the wait.
      if (v === savedSceneVersion.current || v === seenSceneVersion.current) return;
      seenSceneVersion.current = v;
      setStatus("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), SAVE_IDLE_MS);
    },
    [canEdit, save, initialCount],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status === "unsaved" || status === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  // ---------- what others changed ----------
  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch(`/api/boards/${b.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const s = (await res.json()) as LiveState;
      setLive(s);
      if (s.version > base.current && !savingNow.current) setNewer(s.updatedByName ?? "Someone");
    } catch {
      // Offline for a moment: the next check catches up.
    }
  }, [b.id]);
  const refresh = poll;
  useEffect(() => {
    const t = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [poll]);

  // ---------- ready ----------
  const onReady = useCallback(
    (a: ExcalidrawImperativeAPI, l: ExcalidrawModule) => {
      // A remount (or Fast Refresh) hands over a new editor: always use the newest, starting from the latest drawing.
      if (api.current === a) return;
      const carry = api.current ? latest.current : null;
      api.current = a;
      if (carry) setTimeout(() => a.updateScene({ elements: carry as never, captureUpdate: l.CaptureUpdateAction.NEVER }), 0);
      loaded.current = false;
      savedSceneVersion.current = null;
      seenSceneVersion.current = null;
      lib.current = l;
      setEd({ api: a, lib: l });
      // If Excalidraw dropped a broken element, the count never matches: arm saving anyway (it saves what it shows).
      setTimeout(() => {
        if (api.current !== a || loaded.current) return;
        loaded.current = true;
        savedSceneVersion.current = l.getSceneVersion(a.getSceneElements());
      }, 2500);
      performance.mark("board-ready");
      // Drags: a moved section brings its contents; a dragged mind-map node re-orders or re-parents.
      let before: Map<string, { x: number; y: number }> | null = null;
      let sections: ReturnType<typeof snapshotSections> | null = null;
      a.onPointerDown(() => {
        before = nodePositions(a);
        sections = snapshotSections(a);
      });
      a.onPointerUp(() => {
        const b = before;
        const sec = sections;
        before = null;
        sections = null;
        if (a.getAppState().viewModeEnabled) return;
        setTimeout(() => {
          if (sec?.size) sectionsAfterDrag(a, l, sec);
          if (b?.size) afterDrag(a, l, b);
        }, 0);
      });
      const keys = [...new Set((a.getSceneElements() as unknown as Array<{ type: string; fileId?: string }>).filter((e) => e.type === "image" && e.fileId).map((e) => e.fileId!))];
      if (keys.length) void loadImages(a, b.id, keys.filter((k) => uploaded.current.has(k)));
      if (focus) setTimeout(() => goTo(a, [focus], { select: true }), 300);
    },
    [b.id, focus],
  );

  // ---------- keyboard: S sticky, Tab child, arrows while presenting ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = api.current;
      const l = lib.current;
      if (!a || !l) return;
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable=true]") || a.getAppState().editingTextElement;
      // Focus mode (no browser full screen): Esc leaves it when nothing is selected or being typed.
      if (full === "focus" && e.key === "Escape" && !typing && !Object.values(a.getAppState().selectedElementIds).some(Boolean)) {
        setFull(false);
        return;
      }
      if (presenting !== null) {
        if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) setPresenting((p) => (p === null ? p : Math.min(p + 1, frames.length - 1)));
        else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) setPresenting((p) => (p === null ? p : Math.max(p - 1, 0)));
        else if (e.key === "Escape") setPresenting(null);
        else return;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Mind maps (13.1b): while typing in a node, Tab = new child, Enter = new sibling, Shift+Tab = up a level;
      // on a selected node, Tab = child, Shift+Tab = up, Delete asks first when the node has ideas under it,
      // Ctrl/Cmd+. folds the branch. Enter on a selected node edits it, like any sticky.
      if (canEdit && !enterMark.current.skip && (e.target as HTMLElement | null)?.closest(".excalidraw")) {
        const cur = currentNode(a);
        const editing = Boolean(a.getAppState().editingTextElement);
        const stop = () => (e.preventDefault(), e.stopPropagation());
        if (cur && editing && (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey))) {
          stop();
          const how = e.key === "Tab" ? (e.shiftKey ? "out" : "child") : "sibling";
          (document.activeElement as HTMLElement | null)?.blur();
          const from = cur.id;
          setTimeout(() => {
            const ok = how === "out" ? outdentNode(a, l, from) : Boolean(addNode(a, l, how, from));
            if (ok) editSelected(room.current, enterMark.current);
          }, 40);
          return;
        }
        if (cur && !editing && !e.altKey) {
          if (e.key === "Tab") {
            stop();
            if (e.shiftKey) outdentNode(a, l);
            else if (addNode(a, l, "child")) editSelected(room.current, enterMark.current);
            return;
          }
          if ((e.key === "Delete" || e.key === "Backspace") && !e.metaKey && !e.ctrlKey) {
            stop();
            const b = branchSize(a);
            if (b && (b.under > 0 || b.root)) setPendingDelete(b);
            else if (b) deleteNode(a, l, b.id);
            return;
          }
          if (e.key === "." && (e.metaKey || e.ctrlKey)) {
            stop();
            collapseNode(a, l);
            return;
          }
        }
      }
      if (typing || !canEdit || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "s" || e.key === "S") {
        addSticky(a, l, "#fff3bf", 180);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "Tab" && !e.shiftKey && addChild(a, l)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const el = room.current;
    el?.addEventListener("keydown", onKey, true);
    return () => el?.removeEventListener("keydown", onKey, true);
  }, [canEdit, presenting, frames.length, full]);

  // ---------- presenting: frames as slides ----------
  useEffect(() => {
    const a = api.current;
    if (presenting === null || !a) return;
    const f = frames[presenting];
    if (f) goTo(a, [f.id], { fit: true });
  }, [presenting, frames]);
  const present = async () => {
    const a = api.current;
    if (!a) return;
    // Slides: frames and sections (subsections too), in reading order.
    const fr = outline(a).map(({ id, name }) => ({ id, name }));
    setFrames(fr);
    if (!fr.length) return setProblem("Add frames (F) or sections first: each one is a slide.");
    setPresenting(0);
    await room.current?.requestFullscreen?.().catch(() => undefined);
  };
  useEffect(() => {
    const out = () => {
      if (!document.fullscreenElement) {
        setPresenting(null);
        setFull((f) => (f === "screen" ? false : f));
      }
    };
    document.addEventListener("fullscreenchange", out);
    return () => document.removeEventListener("fullscreenchange", out);
  }, []);
  useEffect(() => {
    if (presenting === null && !full && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [presenting, full]);
  // Full screen (13.1b): the browser's own where it can; otherwise a focus mode that covers the app's menus.
  const toggleFull = async () => {
    if (full) {
      setFull(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      return;
    }
    const ok = await room.current
      ?.requestFullscreen?.()
      .then(() => true)
      .catch(() => false);
    setFull(ok ? "screen" : "focus");
  };

  const timerRunning = Boolean(live.timer);

  // ---------- split ----------
  const moveToNewBoard = async () => {
    const a = api.current;
    const l = lib.current;
    if (!a || !l) return;
    const moved = selectionWithTies(a);
    if (!moved.length) return setProblem("Select what to move first.");
    const title = `${b.title} (part)`;
    const r = await splitBoardAction({ clientId: b.clientId, projectId: b.projectId, title, section: b.section, elements: moved });
    if (!r.ok || !r.id) return setProblem(r.message ?? "Couldn't make the new board.");
    replaceWithLink(a, l, moved as never, title, `/boards/${r.id}`);
  };

  const onLinkOpen = useCallback(
    (url: string) => {
      // A live card's link leads to the real page (a task, a creative…), in a new tab.
      const card = cardHref(url);
      if (card) window.open(card, "_blank", "noopener");
      else if (url.startsWith("/")) router.push(url as Route);
      else window.open(url, "_blank", "noopener,noreferrer");
    },
    [router],
  );

  // What's selected, read from the canvas itself (a sticky made a moment ago isn't on the server yet).
  // Stage 13.2: stickies turned into tasks, and links pasted onto the board (saved as references, drawn as cards).
  const [taskLinks, setTaskLinks] = useState(page.taskLinks);
  const onPasteLink = useCallback(
    (url: string) => {
      if (!ed || !canEdit) return false;
      void saveReferenceAction({ clientId: b.clientId, url }).then((r) => (r.ok ? insertCard(ed.api, ed.lib, "ref", r.value.id) : setProblem(r.message)));
      ed.api.setToast({ message: "Saving the link as a reference…", duration: 2000 });
      return true;
    },
    [ed, canEdit, b.clientId],
  );
  const onPasteList = useCallback(
    (text: string, html: string) => {
      if (!ed || !canEdit) return false;
      const items = parseHtmlList(html) ?? (looksLikeList(text) ? parseList(text) : null);
      if (!items?.length) return false;
      setPendingList(items);
      return true;
    },
    [ed, canEdit],
  );
  const target = useMemo(() => (ed && selected.length === 1 ? (boardItems(ed.api.getSceneElements()).items.find((i) => i.id === selected[0]) ?? null) : null), [ed, selected]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const x of live.comments) if (x.elementId) c.set(x.elementId, (c.get(x.elementId) ?? 0) + 1);
    return c;
  }, [live.comments]);
  // The selected picture (a screenshot on the board), for "Save to swipe file".
  const imageDataURL = useMemo(() => {
    if (!ed || selected.length !== 1) return null;
    const el = ed.api.getSceneElements().find((e) => e.id === selected[0]) as { type: string; fileId?: string } | undefined;
    return el?.type === "image" && el.fileId ? (ed.api.getFiles()[el.fileId]?.dataURL ?? null) : null;
  }, [ed, selected]);
  const PANELS: Array<{ id: Exclude<Panel, null>; label: string; icon: typeof List; badge?: number }> = [
    { id: "cards", label: "Add card", icon: LayoutTemplate },
    { id: "list", label: "List", icon: List },
    { id: "comments", label: "Comments", icon: MessageSquare, badge: live.comments.length },
    { id: "votes", label: "Votes", icon: Vote },
    { id: "outline", label: "Outline", icon: ListTree },
    { id: "history", label: "History", icon: History },
    ...(canEdit ? [{ id: "template" as const, label: "Save as template", icon: BookmarkPlus }] : []),
    { id: "keys", label: "Keys", icon: Keyboard },
  ];

  const panelLabel = panel === "map" ? "Mind map as a list" : PANELS.find((p) => p.id === panel)?.label;

  return (
    <div ref={room} className={cn("flex flex-col gap-2", presenting !== null ? "fixed inset-0 z-50 bg-background p-0" : full ? "fixed inset-0 z-50 bg-background p-2" : "h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-5rem)]")}>
      {presenting === null ? (
        <header className="flex flex-wrap items-center gap-2">
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
            <Link href={`/boards?client=${b.clientId}` as Route} className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ChevronLeft className="size-4" /> <span className="max-w-32 truncate sm:max-w-none">{b.clientName}</span>
            </Link>
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">{b.title}</h1>
          </div>
          <SaveStatus status={status} canEdit={canEdit} archived={Boolean(b.archivedAt)} level={page.level} />
          {live.timer ? <TimerBadge endsAt={live.timer.endsAt} sound={live.timer.sound} /> : null}
          {canEdit ? <TimerControl boardId={b.id} running={timerRunning} onDone={refresh} /> : null}
          {canEdit ? (
            <Button size="sm" variant="outline" disabled={!ed} onClick={() => ed && (insertMindMap(ed.api, ed.lib), editSelected(room.current, enterMark.current))} title="New mind map (then type; Enter = sibling, Tab = child)">
              <Network /> <span className="sr-only xl:not-sr-only">Mind map</span>
            </Button>
          ) : null}
          {canEdit ? (
            <Button size="sm" variant="outline" disabled={!ed} onClick={() => ed && addSection(ed.api, ed.lib)} title="Section around the selection (or an empty one)">
              <SquareDashed /> <span className="sr-only xl:not-sr-only">Section</span>
            </Button>
          ) : null}
          {canEdit ? (
            <Button size="sm" variant={grid ? "default" : "outline"} aria-pressed={grid} onClick={() => setGrid(!grid)} title="Snap to grid">
              <Grid3x3 /> <span className="sr-only xl:not-sr-only">Grid</span>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={present} disabled={!ready}>
            <Presentation /> <span className="sr-only sm:not-sr-only">Present</span>
          </Button>
          <Button size="sm" variant={full ? "default" : "outline"} aria-pressed={Boolean(full)} onClick={toggleFull} title={full ? "Leave full screen (Esc)" : "Full screen"}>
            {full ? <Minimize /> : <Maximize />} <span className="sr-only">{full ? "Leave full screen" : "Full screen"}</span>
          </Button>
          <div className="relative">
            <Button size="sm" variant="outline" onClick={() => setExportOpen(!exportOpen)} aria-expanded={exportOpen} disabled={!ready}>
              <Download /> <span className="sr-only sm:not-sr-only">Export</span>
            </Button>
            {exportOpen && ed ? (
              <ExportMenu api={ed.api} lib={ed.lib} title={b.title} onClose={() => setExportOpen(false)} onProblem={setProblem} />
            ) : null}
          </div>
        </header>
      ) : null}
      {conflict || newer ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          <AlertTriangle className="size-4" />
          {conflict ? "Someone else changed this board while you were working, so your last changes weren't saved. Copy anything you need, then reload." : `${newer} changed this board. Reload to see their changes before you carry on.`}
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      ) : null}
      {pendingList && ed ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info">
          Paste this list ({countItems(pendingList)} {countItems(pendingList) === 1 ? "item" : "items"}) as
          {(["map", "grid", "text"] as const).map((as) => (
            <Button key={as} size="sm" variant={as === "map" ? "default" : "outline"} onClick={() => (placeList(ed.api, ed.lib, pendingList, as), setPendingList(null))}>
              {as === "map" ? "Mind map" : as === "grid" ? "Sticky grid" : "Text"}
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setPendingList(null)}>
            Cancel
          </Button>
        </div>
      ) : null}
      {pendingDelete ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          {pendingDelete.root ? `Delete the whole mind map “${pendingDelete.text || "Main topic"}”${pendingDelete.under ? ` and its ${pendingDelete.under} ideas` : ""}?` : `Delete “${pendingDelete.text || "this idea"}” and the ${pendingDelete.under} ${pendingDelete.under === 1 ? "idea" : "ideas"} under it?`}
          <Button size="sm" variant="outline" className="ml-auto text-danger" onClick={() => (ed && deleteNode(ed.api, ed.lib, pendingDelete.id), setPendingDelete(null))}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>
            Keep
          </Button>
        </div>
      ) : null}
      {problem && !conflict ? (
        <p role="status" className="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-1.5 text-sm text-danger">
          {problem}
          <button type="button" className="ml-auto" aria-label="Dismiss" onClick={() => setProblem(null)}>
            <X className="size-4" />
          </button>
        </p>
      ) : null}
      {tooBig && canEdit && presenting === null ? (
        <p className="rounded-md bg-info-soft px-3 py-1.5 text-sm text-info">
          This board is getting very big. Keep it quick: select a part (a frame works well) and use “Move to a new board” in the side panel; a link to it stays here.
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 gap-2">
        <div className={cn("relative min-h-0 min-w-0 flex-1 overflow-hidden border bg-card", presenting === null ? "rounded-lg" : "")}>
          <Canvas elements={page.scene.elements} appState={page.scene.appState ?? {}} readOnly={!canEdit} presenting={presenting !== null} grid={grid} measure={Boolean(b.template) && b.version === 1} onReady={onReady} onChange={onChange as never} onLinkOpen={onLinkOpen} onPasteLink={onPasteLink} onPasteList={onPasteList} />
          {presenting !== null ? (
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm shadow-card">
              <button type="button" aria-label="Previous slide" onClick={() => setPresenting(Math.max(0, presenting - 1))}>
                <ChevronLeft className="size-4" />
              </button>
              <span className="tabular">
                {presenting + 1} / {frames.length} · {frames[presenting]?.name}
              </span>
              <button type="button" aria-label="Next slide" onClick={() => setPresenting(Math.min(frames.length - 1, presenting + 1))}>
                <ChevronRight className="size-4" />
              </button>
              <button type="button" className="ml-2 text-muted-foreground" onClick={() => setPresenting(null)}>
                Esc to leave
              </button>
            </div>
          ) : null}
          {ed && presenting === null && canEdit ? <QuickConnect key={`q${sceneTick}-${selected.join()}`} api={ed.api} lib={ed.lib} onMade={() => editSelected(room.current, enterMark.current)} /> : null}
          {ed && presenting === null && (canEdit || (target && page.level !== "view") || (target && live.voting?.open) || (imageDataURL && page.level !== "view")) ? (
            <SelectionPanel
              api={ed.api}
              lib={ed.lib}
              boardId={b.id}
              level={page.level}
              canEdit={canEdit}
              selected={selected}
              target={target}
              live={live}
              brandColours={page.brandColours}
              comments={target ? (counts.get(target.id) ?? 0) : 0}
              onComments={() => setPanel("comments")}
              onMove={moveToNewBoard}
              clientId={b.clientId}
              taskId={target ? (taskLinks.find((l) => l.elementId === target.id)?.taskId ?? null) : null}
              onTaskMade={(elementId, taskId) => {
                setTaskLinks((cur) => [...cur, { elementId, taskId }]);
                insertCard(ed.api, ed.lib, "task", taskId, { under: elementId });
              }}
              imageDataURL={imageDataURL}
              mind={
                canEdit ? (
                  <>
                    {target ? <MindControls key={sceneTick} api={ed.api} lib={ed.lib} targetId={target.id} room={room} mark={enterMark} onEditList={(m) => (setEditingMap(m), setPanel("map"))} /> : null}
                    <SectionControls key={`s${selected.join()}`} api={ed.api} lib={ed.lib} />
                    <ConnectorControls key={`c${sceneTick}`} api={ed.api} lib={ed.lib} />
                    {selected.length ? <ListActions api={ed.api} boardId={b.id} canComment={page.level !== "view"} /> : null}
                  </>
                ) : null
              }
              onDone={refresh}
              onProblem={setProblem}
            />
          ) : null}
        </div>
        {presenting === null && panel ? (
          <aside className="fixed inset-x-0 bottom-16 z-40 flex max-h-[60dvh] flex-col rounded-t-lg border bg-card shadow-card md:static md:bottom-auto md:max-h-none md:w-80 md:rounded-lg" aria-label={panelLabel}>
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <h2 className="text-sm font-semibold">{panelLabel}</h2>
              <button type="button" className="ml-auto rounded-md p-1 hover:bg-hover" aria-label="Close the panel" onClick={() => setPanel(null)}>
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {panel === "list" ? <ListPanel boardId={b.id} live={live} level={page.level} commentCounts={counts} onGo={(id) => ed && goTo(ed.api, [id], { select: true })} onDone={refresh} onProblem={setProblem} /> : null}
              {panel === "comments" ? <CommentsPanel boardId={b.id} live={live} level={page.level} people={page.people} target={target} onGo={(id) => ed && goTo(ed.api, [id], { select: true })} onDone={refresh} /> : null}
              {panel === "votes" ? <VotingPanel boardId={b.id} live={live} canRun={canEdit} onGo={(ids) => ed && goTo(ed.api, ids, { select: true, fit: true })} onDone={refresh} onProblem={setProblem} /> : null}
              {panel === "outline" ? <OutlinePanel key={sceneTick} api={ed?.api ?? null} lib={ed?.lib ?? null} canEdit={canEdit} onGo={(id) => ed && goTo(ed.api, [id], { fit: true })} /> : null}
              {panel === "map" && ed && editingMap ? <OutlineEditor key={editingMap} tick={sceneTick} api={ed.api} lib={ed.lib} mapId={editingMap} /> : null}
              {panel === "keys" ? <KeysPanel /> : null}
              {panel === "cards" ? <AddCardPanel clientId={b.clientId} canEdit={canEdit} onInsert={(kind, id) => ed && insertCard(ed.api, ed.lib, kind, id)} onProblem={setProblem} /> : null}
              {panel === "template" ? (
                <SaveAsTemplate
                  target={{ boardId: b.id }}
                  defaultName={b.title}
                  onSaved={async (id, elements) => {
                    const pic = ed && elements ? await templateThumbnail(ed.lib, elements).catch(() => null) : null;
                    if (pic) await templateThumbnailAction(id, pic);
                  }}
                />
              ) : null}
              {panel === "history" ? <HistoryPanel boardId={b.id} versions={page.versions} canEdit={canEdit} onProblem={setProblem} /> : null}
            </div>
          </aside>
        ) : null}
      </div>
      {presenting === null ? (
        <nav aria-label="Board panels" className="flex flex-wrap items-center gap-1">
          {PANELS.map((p) => (
            <Button key={p.id} size="sm" variant={panel === p.id ? "default" : "ghost"} aria-pressed={panel === p.id} onClick={() => setPanel(panel === p.id ? null : p.id)}>
              <p.icon /> {p.label}
              {p.badge ? <span className="tabular rounded-full bg-subtle px-1.5 text-xs text-foreground">{p.badge}</span> : null}
              {p.id === "votes" && live.voting?.open ? <span className="rounded-full bg-success-soft px-1.5 text-xs text-success">open</span> : null}
            </Button>
          ))}
          <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">
            <Lightbulb className="mr-1 inline size-3.5" />
            S sticky · T text · A connector · F frame · Tab child · Enter to write · all keys in Keys · {canEdit ? "saved as you go" : "view only"}
          </span>
        </nav>
      ) : null}
    </div>
  );
}

/** The shared countdown; ticks on its own so the canvas never re-renders for it. Chimes once at zero when asked. */
function TimerBadge({ endsAt, sound }: { endsAt: string; sound: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const chimed = useRef<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((Date.parse(endsAt) - now) / 1000));
  useEffect(() => {
    // Only for a timer that ended while the board was open, not one that ended long ago.
    if (left === 0 && sound && chimed.current !== endsAt && Date.parse(endsAt) > now - 5000) {
      chimed.current = endsAt;
      chime();
    }
  }, [left, sound, endsAt, now]);
  if (Date.parse(endsAt) < now - 60_000) return null;
  return (
    <span className={cn("tabular rounded-md px-2 py-1 text-sm font-semibold", left === 0 ? "bg-danger-soft text-danger" : "bg-accent text-primary")} aria-live="polite" aria-label={`Timer: ${Math.floor(left / 60)} minutes ${left % 60} seconds left`}>
      <Timer className="mr-1 inline size-4" />
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </span>
  );
}

function SaveStatus({ status, canEdit, archived, level }: { status: string; canEdit: boolean; archived: boolean; level: string }) {
  if (archived) return <span className="rounded-md bg-neutral-soft px-2 py-1 text-xs">Archived: view only</span>;
  if (!canEdit) return <span className="rounded-md bg-neutral-soft px-2 py-1 text-xs">{level === "view" ? "View and vote" : "View, react and comment"}</span>;
  const words: Record<string, string> = { saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…", error: "Not saved" };
  return (
    <span role="status" className={cn("text-xs", status === "error" ? "text-danger" : "text-muted-foreground")}>
      {words[status]}
    </span>
  );
}

function ExportMenu({ api, lib, title, onClose, onProblem }: { api: ExcalidrawImperativeAPI; lib: ExcalidrawModule; title: string; onClose: () => void; onProblem: (m: string) => void }) {
  const frames = outline(api);
  const sel = selectedIds(api);
  const frameId = frames.find((f) => sel.includes(f.id))?.id;
  const run = async (fn: () => Promise<unknown>) => {
    onClose();
    try {
      const r = await fn();
      if (typeof r === "string") onProblem(r);
    } catch {
      onProblem("Export didn't work. Try again, or export a frame at a time.");
    }
  };
  return (
    <div className="absolute right-0 z-50 mt-1 w-64 space-y-1 rounded-md border bg-popover p-2 text-sm shadow-card" role="menu">
      <button role="menuitem" type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-hover" onClick={() => run(() => exportImage(api, lib, "png", title))}>
        Whole board as PNG
      </button>
      <button role="menuitem" type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-hover" onClick={() => run(() => exportImage(api, lib, "svg", title))}>
        Whole board as SVG
      </button>
      <button role="menuitem" type="button" disabled={!frameId} className="block w-full rounded px-2 py-1.5 text-left hover:bg-hover disabled:text-muted-foreground" onClick={() => run(() => exportImage(api, lib, "png", title, frameId))}>
        Selected frame or section as PNG{frameId ? "" : " (select one)"}
      </button>
      <button role="menuitem" type="button" disabled={!frameId} className="block w-full rounded px-2 py-1.5 text-left hover:bg-hover disabled:text-muted-foreground" onClick={() => run(() => exportImage(api, lib, "svg", title, frameId))}>
        Selected frame or section as SVG
      </button>
      <button role="menuitem" type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-hover" onClick={() => run(() => exportPdf(api, lib, title))}>
        Frames and sections as PDF slides
      </button>
      <p className="px-2 pt-1 text-xs text-muted-foreground">PDF opens the print window: choose “Save as PDF”.</p>
    </div>
  );
}
