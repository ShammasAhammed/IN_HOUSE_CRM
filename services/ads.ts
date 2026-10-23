// Meta ad results on the client page (Stage 10.1, D92): spend, leads and cost per lead next to the work. For people
// with ads.read (owner, strategists, performance marketers) on clients they can see. Meta is asked at most every few
// hours per client and range; "Refresh" asks again.
import { z } from "zod";
import { isId, newId } from "@/lib/id";
import { forbidden, notFound, ok, type Result } from "@/lib/result";
import { id, parse } from "@/lib/validation/common";
import { AD_RANGES, type AdInsights, type AdRange, type DataStore, type MetaAdInsights } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";

const FRESH_MS = 3 * 60 * 60 * 1000;
const DENIED = "Ad results are for strategists, performance marketers and the owner.";

export type ClientAds =
  | { state: "not_connected" }
  | { state: "not_linked"; canLink: boolean }
  | { state: "ok"; accountId: string; range: AdRange; insights: AdInsights; fetchedAt: Date; canLink: boolean }
  | { state: "error"; accountId: string; range: AdRange; message: string; canLink: boolean };

const linkSchema = z.object({
  clientId: id,
  accountId: z
    .string()
    .trim()
    .transform((v) => v.replace(/^act_/i, ""))
    .refine((v) => /^\d{6,20}$/.test(v), { message: "Paste the ad account id: the digits after act_ in Ads Manager." }),
});

export function createAdService(deps: { store: DataStore; clock: Clock; meta: MetaAdInsights; report?: (err: unknown, context?: Record<string, unknown>) => void }) {
  const { store, clock, meta } = deps;

  async function visibleClient(actor: Actor, clientId: string) {
    if (!isId(clientId)) return null;
    return store.clients.findById(clientId, clientScope(actor));
  }

  return {
    async forClient(actor: Actor, clientId: string, rangeRaw?: string, opts: { refresh?: boolean } = {}): Promise<Result<ClientAds>> {
      if (!can(actor, "ads.read")) return forbidden(DENIED);
      if (!(await visibleClient(actor, clientId))) return notFound("That client");
      if (!meta.connected) return ok({ state: "not_connected" });
      const account = await store.ads.accountFor(clientId);
      if (!account) return ok({ state: "not_linked", canLink: true });
      const range: AdRange = (AD_RANGES as readonly string[]).includes(rangeRaw ?? "") ? (rangeRaw as AdRange) : "this_month";
      const key = `meta:${account.accountId}:${range}`;
      const cached = await store.ads.cached(clientId, key);
      const now = clock.now();
      if (cached && !opts.refresh && now.getTime() - cached.fetchedAt.getTime() < FRESH_MS) {
        return ok({ state: "ok", accountId: account.accountId, range, insights: cached.data, fetchedAt: cached.fetchedAt, canLink: true });
      }
      try {
        const insights = await meta.insights(account.accountId, range);
        await store.ads.store(clientId, key, insights, now);
        return ok({ state: "ok", accountId: account.accountId, range, insights, fetchedAt: now, canLink: true });
      } catch (err) {
        deps.report?.(err, { where: "meta-insights", clientId });
        // Better slightly old numbers than none: show the last ones Meta gave, saying when.
        if (cached) return ok({ state: "ok", accountId: account.accountId, range, insights: cached.data, fetchedAt: cached.fetchedAt, canLink: true });
        return ok({ state: "error", accountId: account.accountId, range, message: err instanceof Error ? err.message : String(err), canLink: true });
      }
    },

    async link(actor: Actor, raw: unknown): Promise<Result<{ accountId: string }>> {
      if (!can(actor, "ads.read")) return forbidden(DENIED);
      const parsed = parse(linkSchema, raw);
      if (!parsed.ok) return parsed;
      const { clientId, accountId } = parsed.value;
      if (!(await visibleClient(actor, clientId))) return notFound("That client");
      return commit(store, async (repos) => {
        const before = await repos.ads.accountFor(clientId);
        if (before?.accountId === accountId) return noChange({ accountId });
        const at = clock.now();
        if (before) await repos.ads.unlink(clientId, at);
        const rowId = newId();
        await repos.ads.link({ id: rowId, clientId, accountId, linkedById: actor.personId }, at);
        return change({ accountId }, { actorId: actor.personId, action: "client.ad_account_linked", entityType: "client_ad_account", entityId: rowId, clientId, data: { platform: "meta", accountId, replaced: before?.accountId ?? null } });
      });
    },

    async unlink(actor: Actor, clientId: string): Promise<Result<null>> {
      if (!can(actor, "ads.read")) return forbidden(DENIED);
      if (!(await visibleClient(actor, clientId))) return notFound("That client");
      return commit(store, async (repos) => {
        const removed = await repos.ads.unlink(clientId, clock.now());
        if (!removed) return noChange(null);
        return change(null, { actorId: actor.personId, action: "client.ad_account_unlinked", entityType: "client_ad_account", entityId: removed, clientId, data: { platform: "meta" } });
      });
    },
  };
}
