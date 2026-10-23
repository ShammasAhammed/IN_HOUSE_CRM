import { Mail, MapPin, Phone, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/types";
import type { DirectoryEntry } from "@/services/people";

const WHERE = { office: "Office", home: "Home", hybrid: "Hybrid" } as const;

export function PersonHeader({ person, actions }: { person: DirectoryEntry; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-card sm:flex-row sm:items-start md:p-5">
      <Avatar name={person.fullName} size="lg" className="size-14 text-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{person.fullName}</h1>
          {person.status === "left" ? <Badge tone="neutral">Left</Badge> : null}
        </div>
        <p className="text-sm text-foreground-2">
          {person.jobTitle}
          {person.departmentName ? <span className="text-muted-foreground"> · {person.departmentName}</span> : null}
        </p>
        <div className="flex flex-wrap gap-1">
          {/* A role badge that only repeats the job title above it is left out ("Designer / Designer", QA S9-24). */}
          {person.roles.filter((r) => ROLE_LABELS[r].toLowerCase() !== person.jobTitle.trim().toLowerCase()).map((r) => (
            <Badge key={r} tone="brand">
              {ROLE_LABELS[r]}
            </Badge>
          ))}
        </div>
        <div className="flex flex-col gap-x-4 gap-y-1 pt-1 text-sm whitespace-nowrap text-muted-foreground sm:flex-row sm:flex-wrap">
          <a href={`mailto:${person.workEmail}`} className="flex min-w-0 items-center gap-1.5 hover:text-foreground">
            <Mail className="size-4 shrink-0" /> <span className="truncate">{person.workEmail}</span>
          </a>
          {person.workPhone ? (
            <a href={`tel:${person.workPhone.replace(/\s/g, "")}`} className="tabular flex items-center gap-1.5 hover:text-foreground">
              <Phone className="size-4" /> {person.workPhone}
            </a>
          ) : null}
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4" /> {WHERE[person.workLocation]}
          </span>
          {person.reportsToName ? (
            <span className="flex items-center gap-1.5">
              <UserRound className="size-4" /> Reports to {person.reportsToName}
            </span>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
