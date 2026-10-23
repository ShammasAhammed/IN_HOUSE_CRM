// Small shared pieces for leave screens.
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatShortDate, formatWeekdayDate } from "@/lib/format";
import { LEAVE_STATUS_LABELS, type LeaveStatus } from "@/lib/types";
import type { IsoDate } from "@/lib/dates";
import { daysLabel } from "@/services/rules/leave";

const TONE: Record<LeaveStatus, BadgeTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
  revoked: "danger",
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return <Badge tone={TONE[status]}>{LEAVE_STATUS_LABELS[status]}</Badge>;
}

/** "Wed, 22 Oct" or "22 Oct – 24 Oct", with a half-day note. */
export function LeaveDates({ start, end, halfDay }: { start: IsoDate; end: IsoDate; halfDay: string | null }) {
  if (start === end) {
    return (
      <span>
        {formatWeekdayDate(start)}
        {halfDay ? <span className="text-muted-foreground"> · {halfDay === "first_half" ? "morning" : "afternoon"}</span> : null}
      </span>
    );
  }
  return (
    <span>
      {formatShortDate(start)} – {formatShortDate(end)}
    </span>
  );
}

export function Days({ halfDays }: { halfDays: number }) {
  return <span className="tabular">{daysLabel(halfDays)}</span>;
}
