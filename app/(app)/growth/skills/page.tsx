// The skills matrix (plan/5): every skill, and the level each position needs. HR sets the levels; team heads add
// their department's own skills.
import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { ROLES, ROLE_LABELS, SKILL_GROUP_LABELS, SKILL_LEVEL_LABELS, type Role } from "@/lib/types";
import { RemoveSkill, RequirementCell, SkillForm } from "../forms";

export const metadata: Metadata = { title: "Skills matrix" };

/** Positions that grow by skill; the owner is left out. */
const POSITIONS: Role[] = ROLES.filter((r) => r !== "owner");

export default function SkillsPage() {
  return (
    <div className="space-y-5">
      <BackLink fallback="/growth" />
      <PageHeader title="Skills matrix" description={`Levels: ${[1, 2, 3, 4, 5].map((l) => `${l} ${SKILL_LEVEL_LABELS[l]}`).join(" · ")}.`} />
      <Suspense fallback={<LoadingRows rows={6} columns={4} label="Loading the matrix" />}>
        <Matrix />
      </Suspense>
    </div>
  );
}

async function Matrix() {
  const actor = await requireActor();
  const r = await getServices().growth.matrix(actor);
  if (!r.ok) return <ErrorState error={r.error} />;
  const v = r.value;
  const need = new Map(v.requirements.map((q) => [`${q.role}:${q.skillId}`, q.requiredLevel]));
  const headOf = new Set(v.headOf);
  const mayAdd = v.canManage || v.headOf.length > 0;
  const departments = v.departments.filter((d) => v.canManage || headOf.has(d.id));
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-4">
          {v.skills.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Skill</th>
                    {POSITIONS.map((role) => (
                      <th key={role} className="px-1 py-2 font-medium">
                        {ROLE_LABELS[role]}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {v.skills.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 pr-3">
                        <span className="font-medium">{s.name}</span>
                        <p className="text-xs text-muted-foreground">
                          {SKILL_GROUP_LABELS[s.group]}
                          {s.departmentName ? ` · ${s.departmentName}` : ""}
                          {s.description ? ` · ${s.description}` : ""}
                        </p>
                      </td>
                      {POSITIONS.map((role) => (
                        <td key={role} className="px-1 py-2">
                          <RequirementCell role={role} skillId={s.id} level={need.get(`${role}:${s.id}`) ?? null} disabled={!v.canManage} />
                        </td>
                      ))}
                      <td className="pl-2">{v.canManage || (s.departmentId && headOf.has(s.departmentId)) ? <RemoveSkill skillId={s.id} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No skills yet" description={mayAdd ? "Add the first skill below." : "HR adds the skills each role needs."} />
          )}
        </CardContent>
      </Card>
      {mayAdd ? (
        <Card>
          <CardHeader>
            <CardTitle>Add a skill</CardTitle>
          </CardHeader>
          <CardContent>
            <SkillForm departments={departments} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
