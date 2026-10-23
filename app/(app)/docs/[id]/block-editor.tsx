"use client";

// The block editor for Docs (Stage 13.4, D-13.4a): Tiptap (MIT, free packages only) on top of the page's Markdown.
// "/" opens the block menu, "@" mentions people, tasks and clients, and Markdown shortcuts work as you type
// ("## ", "- ", "1. ", "[ ] ", "> ", "```"). It saves the page as Markdown through the same version-checked save as
// before, a moment after typing stops: when someone else saved first, nothing is overwritten.
import { Extension, Node, mergeAttributes, type Editor, type Range } from "@tiptap/core";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Mention } from "@tiptap/extension-mention";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Suggestion, type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Bold, Code, Italic, Link2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { docToMarkdown, markdownToDoc, type PMNode } from "@/lib/doc-format";
import { cn } from "@/lib/utils";
import { classifyLink, youtubeEmbed } from "@/services/rules/references";
import { aiWriteAction, mentionOptionsAction, newTableAction, saveDocJsonAction } from "../editor-actions";

// ---------- custom blocks ----------

const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes: () => ({ kind: { default: "note" } }),
  parseHTML: () => [{ tag: "div[data-callout]", getAttrs: (el) => ({ kind: (el as HTMLElement).dataset.callout ?? "note" }) }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes({ "data-callout": HTMLAttributes.kind, class: `doc-callout doc-callout-${HTMLAttributes.kind}` }), 0],
});

function atom(name: string, attrs: string[], view: (p: NodeViewProps) => ReactNode) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    draggable: true,
    addAttributes: () => Object.fromEntries(attrs.map((a) => [a, { default: "" }])),
    parseHTML: () => [{ tag: `div[data-${name}]` }],
    renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes({ [`data-${name}`]: "" }, HTMLAttributes)],
    addNodeView: () => ReactNodeViewRenderer((p: NodeViewProps) => <NodeViewWrapper className={cn("my-2 rounded-md", p.selected && "ring-2 ring-primary")}>{view(p)}</NodeViewWrapper>),
  });
}

const Embed = atom("embed", ["url"], ({ node }) => {
  const url = String(node.attrs.url ?? "");
  const yt = URL.canParse(url) ? classifyLink(new URL(url)) : null;
  return yt?.kind === "youtube" ? <iframe src={youtubeEmbed(yt.videoId)} title="YouTube video" className="pointer-events-none aspect-video w-full max-w-xl rounded-md border-0" /> : <p className="rounded-md border px-3 py-2 text-sm text-primary">{url}</p>;
});
const LiveCard = atom("liveCard", ["kind", "id"], ({ node }) => <iframe src={`/board-cards/${String(node.attrs.kind)}/${String(node.attrs.id)}`} title="Live card" className="pointer-events-none h-40 w-full max-w-md rounded-md border" />);

/** Database tables are edited in the page itself (their rows live in their own tables): the editor shows where. */
const DbTable = atom("dbTable", ["id"], () => <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Database table: its rows are edited on the page when you&apos;re done here.</p>);

const MentionWithKind = Mention.extend({
  addAttributes() {
    return { ...this.parent?.(), kind: { default: "person" } };
  },
});

// ---------- the "/" and "@" menus ----------

type MenuItem = { label: string; hint?: string; run: (editor: Editor, range: Range) => void };
type Popup = { items: Array<{ key: string; label: string; hint?: string }>; rect: DOMRect | null; pick: (i: number) => void } | null;
type PopupApi = { show: (p: Popup) => void; index: { current: number }; count: { current: number } };

function popupRender(api: PopupApi, toPopup: (props: SuggestionProps) => Popup) {
  return () => ({
    onStart: (props: SuggestionProps) => {
      api.index.current = 0;
      api.show(toPopup(props));
    },
    onUpdate: (props: SuggestionProps) => {
      api.index.current = 0;
      api.show(toPopup(props));
    },
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (!api.count.current) return false;
      if (event.key === "ArrowDown") api.index.current = (api.index.current + 1) % api.count.current;
      else if (event.key === "ArrowUp") api.index.current = (api.index.current + api.count.current - 1) % api.count.current;
      else if (event.key === "Enter") {
        document.dispatchEvent(new CustomEvent("doc-menu-pick"));
        return true;
      } else return false;
      document.dispatchEvent(new CustomEvent("doc-menu-move"));
      return true;
    },
    onExit: () => api.show(null),
  });
}

function slashItems(ask: (kind: "embed" | "card" | "image") => void, docId: string, onProblem: (m: string) => void): MenuItem[] {
  const blk = (label: string, hint: string, f: (e: Editor) => void): MenuItem => ({ label, hint, run: (e, r) => (e.chain().focus().deleteRange(r).run(), f(e)) });
  return [
    blk("Text", "Plain paragraph", (e) => e.chain().focus().setParagraph().run()),
    blk("Heading 1", "#", (e) => e.chain().focus().setHeading({ level: 1 }).run()),
    blk("Heading 2", "##", (e) => e.chain().focus().setHeading({ level: 2 }).run()),
    blk("Heading 3", "###", (e) => e.chain().focus().setHeading({ level: 3 }).run()),
    blk("Bullet list", "-", (e) => e.chain().focus().toggleBulletList().run()),
    blk("Numbered list", "1.", (e) => e.chain().focus().toggleOrderedList().run()),
    blk("Checklist", "[ ]", (e) => e.chain().focus().toggleTaskList().run()),
    blk("Quote", ">", (e) => e.chain().focus().toggleBlockquote().run()),
    blk("Callout", "A note box", (e) => e.chain().focus().insertContent({ type: "callout", attrs: { kind: "note" }, content: [{ type: "paragraph" }] }).run()),
    blk("Warning callout", "A warning box", (e) => e.chain().focus().insertContent({ type: "callout", attrs: { kind: "warning" }, content: [{ type: "paragraph" }] }).run()),
    blk("Toggle", "Hide details under a heading", (e) => e.chain().focus().insertContent({ type: "details", content: [{ type: "detailsSummary", content: [{ type: "text", text: "Details" }] }, { type: "detailsContent", content: [{ type: "paragraph" }] }] }).run()),
    blk("Divider", "---", (e) => e.chain().focus().setHorizontalRule().run()),
    blk("Code", "```", (e) => e.chain().focus().toggleCodeBlock().run()),
    blk("Table", "Simple rows and columns", (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
    blk("Database table", "Typed columns; table, board, calendar views", (e) => {
      void newTableAction(docId).then((r) => (r.ok ? e.chain().focus().insertContent({ type: "dbTable", attrs: { id: r.value.id } }).run() : onProblem(r.message)));
    }),
    blk("Image", "Upload a picture (3.5 MB)", () => ask("image")),
    blk("YouTube or link", "Plays in the page", () => ask("embed")),
    blk("Live card", "A task, creative or page from Oppllo One", () => ask("card")),
  ];
}

// ---------- the editor ----------

type SaveState = "saved" | "unsaved" | "saving" | "error";

export default function BlockEditor({ doc, onDone }: { doc: { id: string; title: string; body: string; version: number }; onDone: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [state, setState] = useState<SaveState>("saved");
  const [problem, setProblem] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [popup, setPopup] = useState<Popup>(null);
  const [selected, setSelected] = useState(0);
  // The menus' shared state, made once: Tiptap's suggestion callbacks drive it, React shows it.
  const [menu] = useState<PopupApi>(() => {
    const m: PopupApi = {
      index: { current: 0 },
      count: { current: 0 },
      show: (p) => {
        m.count.current = p?.items.length ?? 0;
        setSelected(m.index.current);
        setPopup(p);
      },
    };
    return m;
  });
  const [ask, setAsk] = useState<null | "embed" | "card" | "image" | "link" | "ai">(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [askValue, setAskValue] = useState("");
  const [, setTick] = useState(0);
  const version = useRef(doc.version);
  const saved = useRef({ title: doc.title, body: doc.body });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef(title);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, underline: false, strike: false, link: { openOnClick: false, autolink: true, protocols: ["https", "http", "mailto"] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Details.configure({ persist: true }),
      DetailsSummary,
      DetailsContent,
      Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: "Write, or press / for blocks and @ to mention someone" }),
      Callout,
      Embed,
      LiveCard,
      DbTable,
      MentionWithKind.configure({
        HTMLAttributes: { class: "doc-mention" },
        renderText: ({ node }) => `@${String(node.attrs.label ?? "")}`,
        renderHTML: ({ node }) => ["span", { class: "doc-mention", "data-kind": node.attrs.kind }, `@${String(node.attrs.label || (node.attrs.kind === "task" ? "task" : "client"))}`],
        suggestion: {
          char: "@",
          items: async ({ query }) => (await mentionOptionsAction(query)).slice(0, 8),
          render: popupRender(menu, (props) => ({
            items: (props.items as Array<{ id: string; label: string; kind: string }>).map((i) => ({ key: `${i.kind}:${i.id}`, label: i.label, hint: i.kind })),
            rect: props.clientRect?.() ?? null,
            pick: (n) => {
              const it = (props.items as Array<{ id: string; label: string; kind: string }>)[n];
              if (it) props.command({ id: it.id, label: it.label, kind: it.kind } as never);
            },
          })),
        },
      }),
      Extension.create({
        name: "slash",
        addProseMirrorPlugins() {
          const items = slashItems((k) => (setAsk(k), setAskValue("")), doc.id, setProblem);
          return [
            Suggestion({
              editor: this.editor,
              char: "/",
              startOfLine: false,
              items: ({ query }) => items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase())).slice(0, 12),
              command: ({ editor, range, props }) => (props as MenuItem).run(editor, range),
              render: popupRender(menu, (props) => ({
                items: (props.items as MenuItem[]).map((i) => ({ key: i.label, label: i.label, ...(i.hint ? { hint: i.hint } : {}) })),
                rect: props.clientRect?.() ?? null,
                pick: (n) => {
                  const it = (props.items as MenuItem[])[n];
                  if (it) props.command(it as never);
                },
              })),
            }),
          ];
        },
      }),
    ],
    content: markdownToDoc(doc.body) as never,
    editorProps: { attributes: { class: "doc-editor-content", "aria-label": "Page text" } },
    onUpdate: () => schedule(),
    onSelectionUpdate: () => setTick((t) => t + 1),
  });

  const popupRef = useRef<Popup>(null);
  useEffect(() => {
    popupRef.current = popup;
  }, [popup]);
  useEffect(() => {
    const pick = () => popupRef.current?.pick(menu.index.current);
    const move = () => setSelected(menu.index.current);
    document.addEventListener("doc-menu-pick", pick);
    document.addEventListener("doc-menu-move", move);
    return () => {
      document.removeEventListener("doc-menu-pick", pick);
      document.removeEventListener("doc-menu-move", move);
    };
  }, [menu]);

  async function save() {
    if (!editor || conflict) return;
    const body = docToMarkdown(editor.getJSON() as PMNode);
    const t = titleRef.current.trim() || "Untitled";
    if (body === saved.current.body && t === saved.current.title) return setState("saved");
    setState("saving");
    const r = await saveDocJsonAction({ docId: doc.id, version: version.current, title: t, body });
    if (r.ok) {
      version.current = r.value.version;
      saved.current = { title: t, body };
      setState("saved");
    } else {
      setState("error");
      setProblem(r.message);
      if (r.conflict) setConflict(true);
    }
  }
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  function schedule() {
    setState("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRef.current(), 1500);
  }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (state === "unsaved" || state === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  async function answer() {
    if (!editor) return;
    const v = askValue.trim();
    if (ask === "embed") {
      if (!/^https:\/\//.test(v)) return setProblem("Paste an https link.");
      editor.chain().focus().insertContent({ type: "embed", attrs: { url: v } }).run();
    } else if (ask === "card") {
      const m = /\/(tasks|creatives|docs)\/([0-9a-f-]{36})/.exec(v);
      if (!m) return setProblem("Paste a link to a task, creative or page in Oppllo One.");
      editor.chain().focus().insertContent({ type: "liveCard", attrs: { kind: m[1] === "tasks" ? "task" : m[1] === "creatives" ? "creative" : "doc", id: m[2] } }).run();
    } else if (ask === "link") {
      if (v && !/^(https?:\/\/|mailto:|\/(?![/\\]))/.test(v)) return setProblem("Links start with https://, mailto: or / (a page in Oppllo One).");
      if (v) editor.chain().focus().extendMarkRange("link").setLink({ href: v }).run();
      else editor.chain().focus().unsetLink().run();
    }
    setAsk(null);
  }

  async function upload(file: File) {
    if (!editor) return;
    const form = new FormData();
    form.set("docId", doc.id);
    form.set("file", file);
    const res = await fetch("/api/doc-files", { method: "POST", body: form });
    const data = (await res.json().catch(() => ({}))) as { src?: string; error?: string };
    if (!res.ok || !data.src) return setProblem(data.error ?? "The picture wasn't saved.");
    editor.chain().focus().setImage({ src: data.src, alt: file.name.replace(/\.[^.]+$/, "") }).run();
    setAsk(null);
  }

  /** AI on the selection (Stage 13.4): the suggestion replaces the selected text; Undo brings it back. */
  async function runAi(mode: "write" | "shorten" | "translate", extra = "") {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, "\n");
    setAiBusy(true);
    const r = await aiWriteAction({ docId: doc.id, mode, text, ask: extra });
    setAiBusy(false);
    if (!r.ok) return setProblem(r.message);
    const content = (markdownToDoc(r.value).content ?? []) as never;
    editor.chain().focus().insertContentAt({ from, to }, content).run();
    setAsk(null);
  }

  const words: Record<SaveState, string> = { saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…", error: "Not saved" };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            titleRef.current = e.target.value;
            schedule();
          }}
          aria-label="Title"
          maxLength={150}
          className="h-10 min-w-0 flex-1 text-base font-medium"
        />
        <span role="status" className={cn("text-xs", state === "error" ? "text-danger" : "text-muted-foreground")}>
          {state === "saving" ? <Loader2 className="mr-1 inline size-3 animate-spin" /> : null}
          {words[state]}
        </span>
        <Button
          size="sm"
          onClick={async () => {
            if (timer.current) clearTimeout(timer.current);
            await save();
            onDone();
          }}
          disabled={state === "saving"}
        >
          Done
        </Button>
      </div>
      {conflict || problem ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          <AlertTriangle className="size-4" /> {problem}
          {conflict ? (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => window.location.reload()}>
              Reload
            </Button>
          ) : (
            <button type="button" className="ml-auto text-xs" onClick={() => setProblem(null)}>
              Dismiss
            </button>
          )}
        </p>
      ) : null}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-md border bg-card p-1" role="toolbar" aria-label="Formatting">
        <Button size="sm" variant={editor?.isActive("bold") ? "default" : "ghost"} aria-label="Bold" onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold />
        </Button>
        <Button size="sm" variant={editor?.isActive("italic") ? "default" : "ghost"} aria-label="Italic" onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic />
        </Button>
        <Button size="sm" variant={editor?.isActive("code") ? "default" : "ghost"} aria-label="Code" onClick={() => editor?.chain().focus().toggleCode().run()}>
          <Code />
        </Button>
        <Button size="sm" variant={editor?.isActive("link") ? "default" : "ghost"} aria-label="Link" onClick={() => (setAsk("link"), setAskValue(String(editor?.getAttributes("link").href ?? "")))}>
          <Link2 />
        </Button>
        <Button size="sm" variant={ask === "ai" ? "default" : "ghost"} aria-label="AI" onClick={() => (setAsk(ask === "ai" ? null : "ai"), setAskValue(""))}>
          <Sparkles />
        </Button>
        <span className="ml-2 text-xs text-muted-foreground">Type / for blocks · @ to mention · ## heading · - list · [ ] checklist</span>
      </div>
      {ask ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-subtle p-2 text-sm">
          {ask === "ai" ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={aiBusy} onClick={() => void runAi("shorten")}>
                Shorten
              </Button>
              <Button size="sm" variant="outline" disabled={aiBusy} onClick={() => void runAi("translate", "ml")}>
                To Malayalam
              </Button>
              <Button size="sm" variant="outline" disabled={aiBusy} onClick={() => void runAi("translate", "en")}>
                To English
              </Button>
              <form
                className="flex min-w-0 flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runAi("write", askValue);
                }}
              >
                <Input value={askValue} onChange={(e) => setAskValue(e.target.value)} placeholder="Write… e.g. a checklist for an open day" aria-label="What to write" className="h-8 min-w-40 flex-1" />
                <Button size="sm" type="submit" disabled={aiBusy || !askValue.trim()}>
                  {aiBusy ? <Loader2 className="animate-spin" /> : null} Write
                </Button>
              </form>
              <span className="w-full text-xs text-muted-foreground">Select text first to shorten or translate it. The AI&apos;s text replaces the selection; Undo (Ctrl+Z) brings yours back.</span>
            </div>
          ) : ask === "image" ? (
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Picture" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          ) : (
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void answer();
              }}
            >
              <Input autoFocus value={askValue} onChange={(e) => setAskValue(e.target.value)} placeholder={ask === "embed" ? "https://www.youtube.com/watch?v=…" : ask === "card" ? "Paste a link to a task, creative or page" : "https://… or /docs/… (empty removes the link)"} aria-label="Link" className="h-8 min-w-0 flex-1" />
              <Button size="sm" type="submit">
                {ask === "link" ? "Set link" : "Add"}
              </Button>
            </form>
          )}
          <Button size="sm" variant="ghost" onClick={() => setAsk(null)}>
            Cancel
          </Button>
        </div>
      ) : null}
      <div className="doc-editor min-h-[50vh] rounded-lg border bg-card p-4 text-sm leading-relaxed">
        <EditorContent editor={editor} />
      </div>
      {popup?.items.length ? (
        <ul role="listbox" aria-label="Choose" className="fixed z-50 max-h-72 w-64 overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-card" style={{ left: Math.min((popup.rect?.left ?? 0), window.innerWidth - 270), top: (popup.rect?.bottom ?? 0) + 4 }}>
          {popup.items.map((it, i) => (
            <li key={it.key} role="option" aria-selected={i === selected}>
              <button
                type="button"
                className={cn("flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left", i === selected ? "bg-accent text-accent-foreground" : "hover:bg-hover")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  popup.pick(i);
                }}
              >
                <span className="truncate">{it.label}</span>
                {it.hint ? <span className="shrink-0 text-xs text-muted-foreground">{it.hint}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
