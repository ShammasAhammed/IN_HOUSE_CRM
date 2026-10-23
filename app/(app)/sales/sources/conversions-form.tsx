"use client";

import { useActionState } from "react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { LEAD_STAGE_LABELS, type LeadStage } from "@/lib/types";
import type { AdConversionSettings } from "@/repositories";
import { saveConversionsAction } from "../actions-settings";

const STAGES: LeadStage[] = ["contacted", "audit_booked", "proposal", "won"];

/** Which stages to report to Meta and Google, as in the CRM's "Send results to ads". */
export function ConversionsForm({ saved }: { saved: AdConversionSettings }) {
  const [state, action] = useActionState(saveConversionsAction, idle);
  const v = (name: string, initial: string | null | undefined) => fieldDefault(state, name, initial ?? "");
  return (
    <form action={action} key={state.status === "error" ? JSON.stringify(state.values ?? {}) : JSON.stringify(saved)} className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
      <p className="text-xs text-muted-foreground">Leave a box empty to not report that stage. Each lead is reported once per stage, including what the CRM already sent.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-1.5 font-normal">Stage</th>
              <th className="pb-1.5 font-normal">Meta event name</th>
              <th className="pb-1.5 font-normal">Google conversion action</th>
              <th className="pb-1.5 font-normal">Value ₹</th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((s) => {
              const st = saved.stages[s];
              return (
                <tr key={s} className="border-t">
                  <td className="py-1.5 pr-2">{LEAD_STAGE_LABELS[s]}</td>
                  <td className="py-1.5 pr-2">
                    <Input name={`${s}_meta`} aria-label={`${LEAD_STAGE_LABELS[s]}: Meta event`} defaultValue={v(`${s}_meta`, st?.meta)} className="h-8" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input name={`${s}_google`} aria-label={`${LEAD_STAGE_LABELS[s]}: Google conversion`} defaultValue={v(`${s}_google`, st?.google)} className="h-8" />
                  </td>
                  <td className="w-28 py-1.5">
                    <Input name={`${s}_value`} aria-label={`${LEAD_STAGE_LABELS[s]}: value in rupees`} inputMode="numeric" defaultValue={v(`${s}_value`, st?.valuePaise ? String(st.valuePaise / 100) : "")} className="h-8" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">Meta dataset (pixel) id</span>
          <Input name="metaDatasetId" defaultValue={v("metaDatasetId", saved.metaDatasetId)} className="h-8" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">Meta test event code (only while testing)</span>
          <Input name="metaTestEventCode" defaultValue={v("metaTestEventCode", saved.metaTestEventCode)} className="h-8" />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save
        </SubmitButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
