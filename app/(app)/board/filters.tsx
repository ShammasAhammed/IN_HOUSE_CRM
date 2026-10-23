"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { Select } from "@/components/ui/input";

/** Board filters live in the URL, so a filtered board can be bookmarked or shared. */
export function BoardFilters({
  clients,
  projects,
  people,
  me,
}: {
  clients: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; clientId: string }>;
  people: Array<{ id: string; name: string }>;
  me: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "client") next.delete("project");
    router.replace(`${pathname}?${next.toString()}` as Route);
  };
  const client = params.get("client") ?? "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Client" value={client} onChange={(e) => set("client", e.target.value)} className="h-8 w-auto min-w-40">
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select aria-label="Project" value={params.get("project") ?? ""} onChange={(e) => set("project", e.target.value)} className="h-8 w-auto min-w-40">
        <option value="">All projects</option>
        {projects
          .filter((p) => !client || p.clientId === client)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </Select>
      <Select aria-label="Person" value={params.get("owner") ?? ""} onChange={(e) => set("owner", e.target.value)} className="h-8 w-auto min-w-36">
        <option value="">Everyone</option>
        <option value={me}>Me</option>
        {people
          .filter((p) => p.id !== me)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </Select>
    </div>
  );
}
