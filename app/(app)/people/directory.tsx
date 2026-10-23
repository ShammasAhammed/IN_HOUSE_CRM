"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Mail, Phone, Search } from "lucide-react";
import { EmptyState } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/types";
import type { DirectoryEntry } from "@/services/people";

/** The team directory with instant search by name, role, title or department. */
export function Directory({ people }: { people: DirectoryEntry[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.fullName, p.jobTitle, p.departmentName ?? "", ...p.roles.map((r) => ROLE_LABELS[r])].some((v) => v.toLowerCase().includes(q)),
    );
  }, [people, query]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, role or team" aria-label="Search people" className="pl-8" />
      </div>
      {shown.length === 0 ? (
        <EmptyState title="Nobody matches" description="Try a first name, a role like “designer”, or a team." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id} className="rounded-lg border bg-card p-3 shadow-card">
              <Link href={`/people/${p.id}`} className="flex items-start gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                <Avatar name={p.fullName} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium hover:underline">{p.fullName}</p>
                    {p.status === "left" ? <Badge tone="neutral">Left</Badge> : null}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{p.jobTitle}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.departmentName ?? "No team"}</p>
                </div>
              </Link>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2.5 text-xs text-muted-foreground">
                <a href={`mailto:${p.workEmail}`} className="flex min-w-0 items-center gap-1 hover:text-foreground">
                  <Mail className="size-3.5 shrink-0" /> <span className="truncate">{p.workEmail}</span>
                </a>
                {p.workPhone ? (
                  <a href={`tel:${p.workPhone.replace(/\s/g, "")}`} className="tabular flex items-center gap-1 hover:text-foreground">
                    <Phone className="size-3.5" /> {p.workPhone}
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
