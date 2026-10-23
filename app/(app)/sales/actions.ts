"use server";

import { refresh } from "next/cache";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { countOf } from "@/lib/format";

export type CopyResult = { ok: true; message: string } | { ok: false; message: string };

/** The owner's button: copy every lead from the CRM now (Stage 10a). */
export async function copyFromCrmAction(): Promise<CopyResult> {
  const actor = await requireActor();
  const r = await getServices().crm.copyNow(actor);
  if (!r.ok) return { ok: false, message: r.error.message };
  refresh();
  const v = r.value;
  const match = v.inCrm === v.here ? v.here === 1 ? "The 1 lead is here." : `All ${v.here} leads are here.` : `The CRM has ${countOf(v.inCrm, "lead")}; Oppllo One has ${v.here}.`;
  const owners = v.unmatchedOwners.length ? ` No Oppllo person matched these CRM users by email: ${v.unmatchedOwners.join(", ")}.` : "";
  return { ok: true, message: `${match} ${v.inserted} new, ${v.updated} updated, ${v.activities} new timeline entries.${owners}` };
}
