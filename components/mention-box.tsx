"use client";

// A text box that suggests people after "@" and inserts "@Full Name" (task comments, chat).
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui/avatar";
import { Textarea } from "./ui/input";

type Person = { id: string; name: string };

/** A comment box that suggests people after "@" and inserts "@Full Name". */
export function MentionBox({
  people,
  name,
  defaultValue,
  placeholder = "Write a comment… type @ to mention someone",
  label = "Comment",
  required = true,
  rows = 2,
  onEnter,
}: {
  people: Person[];
  name: string;
  defaultValue: string;
  placeholder?: string;
  label?: string;
  required?: boolean;
  rows?: number;
  /** Enter (without Shift) when no suggestion is open: chat sends with it. */
  onEnter?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const matches =
    query === null
      ? []
      : people
          .filter((p) => {
            const q = query.toLowerCase();
            return p.name.toLowerCase().startsWith(q) || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q));
          })
          .slice(0, 6);

  const read = () => {
    const el = ref.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const m = /(?:^|[^\p{L}\p{N}_])@([\p{L}]*(?: [\p{L}]*)?)$/u.exec(before);
    setQuery(m ? m[1]! : null);
    setActive(0);
  };

  const pick = (p: Person) => {
    const el = ref.current;
    if (!el || query === null) return;
    const at = el.selectionStart - query.length;
    el.value = `${el.value.slice(0, at)}${p.name} ${el.value.slice(el.selectionStart)}`;
    const caret = at + p.name.length + 1;
    el.setSelectionRange(caret, caret);
    el.focus();
    setQuery(null);
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        name={name}
        rows={rows}
        placeholder={placeholder}
        aria-label={label}
        defaultValue={defaultValue}
        required={required}
        onInput={read}
        onClick={read}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onKeyDown={(e) => {
          if (!matches.length) {
            if (onEnter && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onEnter();
            }
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            pick(matches[active]!);
          } else if (e.key === "Escape") setQuery(null);
        }}
        aria-autocomplete="list"
        aria-expanded={matches.length > 0}
      />
      {matches.length ? (
        <ul role="listbox" aria-label="People to mention" className="absolute top-full left-0 z-20 mt-1 w-64 max-w-full overflow-hidden rounded-md border bg-card py-1 shadow-card">
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                className={cn("flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-hover", i === active && "bg-hover")}
              >
                <Avatar name={p.name} size="sm" />
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
