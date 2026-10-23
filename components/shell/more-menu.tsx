"use client";

// The phone menu (test report H5): the bottom bar keeps four everyday sections, and "More" opens every other
// section the person can see, plus sign out (moved here, away from the bell).
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function MoreMenu({ children, active, dot = false }: { children: React.ReactNode; active: boolean; dot?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [at, setAt] = useState(pathname);
  // A link was followed: close.
  if (at !== pathname) {
    setAt(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="more-menu"
        onClick={() => setOpen((o) => !o)}
        className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground [&_svg]:size-5", (open || active) && "text-primary")}
      >
        {open ? <X /> : <Menu />}
        More
        {dot && !open ? (
          <span className="absolute top-1.5 left-1/2 ml-2 size-2 rounded-full bg-primary">
            <span className="sr-only">, unread chat messages</span>
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30 bg-foreground/20" aria-hidden onClick={() => setOpen(false)} />
          <div id="more-menu" role="dialog" aria-label="All sections" className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 max-h-[70vh] overflow-y-auto rounded-t-xl border-t bg-background p-3 shadow-card">
            {children}
          </div>
        </>
      ) : null}
    </>
  );
}
