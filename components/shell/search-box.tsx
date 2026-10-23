"use client";

// The sidebar's search box (Stage 9b.4). "/" or Ctrl/⌘+K jumps to it from anywhere; Enter opens the results.
import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

export function SearchBox() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form action="/search" role="search" className="relative">
      <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
      <input
        ref={ref}
        name="q"
        type="search"
        aria-label="Search everything"
        placeholder="Search…"
        className="h-8 w-full rounded-md border bg-card pr-9 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
      />
      <kbd className="pointer-events-none absolute top-1.5 right-2 rounded border px-1 text-[10px] text-muted-foreground">/</kbd>
    </form>
  );
}
