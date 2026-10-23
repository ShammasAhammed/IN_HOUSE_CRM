// Results back to the ad platforms (Stage 10a.5, D90), as the CRM did: when a lead reaches a stage the owner chose,
// Meta's Conversions API is told at once, and Google Ads picks it up from a daily CSV it fetches. Each lead and stage
// is reported once, including stages the CRM already reported (their record is copied with the lead).
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { forbidden, ok, type Result } from "@/lib/result";
import { settingId } from "@/lib/id";
import { LEAD_STAGES, type LeadStage } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import { rupees } from "@/lib/validation/engagements";
import type { AdConversionSettings, DataStore, MetaConversions } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";

const KEY = "ad_conversions";
const EMPTY: AdConversionSettings = { stages: {}, metaDatasetId: null, metaTestEventCode: null };
/** Google accepts clicks up to 90 days old. */
const GOOGLE_DAYS = 89;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
/** India-first: digits only, 10-digit numbers get 91. */
export function normalPhone(phone: string | null): string {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (d.length === 10) d = `91${d}`;
  if (d.length === 11 && d.startsWith("0")) d = `91${d.slice(1)}`;
  return d;
}

/** "yyyy-mm-dd hh:mm:ss" in India time, as Google's import wants with the TimeZone header. */
const googleTime = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().replace("T", " ").slice(0, 19);
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const optionalName = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => v || null);
const settingsSchema = z.object({
  metaDatasetId: optionalName,
  metaTestEventCode: optionalName,
  ...Object.fromEntries(
    LEAD_STAGES.filter((s) => s !== "new" && s !== "lost").flatMap((s) => [
      [`${s}_meta`, optionalName],
      [`${s}_google`, optionalName],
      [`${s}_value`, z.union([z.literal(""), rupees]).optional()],
    ]),
  ),
});

export function createConversionService(deps: { store: DataStore; clock: Clock; meta: MetaConversions; googleUploadKey?: string }) {
  const { store, clock, meta } = deps;
  const settings = async () => (await store.calendar.getSetting<AdConversionSettings>(KEY)) ?? EMPTY;

  return {
    /** Called after a lead's stage changes. Returns what was done, or null when nothing is set for that stage. */
    async onStage(leadId: string, stage: LeadStage): Promise<{ meta?: string; google?: string } | null> {
      const conf = await settings();
      const target = conf.stages[stage];
      if (!target || (!target.meta && !target.google)) return null;
      const lead = await store.leads.find(leadId);
      if (!lead) return null;
      const details = (lead.details ?? {}) as Record<string, unknown>;
      if ((details.conversions as Record<string, unknown> | undefined)?.[stage]) return null;
      const at = clock.now();
      const result: { meta?: string; google?: string } = {};

      if (target.meta) {
        if (!conf.metaDatasetId || !meta.connected) result.meta = "not set up";
        else {
          const user: Record<string, unknown> = { country: [sha256("in")] };
          if (details.metaLeadId) user.lead_id = String(details.metaLeadId);
          const phone = normalPhone(lead.phone);
          if (phone.length >= 10) user.ph = [sha256(phone)];
          if (lead.email) user.em = [sha256(lead.email.trim().toLowerCase())];
          if (details.fbc) user.fbc = String(details.fbc);
          if (details.fbp) user.fbp = String(details.fbp);
          const sent = await meta.send(
            conf.metaDatasetId,
            {
              event_name: target.meta,
              event_time: Math.floor(at.getTime() / 1000),
              // The CRM used its document id here; keep it for copied leads so Meta can't count one twice.
              event_id: `${lead.crmId ?? lead.id}_${stage}`,
              action_source: "system_generated",
              user_data: user,
              custom_data: { event_source: "crm", lead_event_source: "Oppllo One", ...(target.valuePaise ? { value: target.valuePaise / 100, currency: "INR" } : {}) },
            },
            conf.metaTestEventCode,
          );
          result.meta = sent.message;
        }
      }

      if (target.google) {
        const gclid = typeof details.gclid === "string" ? details.gclid : null;
        if (!gclid) result.google = "no Google click ID";
        else {
          await store.leads.queueGoogleConversion({ leadId, stage, gclid, name: target.google, at, valuePaise: target.valuePaise });
          result.google = "queued";
        }
      }

      const summary = [result.meta && `Meta: ${result.meta}`, result.google && `Google: ${result.google}`].filter(Boolean).join(" · ");
      await store.leads.markConversion(leadId, stage, { ...result, at: at.toISOString() }, `Ad platforms (${stage}): ${summary}`, at);
      return result;
    },

    /** GET /api/google-conversions?key=…: the CSV Google Ads fetches every day. Null for a wrong key. */
    async googleCsv(key: string | null): Promise<string | null> {
      const expected = deps.googleUploadKey;
      const a = Buffer.from(key ?? "");
      const b = Buffer.from(expected ?? "");
      if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) return null;
      const rows = await store.leads.googleConversionsSince(new Date(clock.now().getTime() - GOOGLE_DAYS * 86_400_000));
      const lines = rows.map((c) => [c.gclid, c.name, googleTime(c.at), c.valuePaise ? String(c.valuePaise / 100) : "", c.valuePaise ? "INR" : ""].map(csvCell).join(","));
      return ["Parameters:TimeZone=Asia/Kolkata", "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency", ...lines].join("\n") + "\n";
    },

    async settings(actor: Actor): Promise<Result<AdConversionSettings & { metaReady: boolean; googleReady: boolean }>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner sets what goes back to the ad platforms.");
      return ok({ ...(await settings()), metaReady: meta.connected, googleReady: Boolean(deps.googleUploadKey) });
    },

    async setSettings(actor: Actor, raw: unknown): Promise<Result<AdConversionSettings>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner sets what goes back to the ad platforms.");
      const parsed = parse(settingsSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value as Record<string, string | number | null | undefined>;
      const next: AdConversionSettings = { stages: {}, metaDatasetId: (v.metaDatasetId as string | null) ?? null, metaTestEventCode: (v.metaTestEventCode as string | null) ?? null };
      for (const s of LEAD_STAGES) {
        if (s === "new" || s === "lost") continue;
        const m = (v[`${s}_meta`] as string | null) ?? null;
        const g = (v[`${s}_google`] as string | null) ?? null;
        const value = typeof v[`${s}_value`] === "number" ? (v[`${s}_value`] as number) : null;
        if (m || g) next.stages[s] = { meta: m, google: g, valuePaise: value };
      }
      return commit(store, async (repos) => {
        const before = (await repos.calendar.getSetting<AdConversionSettings>(KEY)) ?? EMPTY;
        if (JSON.stringify(before) === JSON.stringify(next)) return noChange(next);
        await repos.calendar.setSetting(KEY, next, actor.personId);
        return change(next, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: settingId(KEY), data: { key: KEY, from: before, to: next } });
      });
    },
  };
}
