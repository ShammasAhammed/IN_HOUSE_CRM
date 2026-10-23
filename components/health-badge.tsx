// A client's results health (Stage 11.1) as a badge. One mapping for every screen.
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { HealthLevel } from "@/services/rules/results";

const LOOK: Record<HealthLevel, { tone: BadgeTone; label: string }> = {
  on_track: { tone: "success", label: "On track" },
  at_risk: { tone: "warning", label: "At risk" },
  off_track: { tone: "danger", label: "Off track" },
  no_target: { tone: "neutral", label: "No target" },
};

export function HealthBadge({ level, className }: { level: HealthLevel; className?: string }) {
  return (
    <Badge tone={LOOK[level].tone} className={className}>
      {LOOK[level].label}
    </Badge>
  );
}
