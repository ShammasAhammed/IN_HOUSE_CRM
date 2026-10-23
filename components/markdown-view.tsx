// Shows a doc's Markdown (Stage 9b.5, 13.4 blocks) from the safe tree in lib/markdown.ts: plain React, no raw HTML.
// Task and client mentions show only what the viewer may open (`chips`, worked out on the server per viewer).
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { parseMarkdown, type Block, type Inline, type ListBlock } from "@/lib/markdown";
import { classifyLink, youtubeEmbed } from "@/services/rules/references";

export type Chips = Record<string, { label: string; href: string } | null>;
type Ctx = { chips?: Chips; table?: (id: string) => ReactNode };

const CALLOUT_STYLE = { note: "border-info/30 bg-info-soft", tip: "border-success/30 bg-success-soft", warning: "border-warning/30 bg-warning-soft" } as const;

function Inlines({ nodes, ctx = {} }: { nodes: Inline[]; ctx?: Ctx }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text":
            return <span key={i}>{n.v}</span>;
          case "br":
            return <br key={i} />;
          case "strong":
            return (
              <strong key={i} className="font-semibold">
                <Inlines nodes={n.c} ctx={ctx} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <Inlines nodes={n.c} ctx={ctx} />
              </em>
            );
          case "code":
            return (
              <code key={i} className="rounded bg-subtle px-1 py-0.5 font-mono text-[0.85em]">
                {n.v}
              </code>
            );
          case "mention": {
            if (n.kind === "person")
              return (
                <Link key={i} href={`/people/${n.id}` as Route} className="rounded bg-accent px-1 font-medium text-accent-foreground hover:underline">
                  @{n.label || "someone"}
                </Link>
              );
            const chip = ctx.chips?.[n.id];
            return chip ? (
              <Link key={i} href={chip.href as Route} className="rounded border bg-card px-1 text-xs font-medium hover:bg-hover">
                {n.kind === "task" ? "☑ " : "◼ "}
                {chip.label}
              </Link>
            ) : (
              <span key={i} className="rounded bg-subtle px-1 text-xs text-muted-foreground">
                No access
              </span>
            );
          }
          case "link":
            return n.href.startsWith("/") ? (
              <Link key={i} href={n.href as Route} className="text-primary underline-offset-2 hover:underline">
                <Inlines nodes={n.c} ctx={ctx} />
              </Link>
            ) : (
              <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline-offset-2 hover:underline">
                <Inlines nodes={n.c} ctx={ctx} />
              </a>
            );
        }
      })}
    </>
  );
}

function List({ b, ctx }: { b: ListBlock; ctx: Ctx }) {
  const Tag = b.ordered ? "ol" : "ul";
  const task = b.items.some((x) => x.checked !== null);
  return (
    <Tag className={b.ordered ? "list-decimal space-y-1 pl-5" : task ? "space-y-1" : "list-disc space-y-1 pl-5"}>
      {b.items.map((it, j) => (
        <li key={j}>
          <span className={it.checked !== null ? "flex items-start gap-2" : undefined}>
            {it.checked !== null ? <input type="checkbox" checked={it.checked} readOnly disabled className="mt-1 size-4 accent-primary" aria-label={it.checked ? "Done" : "Not done"} /> : null}
            <span className={it.checked ? "text-muted-foreground line-through" : undefined}>
              <Inlines nodes={it.c} ctx={ctx} />
            </span>
          </span>
          {it.sub ? (
            <div className="mt-1 pl-5">
              <List b={it.sub} ctx={ctx} />
            </div>
          ) : null}
        </li>
      ))}
    </Tag>
  );
}

function Blocks({ blocks, ctx }: { blocks: Block[]; ctx: Ctx }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h":
            return b.level === 1 ? (
              <h2 key={i} className="pt-2 text-lg font-semibold">
                <Inlines nodes={b.c} ctx={ctx} />
              </h2>
            ) : b.level === 2 ? (
              <h3 key={i} className="pt-1 text-base font-semibold">
                <Inlines nodes={b.c} ctx={ctx} />
              </h3>
            ) : (
              <h4 key={i} className="font-semibold">
                <Inlines nodes={b.c} ctx={ctx} />
              </h4>
            );
          case "p":
            return (
              <p key={i}>
                <Inlines nodes={b.c} ctx={ctx} />
              </p>
            );
          case "list":
            return <List key={i} b={b} ctx={ctx} />;
          case "quote":
            return (
              <blockquote key={i} className="border-l-2 border-primary/40 pl-3 text-muted-foreground">
                <Inlines nodes={b.c} ctx={ctx} />
              </blockquote>
            );
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded-md bg-subtle p-3 font-mono text-xs">
                {b.v}
              </pre>
            );
          case "hr":
            return <hr key={i} className="border-border" />;
          case "callout":
            return (
              <div key={i} role="note" className={`space-y-2 rounded-md border px-3 py-2 ${CALLOUT_STYLE[b.kind]}`}>
                <Blocks blocks={b.c} ctx={ctx} />
              </div>
            );
          case "toggle":
            return (
              <details key={i} className="rounded-md border px-3 py-2">
                <summary className="cursor-pointer font-medium">
                  <Inlines nodes={b.title} ctx={ctx} />
                </summary>
                <div className="mt-2 space-y-3">
                  <Blocks blocks={b.c} ctx={ctx} />
                </div>
              </details>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-md border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-subtle">
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j} className="px-3 py-2 font-semibold">
                          <Inlines nodes={h} ctx={ctx} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-t">
                        {b.head.map((_, k) => (
                          <td key={k} className="px-3 py-2 align-top">
                            <Inlines nodes={r[k] ?? []} ctx={ctx} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "image":
            // Our own doc files, or https: shown as a picture, nothing else.
            // eslint-disable-next-line @next/next/no-img-element
            return <img key={i} src={b.src} alt={b.alt} loading="lazy" referrerPolicy="no-referrer" className="max-h-[480px] max-w-full rounded-md border" />;
          case "embed": {
            const u = new URL(b.url);
            const yt = classifyLink(u);
            return yt.kind === "youtube" ? (
              <iframe key={i} src={youtubeEmbed(yt.videoId)} title="YouTube video" loading="lazy" className="aspect-video w-full max-w-2xl rounded-md border-0" allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" />
            ) : (
              <a key={i} href={b.url} target="_blank" rel="noopener noreferrer nofollow" className="block rounded-md border px-3 py-2 text-primary hover:bg-hover">
                {u.hostname.replace(/^www\./, "")} ↗
              </a>
            );
          }
          case "card":
            // A live card (13.2): the viewer's own rights, "No access" otherwise.
            return <iframe key={i} src={`/board-cards/${b.kind}/${b.id}`} title={`${b.kind} card`} loading="lazy" className="h-44 w-full max-w-md rounded-md border" />;
          case "dbtable":
            return <div key={i}>{ctx.table ? ctx.table(b.id) : <p className="text-xs text-muted-foreground">A table</p>}</div>;
        }
      })}
    </>
  );
}

export function MarkdownView({ source, chips, table }: { source: string; chips?: Chips; table?: (id: string) => ReactNode }) {
  const blocks = parseMarkdown(source);
  if (!blocks.length) return <p className="text-sm text-muted-foreground">This page is empty.</p>;
  return (
    <div className="space-y-3 text-sm leading-relaxed break-words">
      <Blocks blocks={blocks} ctx={{ ...(chips ? { chips } : {}), ...(table ? { table } : {}) }} />
    </div>
  );
}
