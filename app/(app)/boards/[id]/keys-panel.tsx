// Every shortcut on an Idea Board (Stage 13.1b), FigJam-like where it can be. Excalidraw's own full list: the ? button.
const GROUPS: Array<{ title: string; keys: Array<[string, string]> }> = [
  {
    title: "Make",
    keys: [
      ["S", "Sticky (then Enter to write on it)"],
      ["T", "Text"],
      ["R / D / O", "Rectangle / diamond / ellipse"],
      ["A", "Connector (arrow)"],
      ["L", "Line"],
      ["P", "Pen"],
      ["F", "Frame"],
      ["I", "Image"],
      ["E", "Eraser"],
      ["H or Space-drag", "Move around"],
    ],
  },
  {
    title: "Mind maps",
    keys: [
      ["Enter (while typing)", "New sibling idea"],
      ["Tab (while typing)", "New child idea"],
      ["Shift+Tab", "Move up a level"],
      ["Tab (node selected)", "New child idea"],
      ["Enter (node selected)", "Edit the idea"],
      ["Delete", "Remove (asks first when it has ideas under it)"],
      ["Ctrl/⌘ + .", "Fold or show a branch"],
      ["Drag onto another idea", "Move the branch under it"],
      ["Drag the main topic", "Move the whole map"],
    ],
  },
  {
    title: "Stickies and shapes",
    keys: [
      ["Tab", "Connected sticky to the right"],
      ["+ handles", "Connected sticky on that side (drag to place it)"],
      ["Double-click a connector", "Label it"],
      ["Ctrl/⌘ + Arrow", "Excalidraw's flowchart: connected shape that way"],
      ["Ctrl/⌘ + G", "Group"],
      ["Ctrl/⌘ + Shift + L", "Lock"],
    ],
  },
  {
    title: "Board",
    keys: [
      ["Shift + 1", "Fit everything on screen"],
      ["Ctrl/⌘ + Z / Shift+Z", "Undo / redo"],
      ["Paste a link", "Reference card"],
      ["Paste a list", "Mind map, sticky grid or text"],
      ["Arrows / Space (presenting)", "Next and previous slide; Esc to stop"],
      ["Esc", "Leave full screen"],
    ],
  },
];

export function KeysPanel() {
  return (
    <div className="space-y-4 text-sm">
      {GROUPS.map((g) => (
        <section key={g.title} className="space-y-1.5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">{g.title}</h3>
          <dl className="space-y-1">
            {g.keys.map(([k, what]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-36 shrink-0">
                  <kbd className="rounded border bg-subtle px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                </dt>
                <dd className="text-muted-foreground">{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
