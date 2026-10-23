"use client";

// Editing a page (Stage 13.4): the block editor (loaded only when someone edits), or plain Markdown for those who
// prefer it. Both save through the same version-checked save.
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditDoc } from "../doc-forms";

const BlockEditor = dynamic(() => import("./block-editor"), {
  ssr: false,
  loading: () => (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" /> Opening the editor…
    </p>
  ),
});

export function DocEditor({ doc }: { doc: { id: string; title: string; body: string; version: number } }) {
  const router = useRouter();
  const [mode, setMode] = useState<"read" | "blocks" | "markdown">("read");
  if (mode === "blocks")
    return (
      <BlockEditor
        doc={doc}
        onDone={() => {
          setMode("read");
          router.refresh();
        }}
      />
    );
  if (mode === "markdown") return <EditDoc doc={doc} startEditing onClose={() => setMode("read")} />;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" onClick={() => setMode("blocks")}>
        <Pencil /> Edit
      </Button>
      <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setMode("markdown")}>
        Edit as Markdown
      </button>
    </div>
  );
}
