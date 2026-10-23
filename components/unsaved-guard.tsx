"use client";

// "Leave without saving?" for long forms (QA S8-B5). Put <UnsavedGuard /> inside a <form>: once something is typed,
// closing or reloading the tab asks the browser's own question, and links inside the app ask in the page. Saving
// clears it. The browser's Back button isn't covered.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function UnsavedGuard() {
  const marker = useRef<HTMLSpanElement>(null);
  const dirty = useRef(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    const onEdit = () => (dirty.current = true);
    const onSubmit = () => (dirty.current = false);
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (!dirty.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || form.contains(a)) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      e.preventDefault();
      setLeaving(url.pathname + url.search + url.hash);
    };
    form.addEventListener("input", onEdit);
    form.addEventListener("change", onEdit);
    form.addEventListener("submit", onSubmit);
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      form.removeEventListener("input", onEdit);
      form.removeEventListener("change", onEdit);
      form.removeEventListener("submit", onSubmit);
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return (
    <>
      <span ref={marker} hidden />
      {leaving ? (
        <div role="alertdialog" aria-label="Unsaved changes" className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm shadow-lg md:bottom-6">
          <span className="basis-full">You have unsaved changes. Leave without saving?</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              dirty.current = false;
              const to = leaving;
              setLeaving(null);
              router.push(to as Parameters<typeof router.push>[0]);
            }}
          >
            Leave
          </Button>
          <Button type="button" size="sm" onClick={() => setLeaving(null)}>
            Stay
          </Button>
        </div>
      ) : null}
    </>
  );
}
