"use client";

// The parts around the canvas (Stage 13.1): the selection panel (stickies, colours, stamps, votes, reactions), the List
// view, comments with @mentions, voting, the frames outline, history and the timer. Phone-friendly and keyboard-usable.
import { useMemo, useState } from "react";
import { ArrowRight, ListChecks, MessageSquare, Plus, Timer } from "lucide-react";
import { MentionBox } from "@/components/mention-box";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { BOARD_REACTIONS, type AccessLevel } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { BoardState, BoardPage } from "@/services/boards";
import type { BoardItem } from "@/services/rules/boards";
import { commentAction, reactAction, removeCommentAction, restoreVersionAction, snapshotAction, timerAction, voteAction, votingAction } from "../actions";
import { SECTION_COLOURS } from "@/services/rules/sections";
import { addSticky, addStamp, recolour, STAMP_STYLE, STICKY_PALETTE, STICKY_SIZES } from "./board-tools";
import { foldSection, outline, recolourSection, renameOnBoard, selectedSection } from "./section-tools";
import { SaveImage, TaskMaker } from "./board-work";
import type { ExcalidrawImperativeAPI, ExcalidrawModule } from "./canvas";

type Wire<T> = T extends Date ? string : T extends Array<infer U> ? Array<Wire<U>> : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;
type Live = Wire<BoardState> & { items: BoardItem[] };
type Done = { ok: boolean; message?: string };
const atLeast = (have: AccessLevel, need: AccessLevel) => ["view", "comment", "edit", "manage"].indexOf(have) >= ["view", "comment", "edit", "manage"].indexOf(need);
const COLOUR_NAMES: Record<string, string> = { "#fff3bf": "Yellow", "#d3f9d8": "Green", "#d0ebff": "Blue", "#ffdeeb": "Pink", "#e5dbff": "Purple", "#ffe8cc": "Orange" };
const colourName = (c: string | null) => (c ? (COLOUR_NAMES[c.toLowerCase()] ?? c) : "No colour");

/** Runs a server action, shows its message when it fails, then refreshes the live state. */
async function act(p: Promise<Done>, onDone: () => void, onProblem?: (m: string) => void) {
  const r = await p;
  if (!r.ok && r.message) onProblem?.(r.message);
  onDone();
}

function Reactions({ boardId, item, live, canReact, onDone, onProblem }: { boardId: string; item: BoardItem; live: Live; canReact: boolean; onDone: () => void; onProblem?: (m: string) => void }) {
  const [picking, setPicking] = useState(false);
  const mine = live.reactions.filter((r) => r.elementId === item.id);
  const shown = picking ? BOARD_REACTIONS : BOARD_REACTIONS.filter((e) => mine.some((r) => r.emoji === e));
  if (!shown.length && !canReact) return null;
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Reactions">
      {shown.map((e) => {
        const r = mine.find((x) => x.emoji === e);
        return (
          <button
            key={e}
            type="button"
            disabled={!canReact}
            aria-pressed={Boolean(r?.mine)}
            aria-label={`${e} ${r?.count ?? 0}`}
            onClick={() => act(reactAction(boardId, item.id, e), () => (setPicking(false), onDone()), onProblem)}
            className={cn("rounded-full border px-1.5 py-0.5 text-xs", r?.mine ? "border-primary bg-accent" : "hover:bg-hover")}
          >
            {e}
            {r ? <span className="tabular ml-0.5">{r.count}</span> : null}
          </button>
        );
      })}
      {canReact ? (
        <button type="button" onClick={() => setPicking(!picking)} aria-expanded={picking} className="rounded-full border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-hover">
          {picking ? "Close" : "React"}
        </button>
      ) : null}
    </div>
  );
}

function VoteButtons({ boardId, item, live, onDone, onProblem }: { boardId: string; item: BoardItem; live: Live; onDone: () => void; onProblem?: (m: string) => void }) {
  const v = live.voting;
  if (!v?.open) return null;
  const mine = v.myVotes.filter((x) => x === item.id).length;
  return (
    <span className="inline-flex items-center gap-1">
      <Button size="sm" variant="outline" disabled={!v.left} onClick={() => act(voteAction(boardId, item.id, true), onDone, onProblem)} aria-label={`Vote for ${item.text || "this sticky"}`}>
        <Plus /> Vote
      </Button>
      {mine ? (
        <Button size="sm" variant="ghost" onClick={() => act(voteAction(boardId, item.id, false), onDone, onProblem)} aria-label="Take a vote back">
          {"●".repeat(mine)} take back
        </Button>
      ) : null}
    </span>
  );
}

export function SelectionPanel({
  api,
  lib,
  boardId,
  level,
  canEdit,
  selected,
  target,
  live,
  brandColours,
  comments,
  onComments,
  onMove,
  onDone,
  onProblem,
  clientId,
  taskId,
  onTaskMade,
  imageDataURL,
  mind,
}: {
  api: ExcalidrawImperativeAPI;
  lib: ExcalidrawModule;
  boardId: string;
  level: AccessLevel;
  canEdit: boolean;
  selected: string[];
  target: BoardItem | null;
  live: Live;
  brandColours: string[];
  comments: number;
  onComments: () => void;
  onMove: () => void;
  onDone: () => void;
  onProblem: (m: string) => void;
  clientId: string;
  /** The task this sticky became (Stage 13.2). */
  taskId: string | null;
  onTaskMade: (elementId: string, taskId: string) => void;
  /** The selected picture, for "Save to swipe file". */
  imageDataURL: string | null;
  /** Mind-map controls for the selection (13.1b). */
  mind?: React.ReactNode;
}) {
  const [making, setMaking] = useState(false);
  const [savedImage, setSavedImage] = useState(false);
  const [size, setSize] = useState<keyof typeof STICKY_SIZES>("M");
  // Phones start with the tools folded away, so the canvas stays visible.
  const [small, setSmall] = useState(() => window.matchMedia("(max-width: 639px)").matches);
  if (small)
    return (
      <button type="button" onClick={() => setSmall(false)} className="absolute right-2 bottom-16 z-10 rounded-lg border bg-card px-2 py-1 text-xs shadow-card" aria-expanded="false">
        Sticky tools{target ? " · selected" : ""}
      </button>
    );
  const colours = [...STICKY_PALETTE, ...brandColours.filter((c) => !(STICKY_PALETTE as readonly string[]).includes(c))];
  return (
    <div className="absolute right-2 bottom-16 z-10 max-w-[calc(100%-1rem)] space-y-2 rounded-lg border bg-card p-2 text-sm shadow-card sm:w-72">
      <button type="button" onClick={() => setSmall(true)} className="absolute top-1 right-1 rounded px-1 text-xs text-muted-foreground hover:bg-hover" aria-label="Make the sticky tools small" aria-expanded="true">
        –
      </button>
      {canEdit ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{selected.length ? "Colour the selection, or add a sticky beside it" : "Add a sticky (S)"}</p>
          <div className="flex flex-wrap items-center gap-1">
            {colours.map((c, i) => (
              <button
                key={c}
                type="button"
                title={i >= STICKY_PALETTE.length ? `Brand colour ${c}` : colourName(c)}
                aria-label={selected.length ? `Colour selection ${colourName(c)}` : `Add a ${colourName(c)} sticky`}
                onClick={() => (selected.length ? recolour(api, lib, c) : addSticky(api, lib, c, STICKY_SIZES[size]))}
                className={cn("size-6 rounded-md border", i >= STICKY_PALETTE.length && "ring-2 ring-primary/40")}
                style={{ backgroundColor: c }}
              />
            ))}
            <span className="ml-1 inline-flex overflow-hidden rounded-md border" role="group" aria-label="Sticky size">
              {(Object.keys(STICKY_SIZES) as Array<keyof typeof STICKY_SIZES>).map((s) => (
                <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)} className={cn("px-1.5 text-xs", size === s ? "bg-accent text-primary" : "hover:bg-hover")}>
                  {s}
                </button>
              ))}
            </span>
            {selected.length ? (
              <Button size="sm" variant="ghost" onClick={() => addSticky(api, lib, "#fff3bf", STICKY_SIZES[size])}>
                <Plus /> Sticky
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {target ? (
        <div className="space-y-1.5 border-t pt-2">
          <p className="line-clamp-2 text-xs font-medium">{target.text || "Empty sticky"}</p>
          <div className="flex flex-wrap items-center gap-1">
            <VoteButtons boardId={boardId} item={target} live={live} onDone={onDone} onProblem={onProblem} />
            {atLeast(level, "comment") ? (
              <Button size="sm" variant="ghost" onClick={onComments}>
                <MessageSquare /> {comments ? comments : "Comment"}
              </Button>
            ) : null}
          </div>
          <Reactions boardId={boardId} item={target} live={live} canReact={atLeast(level, "comment")} onDone={onDone} onProblem={onProblem} />
          {taskId ? (
            <a href={`/tasks/${taskId}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <ListChecks className="size-3.5" /> It&apos;s a task: open it
            </a>
          ) : canEdit && (target.kind === "sticky" || target.kind === "shape") ? (
            making ? (
              <TaskMaker clientId={clientId} boardId={boardId} elementId={target.id} text={target.text} onProblem={onProblem} onMade={(id) => (setMaking(false), onTaskMade(target.id, id))} />
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setMaking(true)}>
                <ListChecks /> Make it a task
              </Button>
            )
          ) : null}
          {canEdit ? (
            <div className="flex flex-wrap gap-1" aria-label="Stamps">
              {Object.entries(STAMP_STYLE).map(([id, s]) => (
                <button key={id} type="button" onClick={() => addStamp(api, lib, id)} className={cn("rounded px-1.5 py-0.5 text-xs text-white", target.stamp === id && "ring-2 ring-foreground")} style={{ backgroundColor: s.colour }}>
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {mind}
      {imageDataURL && atLeast(level, "comment") ? (
        <div className="border-t pt-2">{savedImage ? <p className="text-xs text-success">Saved to the swipe file.</p> : <SaveImage clientId={clientId} dataURL={imageDataURL} onDone={() => setSavedImage(true)} onProblem={onProblem} />}</div>
      ) : null}
      {canEdit && selected.length ? (
        <Button size="sm" variant="ghost" className="w-full justify-start" onClick={onMove}>
          <ArrowRight /> Move to a new board
        </Button>
      ) : null}
    </div>
  );
}

export function ListPanel({ boardId, live, level, commentCounts, onGo, onDone, onProblem }: { boardId: string; live: Live; level: AccessLevel; commentCounts: Map<string, number>; onGo: (id: string) => void; onDone: () => void; onProblem: (m: string) => void }) {
  const [frame, setFrame] = useState("");
  const [colour, setColour] = useState("");
  const [byVotes, setByVotes] = useState(false);
  const votes = useMemo(() => new Map((live.voting?.results ?? []).map((r) => [r.elementId, r.votes])), [live.voting]);
  const frames = [...new Set(live.items.flatMap((i) => [i.frame, i.section]).filter((f): f is string => Boolean(f)))];
  const colours = [...new Set(live.items.map((i) => i.colour).filter((c): c is string => Boolean(c)))];
  let items = live.items.filter((i) => (!frame || (frame === "-" ? !i.frame && !i.section : i.frame === frame || i.section === frame || Boolean(i.section?.startsWith(`${frame} › `)))) && (!colour || i.colour === colour));
  if (byVotes) items = [...items].sort((a, b) => (votes.get(b.id) ?? 0) - (votes.get(a.id) ?? 0));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Select value={frame} onChange={(e) => setFrame(e.target.value)} aria-label="Filter by frame or section" className="h-8 text-xs">
          <option value="">Every frame and section</option>
          {frames.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
          <option value="-">Not in a frame or section</option>
        </Select>
        <Select value={colour} onChange={(e) => setColour(e.target.value)} aria-label="Filter by colour" className="h-8 text-xs">
          <option value="">Every colour</option>
          {colours.map((c) => (
            <option key={c} value={c}>
              {colourName(c)}
            </option>
          ))}
        </Select>
      </div>
      {live.voting?.results ? (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={byVotes} onChange={(e) => setByVotes(e.target.checked)} /> Most votes first
        </label>
      ) : null}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {items.length} of {live.items.length}
      </p>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className="space-y-1.5 rounded-md border p-2">
            <div className="flex items-start gap-2">
              <span className="mt-1 size-3 shrink-0 rounded-sm border" style={{ backgroundColor: i.colour ?? "transparent" }} aria-label={colourName(i.colour)} />
              <p className="min-w-0 flex-1 text-sm break-words whitespace-pre-wrap">{i.text || <span className="text-muted-foreground italic">Empty {i.kind}</span>}</p>
              <button type="button" className="shrink-0 text-xs text-primary hover:underline" onClick={() => onGo(i.id)}>
                Show
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {[i.frame ?? i.section ?? "No frame or section", i.frame && i.section ? i.section : null, i.kind === "sticky" ? null : i.kind === "node" ? "mind map" : i.kind, i.stamp ? STAMP_STYLE[i.stamp]?.label : null, votes.get(i.id) ? `${votes.get(i.id)} votes` : null, commentCounts.get(i.id) ? `${commentCounts.get(i.id)} comments` : null].filter(Boolean).join(" · ")}
            </p>
            <div className="flex flex-wrap items-center gap-1">
              <VoteButtons boardId={boardId} item={i} live={live} onDone={onDone} onProblem={onProblem} />
            </div>
            <Reactions boardId={boardId} item={i} live={live} canReact={atLeast(level, "comment")} onDone={onDone} onProblem={onProblem} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CommentsPanel({ boardId, live, level, people, target, onGo, onDone }: { boardId: string; live: Live; level: AccessLevel; people: BoardPage["people"]; target: BoardItem | null; onGo: (id: string) => void; onDone: () => void }) {
  const [only, setOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const textOf = new Map(live.items.map((i) => [i.id, i.text]));
  const list = target && only ? live.comments.filter((c) => c.elementId === target.id) : live.comments;
  return (
    <div className="space-y-3">
      {target ? (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Only on “{target.text.slice(0, 40) || "this sticky"}”
        </label>
      ) : null}
      {list.length ? (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id} className="space-y-1 rounded-md border p-2 text-sm">
              <p className="text-xs text-muted-foreground">
                {c.authorName} · {formatDateTime(new Date(c.createdAt))}
              </p>
              <p className="break-words whitespace-pre-wrap">{c.body}</p>
              <p className="flex gap-3 text-xs">
                {c.elementId ? (
                  <button type="button" className="text-primary hover:underline" onClick={() => onGo(c.elementId!)}>
                    On “{(textOf.get(c.elementId) ?? "a removed sticky").slice(0, 30)}”
                  </button>
                ) : (
                  <span className="text-muted-foreground">On the board</span>
                )}
                {c.canRemove ? (
                  removing === c.id ? (
                    <>
                      <button type="button" className="font-medium text-danger" onClick={() => act(removeCommentAction(c.id), () => (setRemoving(null), onDone()), setError)}>
                        Remove
                      </button>
                      <button type="button" onClick={() => setRemoving(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setRemoving(c.id)}>
                      Remove
                    </button>
                  )
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No comments {target && only ? "on this sticky " : ""}yet.</p>
      )}
      {atLeast(level, "comment") ? (
        <form
          key={key}
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = String(new FormData(e.currentTarget).get("body") ?? "");
            const r = await commentAction(boardId, target?.id ?? null, body);
            if (!r.ok) return setError(r.message ?? "Not sent.");
            setError(null);
            setKey(key + 1);
            onDone();
          }}
        >
          <MentionBox people={people} name="body" defaultValue="" label={target ? "Comment on this sticky" : "Comment on the board"} placeholder={target ? "Comment on this sticky… @ to mention" : "Select a sticky to pin it, or comment on the board… @ to mention"} />
          {error ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}
          <Button size="sm" type="submit">
            Send
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Your access here is view and vote, so you can read comments but not write them.</p>
      )}
    </div>
  );
}

export function VotingPanel({ boardId, live, canRun, onGo, onDone, onProblem }: { boardId: string; live: Live; canRun: boolean; onGo: (ids: string[]) => void; onDone: () => void; onProblem: (m: string) => void }) {
  const [per, setPer] = useState(3);
  const [clearing, setClearing] = useState(false);
  const v = live.voting;
  return (
    <div className="space-y-3 text-sm">
      {v ? (
        <p>
          Round {v.round}: {v.open ? "open" : "closed"} · {v.perPerson} votes each · {v.voters} {v.voters === 1 ? "person has" : "people have"} voted.
          {v.open ? ` You have ${v.left} left: select a sticky (or use the List) and press Vote.` : ""}
        </p>
      ) : (
        <p className="text-muted-foreground">No vote running.{canRun ? " Start one: everyone gets the same number of votes, and nobody sees the counts until you reveal them." : ""}</p>
      )}
      {canRun ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            Votes each
            <Input type="number" min={1} max={20} value={per} onChange={(e) => setPer(Number(e.target.value))} className="h-8 w-16" />
          </label>
          <Button size="sm" onClick={() => act(votingAction(boardId, { start: per }), onDone, onProblem)}>
            {v ? "New round" : "Start voting"}
          </Button>
          {v?.open ? (
            <Button size="sm" variant="outline" onClick={() => act(votingAction(boardId, "reveal"), onDone, onProblem)}>
              Reveal results
            </Button>
          ) : null}
          {v ? (
            clearing ? (
              <span className="flex items-center gap-1 text-xs">
                Clear the vote?
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => act(votingAction(boardId, "clear"), () => (setClearing(false), onDone()), onProblem)}>
                  Clear
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setClearing(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setClearing(true)}>
                Clear
              </Button>
            )
          ) : null}
        </div>
      ) : null}
      {v?.results ? (
        v.results.length ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Results</h3>
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => onGo(v.results!.slice(0, 3).map((r) => r.elementId))}>
                Highlight the top 3
              </Button>
            </div>
            <ol className="space-y-1">
              {v.results.map((r, i) => (
                <li key={r.elementId} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", i < 3 ? "bg-accent" : "bg-subtle")}>
                  <span className="tabular w-6 font-semibold text-primary">{r.votes}</span>
                  <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onGo([r.elementId])}>
                    {r.text || "Empty sticky"}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-muted-foreground">Nobody voted.</p>
        )
      ) : null}
    </div>
  );
}

/** The board's outline (13.1b): frames and sections, subsections indented; jump, rename, fold. */
export function OutlinePanel({ api, lib, canEdit, onGo }: { api: ExcalidrawImperativeAPI | null; lib: ExcalidrawModule | null; canEdit: boolean; onGo: (id: string) => void }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const items = api ? outline(api) : [];
  return items.length ? (
    <ol className="space-y-0.5 text-sm" aria-label="Frames and sections">
      {items.map((f, i) => (
        <li key={f.id} className="flex items-center gap-1" style={{ paddingLeft: f.depth * 16 }}>
          {renaming === f.id && api && lib ? (
            <form
              className="flex min-w-0 flex-1 gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                renameOnBoard(api, lib, f.id, name);
                setRenaming(null);
              }}
            >
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="New name" className="h-7 text-xs" maxLength={80} />
              <Button size="sm" type="submit">
                Save
              </Button>
            </form>
          ) : (
            <button type="button" className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left hover:bg-hover" onClick={() => onGo(f.id)}>
              <span className="tabular mr-2 text-muted-foreground">{i + 1}</span>
              {f.name}
              <span className="ml-1 text-xs text-muted-foreground">{f.kind === "frame" ? "frame" : f.depth ? "subsection" : "section"}</span>
              {f.collapsed ? <span className="ml-1 text-xs text-muted-foreground">(folded)</span> : null}
            </button>
          )}
          {canEdit && api && lib && renaming !== f.id ? (
            <>
              <button type="button" className="rounded px-1 text-xs text-muted-foreground hover:bg-hover hover:text-foreground" onClick={() => (setRenaming(f.id), setName(f.name))}>
                Rename
              </button>
              {f.kind === "section" ? (
                <button type="button" className="rounded px-1 text-xs text-muted-foreground hover:bg-hover hover:text-foreground" onClick={() => foldSection(api, lib, f.id)}>
                  {f.collapsed ? "Open" : "Fold"}
                </button>
              ) : null}
            </>
          ) : null}
        </li>
      ))}
    </ol>
  ) : (
    <p className="text-sm text-muted-foreground">No frames or sections yet. Select some stickies and press Section (or draw a frame with F): they group work, become slides when presenting and pages in the PDF.</p>
  );
}

/** The selected section's name, colour and fold (13.1b). */
export function SectionControls({ api, lib }: { api: ExcalidrawImperativeAPI; lib: ExcalidrawModule }) {
  const sec = selectedSection(api);
  const [name, setName] = useState(sec?.name ?? "");
  if (!sec) return null;
  return (
    <div className="space-y-1.5 border-t pt-2" aria-label="Section">
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          renameOnBoard(api, lib, sec.id, name);
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Section name" className="h-8 text-xs" maxLength={80} />
        <Button size="sm" variant="outline" type="submit">
          Rename
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-1">
        {SECTION_COLOURS.map((c) => (
          <button key={c} type="button" aria-label={`Section colour ${c}`} onClick={() => recolourSection(api, lib, sec.id, c)} className={cn("size-6 rounded-md border", sec.colour === c && "ring-2 ring-primary")} style={{ backgroundColor: c }} />
        ))}
        <Button size="sm" variant="ghost" onClick={() => foldSection(api, lib, sec.id)}>
          {sec.collapsed ? "Open" : "Fold"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Moving the section moves everything inside it. Draw a section inside another for a subsection.</p>
    </div>
  );
}

export function HistoryPanel({ boardId, versions, canEdit, onProblem }: { boardId: string; versions: BoardPage["versions"]; canEdit: boolean; onProblem: (m: string) => void }) {
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <div className="space-y-3 text-sm">
      {canEdit ? (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await snapshotAction(boardId, name);
            if (!r.ok) return onProblem(r.message ?? "Not kept.");
            setSaved(name);
            setName("");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Before client review" aria-label="Snapshot name" className="h-8" maxLength={80} />
          <Button size="sm" type="submit" disabled={!name.trim()}>
            Keep
          </Button>
        </form>
      ) : null}
      {saved ? <p className="text-xs text-success">Kept “{saved}”. Reload to see it in the list.</p> : null}
      <p className="text-xs text-muted-foreground">A version is kept automatically every 15 minutes while people work, and before any restore.</p>
      <ul className="space-y-1">
        {versions.map((v) => (
          <li key={v.id} className="rounded-md border px-2 py-1.5">
            <p className="font-medium">{v.name ?? `Automatic · version ${v.version}`}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(new Date(v.createdAt))}
              {v.createdByName ? ` · ${v.createdByName}` : ""} · {v.objectCount} objects
            </p>
            {canEdit ? (
              confirming === v.id ? (
                <p className="flex items-center gap-2 text-xs">
                  Put the board back to this? (Now is kept as a version first.)
                  <button
                    type="button"
                    className="font-medium text-primary"
                    onClick={async () => {
                      const r = await restoreVersionAction(boardId, v.id);
                      if (!r.ok) return onProblem(r.message ?? "Not restored.");
                      window.location.reload();
                    }}
                  >
                    Restore
                  </button>
                  <button type="button" onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </p>
              ) : (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setConfirming(v.id)}>
                  Restore this version
                </button>
              )
            ) : null}
          </li>
        ))}
      </ul>
      {versions.length ? null : <p className="text-muted-foreground">No versions yet.</p>}
    </div>
  );
}

export function TimerControl({ boardId, running, onDone }: { boardId: string; running: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(true);
  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Timer /> <span className="sr-only sm:not-sr-only">Timer</span>
      </Button>
      {open ? (
        <div className="absolute right-0 z-50 mt-1 w-56 space-y-2 rounded-md border bg-popover p-2 text-sm shadow-card">
          <div className="flex flex-wrap gap-1">
            {[1, 3, 5, 10, 15].map((m) => (
              <Button key={m} size="sm" variant="outline" onClick={() => act(timerAction(boardId, { minutes: m, sound }), () => (setOpen(false), onDone()))}>
                {m} min
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Chime at the end
          </label>
          {running ? (
            <Button size="sm" variant="ghost" onClick={() => act(timerAction(boardId, null), () => (setOpen(false), onDone()))}>
              Stop the timer
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
