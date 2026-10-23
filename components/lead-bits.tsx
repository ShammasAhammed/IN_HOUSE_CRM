// Small pieces shared by the Sales screens (Stage 10a).
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { LEAD_STAGE_LABELS, type LeadScore, type LeadStage } from "@/lib/types";
import type { LeadAiScore, LeadRow } from "@/repositories";

const STAGE_TONE: Record<LeadStage, BadgeTone> = { new: "info", contacted: "brand", audit_booked: "warning", proposal: "brand", won: "success", lost: "neutral" };
const SCORE_TONE: Record<LeadScore, BadgeTone> = { hot: "danger", warm: "warning", cold: "info" };

export const StageBadge = ({ stage }: { stage: LeadStage }) => <Badge tone={STAGE_TONE[stage]}>{LEAD_STAGE_LABELS[stage]}</Badge>;
export const ScoreBadge = ({ score }: { score: LeadScore | null }) => (score ? <Badge tone={SCORE_TONE[score]}>{score[0]!.toUpperCase() + score.slice(1)}</Badge> : null);

export type AiHint = Pick<LeadAiScore, "label" | "score" | "junk">;

/** The decision helper's read of a lead (Stage 12.3): a hint for the sales team, shown quietly, never a decision. */
export const AiHintBadge = ({ hint }: { hint?: AiHint | null }) =>
  hint ? (
    <span title="A hint from the AI, not a decision: it never changes the lead." className="text-xs whitespace-nowrap text-muted-foreground">
      AI: {hint.label[0]!.toUpperCase() + hint.label.slice(1)} · {hint.score}/10{hint.junk ? " · looks like junk" : ""}
    </span>
  ) : null;

export function Tags({ tags }: { tags: readonly string[] }) {
  if (!tags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded bg-subtle px-1.5 py-0.5 text-[11px] text-foreground-2">
          {t}
        </span>
      ))}
    </span>
  );
}

/** One lead as a row that becomes a card on phones. */
export function LeadItem({ lead, showStage = true, now, select, hint }: { lead: LeadRow; showStage?: boolean; now: Date; select?: React.ReactNode; hint?: AiHint | null }) {
  const late = lead.nextFollowUpAt && lead.nextFollowUpAt < now;
  return (
    <li className="flex items-center">
      {select ? <span className="pl-3">{select}</span> : null}
      <Link href={`/sales/leads/${lead.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-hover">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{lead.institution ?? lead.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{[lead.institution ? lead.name : null, lead.district, lead.channel].filter(Boolean).join(" · ") || "—"}</span>
          {lead.tags?.length ? (
            <span className="mt-1 block">
              <Tags tags={lead.tags} />
            </span>
          ) : null}
        </span>
        <AiHintBadge hint={hint} />
        <ScoreBadge score={lead.score} />
        {showStage ? <StageBadge stage={lead.stage} /> : null}
        <span className="w-full text-xs text-muted-foreground sm:w-44 sm:text-right">
          {lead.ownerName ?? "Nobody yet"}
          {lead.nextFollowUpAt ? <span className={late ? " font-medium text-danger" : ""}> · {formatDateTime(lead.nextFollowUpAt)}</span> : null}
        </span>
      </Link>
    </li>
  );
}
