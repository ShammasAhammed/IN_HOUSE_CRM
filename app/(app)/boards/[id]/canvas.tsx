"use client";

// The Excalidraw canvas (Stage 13.1, D-13.1a). Loaded only on a board page, in the browser (next/dynamic, ssr off), so
// no other page carries it. Hands the board room the editor's API and the library's helpers once it is ready.
import "@excalidraw/excalidraw/index.css";
import * as Excalidraw from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { memo, useEffect, useState } from "react";
import { parseCardUrl } from "@/services/rules/references";

export type ExcalidrawModule = typeof Excalidraw;
export type { ExcalidrawImperativeAPI };

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}
// Fonts from our own site (public/excalidraw), not a CDN.
if (typeof window !== "undefined") window.EXCALIDRAW_ASSET_PATH = `${window.location.origin}/excalidraw/`;

function useSystemTheme(): "light" | "dark" {
  const [dark, setDark] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return dark ? "dark" : "light";
}

export default memo(function Canvas({
  elements,
  appState,
  readOnly,
  presenting,
  grid,
  measure,
  onReady,
  onChange,
  onLinkOpen,
  onPasteLink,
  onPasteList,
}: {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  readOnly: boolean;
  presenting: boolean;
  grid: boolean;
  /** A new board from a template: its text hasn't been measured yet. */
  measure: boolean;
  onReady: (api: ExcalidrawImperativeAPI, lib: ExcalidrawModule) => void;
  onChange: Parameters<typeof Excalidraw.Excalidraw>[0]["onChange"];
  onLinkOpen: (url: string, event: Event) => void;
  /** A pasted web address: true when the board took it (a reference card), so Excalidraw doesn't paste it as text. */
  onPasteLink: (url: string) => boolean;
  /** A pasted list (plain, Markdown or Google Docs HTML): true when the board offers to place it (13.1b). */
  onPasteList: (text: string, html: string) => boolean;
}) {
  const theme = useSystemTheme();
  const [initial] = useState(() => ({
    // Template text is saved unmeasured; refreshDimensions wraps it inside its sticky the first time.
    elements: Excalidraw.restoreElements(elements as never, null, { refreshDimensions: measure, repairBindings: true }),
    appState: { ...appState, currentItemFontFamily: Excalidraw.FONT_FAMILY.Excalifont, currentItemRoughness: 0 },
    scrollToContent: true,
  }));
  return (
    <Excalidraw.Excalidraw
      initialData={initial}
      excalidrawAPI={(api) => onReady(api, Excalidraw)}
      onChange={onChange}
      theme={theme}
      viewModeEnabled={readOnly || presenting}
      zenModeEnabled={presenting}
      gridModeEnabled={grid}
      objectsSnapModeEnabled
      name="Idea board"
      aiEnabled={false}
      onLinkOpen={(el, e) => {
        if (!el.link) return;
        onLinkOpen(el.link, e.detail.nativeEvent as unknown as Event);
        e.preventDefault();
      }}
      // Live cards (Stage 13.2, D-13.2a): only Oppllo One's own card links may be embedded, drawn from /board-cards.
      validateEmbeddable={(link: string) => parseCardUrl(link) !== null}
      renderEmbeddable={(el) => {
        const c = parseCardUrl(el.link);
        if (!c) return null;
        const badge = (el.customData as { badge?: boolean } | undefined)?.badge;
        return <iframe src={`/board-cards/${c.kind}/${c.id}${badge ? "?badge=1" : ""}`} title={`${c.kind} card`} className="size-full rounded-[inherit] border-0" loading="lazy" />;
      }}
      onPaste={(data, event) => {
        const text = data.text?.trim() ?? "";
        if (data.elements?.length) return true;
        if (/^https?:\/\/\S+$/i.test(text) && onPasteLink(text)) return false;
        return !onPasteList(data.text ?? "", event?.clipboardData?.getData("text/html") ?? "");
      }}
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: null, clearCanvas: !readOnly }, tools: { image: !readOnly } }}
    />
  );
});
