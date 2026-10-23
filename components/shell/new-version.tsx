"use client";

// A new version went live while this tab was open (test report H4). Saves made from the old page would fail
// ("Server Action … was not found"), so: notice the new version early, offer a reload, and keep what was typed.
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "../ui/button";

const DRAFT_PREFIX = "oppllo:draft:";
const RESTORE_FLAG = "oppllo:restore";

/** True for the error an old page gets when it calls a save the new version doesn't have. */
export function isNewVersionError(err: unknown): boolean {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /UnrecognizedActionError|Server Action .* was not found|Failed to find Server Action/i.test(text);
}

function draftKey(el: HTMLInputElement | HTMLTextAreaElement): string | null {
  const form = el.form;
  if (!form || !el.name || el.type === "hidden" || el.type === "password" || el.type === "file") return null;
  const index = Array.from(document.forms).indexOf(form);
  return `${DRAFT_PREFIX}${location.pathname}${location.search}:${index}:${el.name}`;
}

/** Remember typed text in this tab (sessionStorage: gone when the tab closes), to put back after a reload. */
function keepDrafts() {
  const onInput = (e: Event) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || (el instanceof HTMLInputElement && ["checkbox", "radio", "submit", "button"].includes(el.type))) return;
    const key = draftKey(el);
    try {
      if (key) sessionStorage.setItem(key, el.value);
    } catch {}
  };
  // A finished save needs no draft.
  const onSubmit = (e: Event) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    for (const el of Array.from(form.elements)) {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const key = draftKey(el);
        if (key) setTimeout(() => sessionStorage.removeItem(key), 15_000);
      }
    }
  };
  document.addEventListener("input", onInput, true);
  document.addEventListener("submit", onSubmit, true);
  return () => {
    document.removeEventListener("input", onInput, true);
    document.removeEventListener("submit", onSubmit, true);
  };
}

function restoreDrafts() {
  try {
    if (!sessionStorage.getItem(RESTORE_FLAG)) return;
    sessionStorage.removeItem(RESTORE_FLAG);
    // Pages stream in: try for a few seconds.
    let tries = 0;
    const run = () => {
      let left = 0;
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)!;
        if (!key.startsWith(`${DRAFT_PREFIX}${location.pathname}${location.search}:`)) continue;
        const [index, ...name] = key.slice(`${DRAFT_PREFIX}${location.pathname}${location.search}:`.length).split(":");
        const form = document.forms[Number(index)];
        const el = form?.elements.namedItem(name.join(":"));
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          if (!el.value) {
            el.value = sessionStorage.getItem(key) ?? "";
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        } else left++;
      }
      if (left && ++tries < 10) setTimeout(run, 500);
    };
    run();
  } catch {}
}

/** Reload into the new version, putting typed text back afterwards. */
export function reloadKeepingDrafts() {
  try {
    sessionStorage.setItem(RESTORE_FLAG, "1");
  } catch {}
  location.reload();
}

export function NewVersionBanner({ version }: { version: string }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const stop = keepDrafts();
    restoreDrafts();
    return stop;
  }, []);

  useEffect(() => {
    // A save that already hit the old version: say so instead of failing quietly.
    const onRejection = (e: PromiseRejectionEvent) => isNewVersionError(e.reason) && setStale(true);
    const onError = (e: ErrorEvent) => isNewVersionError(e.error ?? e.message) && setStale(true);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    if (version === "dev") return;
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const live = ((await res.json()) as { version?: string }).version;
        if (alive && live && live !== version) setStale(true);
      } catch {}
    };
    const onVisible = () => document.visibilityState === "visible" && check();
    const timer = setInterval(check, 3 * 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [version]);

  if (!stale) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border bg-card p-3 text-sm shadow-card md:bottom-6">
      <RefreshCw className="size-4 shrink-0 text-primary" />
      <p className="flex-1">A new version of Oppllo One is ready. Reload to keep working; what you typed stays.</p>
      <Button size="sm" onClick={reloadKeepingDrafts}>
        Reload
      </Button>
    </div>
  );
}
