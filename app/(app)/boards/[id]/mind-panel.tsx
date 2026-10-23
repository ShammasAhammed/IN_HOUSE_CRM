"use client";

// Mind-map controls for the selected node (Stage 13.1b): add, fold, layout, node style, branch colours; and
// "Make mind map" on a sticky, shape or text. Phones use these instead of the keys.
import { useRef, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, ClipboardList, FileText, GitBranchPlus, ListPlus, ListTree, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { childrenOf, MIND_LAYOUT_LABELS, MIND_LAYOUTS, NODE_STYLES, type MindLayout, type NodeStyle } from "@/services/rules/mind-map";
import { addNode, collapseNode, currentNode, editSelected, makeMindMap, setMapLook } from "./mind-tools";
import type { ExcalidrawImperativeAPI, ExcalidrawModule } from "./canvas";
import { applyOutlineText, asMarkdown, mapMarkdown, selectionAsList } from "./list-tools";
import { boardToDocAction } from "./work-actions";

const STYLE_LABELS: Record<NodeStyle, string> = { sticky: "Sticky", pill: "Pill", text: "Plain text" };

export function MindControls({ api, lib, targetId, room, mark, extra, onEditList }: { api: ExcalidrawImperativeAPI; lib: ExcalidrawModule; targetId: string; room: React.RefObject<HTMLElement | null>; mark: React.RefObject<{ skip: boolean }>; extra?: React.ReactNode; onEditList: (mapId: string) => void }) {
  const cur = currentNode(api);
  if (!cur || cur.id !== targetId) {
    return (
      <Button size="sm" variant="ghost" onClick={() => makeMindMap(api, lib, targetId)}>
        <Network /> Make mind map
      </Button>
    );
  }
  const { tree, id } = cur;
  const node = tree.nodes.get(id)!;
  const kids = childrenOf(tree, id).length;
  return (
    <div className="space-y-1.5 border-t pt-2" aria-label="Mind map">
      <p className="text-xs text-muted-foreground">Mind map · typing: Enter = sibling, Tab = child, Shift+Tab = up a level</p>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={() => addNode(api, lib, "child") && editSelected(room.current, mark.current)}>
          <GitBranchPlus /> Child
        </Button>
        <Button size="sm" variant="outline" onClick={() => addNode(api, lib, "sibling") && editSelected(room.current, mark.current)}>
          <ListPlus /> {id === tree.root ? "Branch" : "Sibling"}
        </Button>
        {kids ? (
          <Button size="sm" variant="ghost" onClick={() => collapseNode(api, lib)}>
            {node.collapsed ? <ChevronsUpDown /> : <ChevronsDownUp />} {node.collapsed ? `Show ${kids}` : "Fold"}
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Select value={tree.layout} onChange={(e) => setMapLook(api, lib, { layout: e.target.value as MindLayout })} aria-label="Layout" className="h-8 text-xs">
          {MIND_LAYOUTS.map((l) => (
            <option key={l} value={l}>
              {MIND_LAYOUT_LABELS[l]}
            </option>
          ))}
        </Select>
        <Select value={tree.style} onChange={(e) => setMapLook(api, lib, { style: e.target.value as NodeStyle })} aria-label="Node style" className="h-8 text-xs">
          {NODE_STYLES.map((s) => (
            <option key={s} value={s}>
              {STYLE_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
      <Button size="sm" variant="ghost" onClick={() => onEditList(tree.map)}>
        <ListTree /> Edit as a list
      </Button>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={tree.colours} onChange={(e) => setMapLook(api, lib, { colours: e.target.checked })} /> Branch colours
      </label>
      {extra}
    </div>
  );
}

/** "Copy as list" and "Make a Docs page" for the selection (stickies, a mind map, sections). */
export function ListActions({ api, boardId, canComment }: { api: ExcalidrawImperativeAPI; boardId: string; canComment: boolean }) {
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const [making, setMaking] = useState(false);
  const [title, setTitle] = useState("");
  const list = () => asMarkdown(selectionAsList(api));
  return (
    <div className="space-y-1.5 border-t pt-2">
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            const md = list();
            if (!md) return setMsg("Select stickies or a mind map first.");
            try {
              await navigator.clipboard.writeText(md);
              setMsg("Copied as a Markdown list.");
            } catch {
              setMsg("Your browser didn't allow copying. Use Make a Docs page instead.");
            }
          }}
        >
          <ClipboardList /> Copy as list
        </Button>
        {canComment ? (
          <Button size="sm" variant="ghost" onClick={() => setMaking(!making)}>
            <FileText /> Make a Docs page
          </Button>
        ) : null}
      </div>
      {making ? (
        <form
          className="flex gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            const md = list();
            if (!md) return setMsg("Select stickies or a mind map first.");
            const r = await boardToDocAction({ boardId, title, markdown: md });
            if (!r.ok) return setMsg(r.message);
            setMaking(false);
            setMsg(
              <a href={`/docs/${r.value.id}`} target="_blank" rel="noopener" className="text-primary hover:underline">
                Page made: open it
              </a>,
            );
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Page title" aria-label="Page title" className="h-8 text-xs" required maxLength={200} />
          <Button size="sm" type="submit">
            Make
          </Button>
        </form>
      ) : null}
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}

/** The outline editor (13.1b): a mind map as an indented list; edits here change the map, map edits show here. */
export function OutlineEditor({ api, lib, mapId }: { api: ExcalidrawImperativeAPI; lib: ExcalidrawModule; mapId: string; /** The board's change counter: re-render when the map changes. */ tick: number }) {
  const [text, setText] = useState(() => mapMarkdown(api, mapId) ?? "");
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While the box isn't being typed in, it follows the map (keyed by the board's change counter in the parent).
  const fromMap = mapMarkdown(api, mapId);
  const shown = focused ? text : (fromMap ?? text);
  if (fromMap === null) return <p className="text-sm text-muted-foreground">This mind map isn&apos;t on the board any more.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">One idea per line; indent with two spaces (or Tab) for a sub-idea. The map follows as you type.</p>
      <Textarea
        value={shown}
        rows={18}
        aria-label="Mind map as a list"
        className="font-mono text-xs"
        onFocus={() => (setText(fromMap), setFocused(true))}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          // Tab indents the line instead of leaving the box.
          e.preventDefault();
          const el = e.currentTarget;
          const start = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
          const next = e.shiftKey ? el.value.slice(0, start) + el.value.slice(start).replace(/^ {1,2}/, "") : `${el.value.slice(0, start)}  ${el.value.slice(start)}`;
          setText(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => applyOutlineText(api, lib, mapId, next), 400);
        }}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => applyOutlineText(api, lib, mapId, v), 400);
        }}
      />
    </div>
  );
}
