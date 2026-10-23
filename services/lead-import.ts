// Bringing many leads in at once (Stage 10b, D93): a spreadsheet saved as CSV, its columns matched to lead fields in
// the browser, checked here first (new, already in Oppllo, repeated in the file, or unusable), then imported in one go.
// Duplicates are never imported: a lead is the same when the phone (last 10 digits) or the email matches.
import { z } from "zod";
import { newId } from "@/lib/id";
import { conflict, forbidden, invalid, ok, type Result } from "@/lib/result";
import { LEAD_SCORES, LEAD_STAGES, type LeadScore, type LeadStage } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import type { DataStore, NewLeadRow } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";

import { IMPORT_FIELDS, MAX_IMPORT, type ImportField } from "./rules/lead-intake";
export { IMPORT_FIELDS, MAX_IMPORT, type ImportField };

/** The same lead: phone compared on its last 10 digits, email in any case. */
export const phoneKey = (p: string | null | undefined): string | null => {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
};
export const emailKey = (e: string | null | undefined): string | null => {
  const t = String(e ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? t : null;
};

const importSchema = z.object({
  fileName: z.string().trim().max(200).default("a file"),
  rows: z
    .array(z.record(z.string(), z.string().max(5000)))
    .min(1, { message: "The file has no rows." })
    .max(MAX_IMPORT, { message: `At most ${MAX_IMPORT} leads at a time: split the file.` }),
  ownerId: z.union([z.literal(""), z.uuid()]).optional(),
  stage: z.enum(LEAD_STAGES).default("new"),
  tag: z.string().trim().max(30).optional(),
  channel: z.string().trim().max(100).optional(),
});

export type ImportCheck = {
  total: number;
  fresh: number;
  /** Rows matching a lead already in Oppllo One, or an earlier row of the file. */
  duplicates: Array<{ row: number; name: string; matches: string }>;
  unusable: Array<{ row: number; reason: string }>;
};

type Clean = { row: number; name: string; fields: Partial<Record<ImportField, string>> };

export function createLeadImportService(deps: { store: DataStore; clock: Clock; isLive: () => Promise<boolean> }) {
  const { store, clock } = deps;

  /** Sorts the rows into new, duplicates and unusable. Nothing is saved. */
  async function check(rows: ReadonlyArray<Record<string, string>>): Promise<{ result: ImportCheck; fresh: Clean[] }> {
    const unusable: ImportCheck["unusable"] = [];
    const candidates: Clean[] = [];
    rows.forEach((raw, i) => {
      const row = i + 2; // the spreadsheet's row number: 1 is the header
      const f: Partial<Record<ImportField, string>> = {};
      for (const k of IMPORT_FIELDS) {
        const v = raw[k]?.trim();
        if (v) f[k] = v;
      }
      if (!f.name && !f.phone && !f.email) return unusable.push({ row, reason: "No name, phone or email" });
      if (f.email && !emailKey(f.email)) return unusable.push({ row, reason: `"${f.email}" isn't an email address` });
      if (f.phone && !phoneKey(f.phone)) return unusable.push({ row, reason: `"${f.phone}" isn't a full phone number` });
      candidates.push({ row, name: f.institution ?? f.name ?? f.phone ?? f.email ?? "Lead", fields: f });
    });
    const existing = await store.leads.findByContacts(
      [...new Set(candidates.map((c) => phoneKey(c.fields.phone)).filter((x): x is string => Boolean(x)))],
      [...new Set(candidates.map((c) => emailKey(c.fields.email)).filter((x): x is string => Boolean(x)))],
    );
    const known = new Map<string, string>();
    for (const e of existing) {
      const label = e.institution ?? e.name;
      if (phoneKey(e.phone)) known.set(`p:${phoneKey(e.phone)}`, `${label} (already in Oppllo)`);
      if (emailKey(e.email)) known.set(`e:${emailKey(e.email)}`, `${label} (already in Oppllo)`);
    }
    const duplicates: ImportCheck["duplicates"] = [];
    const fresh: Clean[] = [];
    for (const c of candidates) {
      const keys = [phoneKey(c.fields.phone) && `p:${phoneKey(c.fields.phone)}`, emailKey(c.fields.email) && `e:${emailKey(c.fields.email)}`].filter((k): k is string => Boolean(k));
      const hit = keys.map((k) => known.get(k)).find(Boolean);
      if (hit) {
        duplicates.push({ row: c.row, name: c.name, matches: hit });
        continue;
      }
      for (const k of keys) known.set(k, `row ${c.row} of the file`);
      fresh.push(c);
    }
    return { result: { total: rows.length, fresh: fresh.length, duplicates, unusable }, fresh };
  }

  async function allowed(actor: Actor): Promise<Result<null>> {
    if (!can(actor, "leads.write")) return forbidden("Only the BDO and the owner import leads.");
    if (!(await deps.isLive())) return conflict("Sales is still worked in the CRM until switch day. Import there for now.");
    return ok(null);
  }

  return {
    async preview(actor: Actor, raw: unknown): Promise<Result<ImportCheck>> {
      const gate = await allowed(actor);
      if (!gate.ok) return gate;
      const parsed = parse(importSchema, raw);
      if (!parsed.ok) return parsed;
      return ok((await check(parsed.value.rows)).result);
    },

    /** Imports the new rows (duplicates and unusable rows are skipped), all together. */
    async run(actor: Actor, raw: unknown): Promise<Result<ImportCheck & { imported: number }>> {
      const gate = await allowed(actor);
      if (!gate.ok) return gate;
      const parsed = parse(importSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const owner = v.ownerId ? await store.people.findById(v.ownerId) : null;
      if (v.ownerId && (!owner || owner.status !== "active")) return invalid("Pick someone on the team as the owner.");
      const { result, fresh } = await check(v.rows);
      if (!fresh.length) return ok({ ...result, imported: 0 });
      const at = clock.now();
      return commit(store, async (repos) => {
        const events = [];
        for (const c of fresh) {
          const f = c.fields;
          const tags = [...new Set([...(f.tags ? f.tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean) : []), ...(v.tag ? [v.tag] : [])])].slice(0, 10).map((t) => t.slice(0, 30));
          const id = newId();
          const row: NewLeadRow = {
            id, externalId: null, sourceKey: null,
            name: f.name ?? f.phone ?? f.email ?? "Lead",
            phone: f.phone ?? null, email: f.email ?? null, institution: f.institution ?? null, contactRole: f.contactRole ?? null, district: f.district ?? null, segment: f.segment ?? null,
            problem: f.problem ?? null, timeline: null, seats: null, admissions: null, feePaise: null, spendPaise: null, commissionPaise: null, costPerAdmissionPaise: null,
            stage: v.stage as LeadStage, score: (LEAD_SCORES as readonly string[]).includes((f.score ?? "").toLowerCase()) ? ((f.score ?? "").toLowerCase() as LeadScore) : null, lostReason: v.stage === "lost" ? "Other" : null,
            origin: "import", channel: f.channel ?? (v.channel || null), landing: null, campaign: f.campaign ?? null, utmSource: null, utmMedium: null, utmContent: null, utmTerm: null,
            ownerId: owner?.id ?? null, ownerName: null, nextFollowUpAt: null, stageChangedAt: at, wonAt: v.stage === "won" ? at : null, lastNoteAt: f.note ? at : null,
            answers: null, details: { importedFrom: v.fileName, row: c.row }, createdAt: at, updatedAt: at,
          };
          await repos.leads.create(row, at);
          if (tags.length) await repos.leads.update(id, { tags }, at);
          if (f.note) await repos.leads.addActivity({ leadId: id, type: "note", text: f.note.slice(0, 5000), byId: actor.personId, at });
          events.push({ actorId: actor.personId, action: "lead.imported", entityType: "lead" as const, entityId: id, data: { file: v.fileName, row: c.row } });
        }
        return change({ ...result, imported: fresh.length }, events[0]!, ...events.slice(1));
      });
    },
  };
}
