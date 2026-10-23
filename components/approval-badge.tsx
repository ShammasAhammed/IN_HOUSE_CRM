// A creative's review state as a badge (Stage 7.2). One mapping for every screen.
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { APPROVAL_STATE_LABELS, type ApprovalState } from "@/lib/types";

const TONE: Record<ApprovalState, BadgeTone> = {
  draft: "neutral",
  internal_review: "info",
  client_review: "warning",
  changes_requested: "danger",
  approved: "success",
};

export function ApprovalBadge({ state, className }: { state: ApprovalState; className?: string }) {
  return (
    <Badge tone={TONE[state]} className={className}>
      {APPROVAL_STATE_LABELS[state]}
    </Badge>
  );
}
