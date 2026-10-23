// A live card on an Idea Board (Stage 13.2, D-13.2a): drawn inside the board's canvas (an Excalidraw embeddable),
// read fresh every time with the viewer's own rights. "No access" never says what's behind it. Framed only by
// Oppllo One itself (next.config.ts). Links open in the whole window, not inside the card.
import type { Metadata } from "next";
import { Suspense } from "react";
import { ExternalLink, Lock, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { BOARD_CARD_KINDS, SWIPE_KIND_LABELS, type BoardCardKind } from "@/lib/types";
import type { CardView } from "@/services/board-cards";

export const metadata: Metadata = { title: "Card", robots: { index: false } };

const KIND_LABELS: Record<BoardCardKind, string> = { task: "Task", creative: "Creative", results: "This month's results", sheet: "Sheet", doc: "Doc", knowledge: "Knowledge base", ref: "Reference" };
const STATUS: Record<string, string> = { todo: "To do", in_progress: "In progress", in_review: "In review", blocked: "Blocked", done: "Done" };

export default function CardPage({ params, searchParams }: PageProps<"/board-cards/[kind]/[id]">) {
  return (
    <Suspense fallback={<p className="p-3 text-xs text-muted-foreground">Loading…</p>}>
      <Card params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Card({ params, searchParams }: Pick<PageProps<"/board-cards/[kind]/[id]">, "params" | "searchParams">) {
  const [actor, { kind, id }, sp] = await Promise.all([requireActor(), params, searchParams]);
  const k = (BOARD_CARD_KINDS as readonly string[]).includes(kind) ? (kind as BoardCardKind) : null;
  const card: CardView = k ? await getServices().boardCards.card(actor, k, id) : { state: "no_access" };
  const compact = sp.badge === "1";
  const refresh = `?${new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"))}`;
  if (card.state === "no_access") {
    return (
      <main className="flex h-dvh items-center justify-center gap-2 bg-subtle p-2 text-sm text-muted-foreground">
        <Lock className="size-4" /> No access
      </main>
    );
  }
  if (compact && card.kind === "task") {
    return (
      <main className="flex h-dvh items-center gap-2 bg-card px-2 text-xs">
        <Badge tone={card.status === "done" ? "success" : card.overdue ? "danger" : "brand"}>Task · {STATUS[card.status] ?? card.status}</Badge>
        <a href={card.href} target="_top" className="min-w-0 flex-1 truncate font-medium hover:underline">
          {card.ownerName ?? "No owner"}
          {card.dueDate ? ` · ${formatShortDate(card.dueDate)}` : ""}
        </a>
      </main>
    );
  }
  const open = card.kind === "ref" ? (card.item.url ?? card.item.fileUrl) : card.href;
  return (
    <main className="flex h-dvh flex-col gap-2 overflow-hidden bg-card p-3 text-sm text-foreground">
      <header className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-primary">{card.kind === "ref" ? (card.item.site ?? SWIPE_KIND_LABELS[card.item.kind]) : KIND_LABELS[card.kind]}</span>
        <a href={refresh} className="ml-auto rounded p-0.5 hover:bg-hover" aria-label="Refresh this card" title="Refresh">
          <RefreshCw className="size-3.5" />
        </a>
        {open ? (
          <a href={open} target="_top" rel={card.kind === "ref" ? "noopener noreferrer" : undefined} className="inline-flex items-center gap-1 rounded px-1 hover:bg-hover hover:text-foreground">
            <ExternalLink className="size-3.5" /> {card.kind === "ref" && card.item.kind === "instagram" ? "Open on Instagram" : card.kind === "ref" && card.item.kind === "facebook" ? "Open on Facebook" : "Open"}
          </a>
        ) : null}
      </header>
      <Body card={card} />
    </main>
  );
}

function Body({ card }: { card: Extract<CardView, { state: "ok" }> }) {
  switch (card.kind) {
    case "task":
      return (
        <div className="space-y-1.5">
          <p className="line-clamp-2 font-semibold">{card.title}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge tone={card.status === "done" ? "success" : card.overdue ? "danger" : "brand"}>{STATUS[card.status] ?? card.status}</Badge>
            {card.ownerName ?? "No owner"}
            {card.dueDate ? ` · due ${formatShortDate(card.dueDate)}` : ""} · {card.clientName}
          </p>
        </div>
      );
    case "creative":
      return (
        <div className="space-y-1.5">
          <p className="line-clamp-2 font-semibold">{card.title}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge tone={card.approvalState === "approved" ? "success" : card.approvalState === "changes_requested" ? "warning" : "info"}>{card.approvalState.replace(/_/g, " ")}</Badge>
            version {card.version} · {card.clientName}
          </p>
        </div>
      );
    case "results":
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {card.clientName} · {formatShortDate(card.month).replace(/^\d+ /, "")}
          </p>
          <dl className="grid grid-cols-2 gap-1.5">
            {card.numbers.map((n) => (
              <div key={n.label} className="rounded-md bg-subtle px-2 py-1">
                <dt className="text-xs text-muted-foreground">{n.label}</dt>
                <dd className="tabular font-semibold">{n.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case "sheet":
      return (
        <div className="min-h-0 space-y-1.5">
          <p className="truncate font-semibold">{card.title}</p>
          <p className="text-xs text-muted-foreground">
            {card.kindLabel}
            {card.changed ? ` · changed ${card.changed}` : ""}
          </p>
          {card.summary.length ? (
            <dl className="grid grid-cols-2 gap-1.5">
              {card.summary.slice(0, 4).map((x) => (
                <div key={x.label} className="rounded-md bg-subtle px-2 py-1">
                  <dt className="truncate text-xs text-muted-foreground">{x.label}</dt>
                  <dd className={x.value ? "tabular font-semibold" : "text-xs text-warning"}>{x.value ?? x.problem}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">No summary set up for this sheet.</p>
          )}
        </div>
      );
    case "doc":
      return (
        <div className="space-y-1">
          <p className="truncate font-semibold">{card.title}</p>
          <p className="line-clamp-5 text-xs text-muted-foreground">{card.excerpt || "Empty page."}</p>
        </div>
      );
    case "knowledge":
      return (
        <div className="space-y-1.5 text-xs">
          <p className="font-semibold">{card.clientName}</p>
          {card.tone ? <p className="line-clamp-2 text-muted-foreground">{card.tone}</p> : null}
          {card.dos.length ? <p className="text-success">Do: {card.dos.join(" · ")}</p> : null}
          {card.donts.length ? <p className="text-danger">Don&apos;t: {card.donts.join(" · ")}</p> : null}
          {!card.tone && !card.dos.length && !card.donts.length ? <p className="text-muted-foreground">Nothing written yet.</p> : null}
        </div>
      );
    case "ref": {
      const i = card.item;
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          {i.embedUrl ? (
            <iframe src={i.embedUrl} title={i.title} className="min-h-0 w-full flex-1 rounded-md border-0" allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" />
          ) : i.embedHtml ? (
            // Meta's official embed runs its own script, closed off from Oppllo One (no same origin).
            <iframe srcDoc={i.embedHtml} title={i.title} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" className="min-h-0 w-full flex-1 rounded-md border-0 bg-white" />
          ) : i.kind === "image" && i.fileUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={i.fileUrl} alt={i.title} className="min-h-0 w-full flex-1 rounded-md object-contain" />
          ) : i.kind === "video" && i.fileUrl ? (
            <video src={i.fileUrl} controls className="min-h-0 w-full flex-1 rounded-md" />
          ) : i.imageUrl ? (
            // The page's own preview picture, from its site (no referrer sent).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={i.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="max-h-36 w-full rounded-md object-cover" />
          ) : null}
          <p className="line-clamp-2 font-semibold">{i.title}</p>
          {i.description && !i.embedUrl ? <p className="line-clamp-2 text-xs text-muted-foreground">{i.description}</p> : null}
          {i.notes ? <p className="line-clamp-2 text-xs">“{i.notes}”</p> : null}
          {i.tags.length ? <p className="truncate text-xs text-primary">{i.tags.map((t) => `#${t}`).join(" ")}</p> : null}
        </div>
      );
    }
  }
}
