// Meta ad results for the client page (Stage 10.1, D92). The only place that reads ad insights from the Graph API.
// Accuracy rules: Meta's own date presets in the ad account's time zone and Meta's default attribution; leads counted
// once (Meta's combined "lead" action, or its parts when that is absent, never both); reach taken for the whole
// range, never summed across days or campaigns; money in the account's currency.
import type { AdInsights, AdRange, MetaAdInsights } from "@/repositories";

type Action = { action_type: string; value: string };
type Row = Record<string, unknown> & { actions?: Action[] };

const LEAD_PARTS = ["onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

/** Leads in one insights row, counted once. */
export function leadsOf(actions: Action[] | undefined): number {
  const by = new Map((actions ?? []).map((a) => [a.action_type, Number(a.value) || 0]));
  if (by.has("lead")) return by.get("lead")!;
  return LEAD_PARTS.reduce((t, k) => t + (by.get(k) ?? 0), 0);
}
const n = (v: unknown) => Number(v ?? 0) || 0;
/** "1234.56" in the account currency → 123456 in its smallest unit. */
const minor = (v: unknown) => Math.round(n(v) * 100);

export function metaAdInsights(deps: { token: string; version?: string; fetch?: typeof fetch }): MetaAdInsights {
  const http = deps.fetch ?? fetch;
  const version = deps.version || "v23.0";

  async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    const q = new URLSearchParams({ ...params, access_token: deps.token });
    const res = await http(`https://graph.facebook.com/${version}/${path}?${q}`);
    const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) throw new Error(`Meta said ${res.status}: ${body.error?.message ?? "unknown error"}`);
    return body;
  }

  return {
    connected: true,
    async insights(accountId, range: AdRange): Promise<AdInsights> {
      const act = `act_${accountId.replace(/\D/g, "")}`;
      const common = { date_preset: range };
      const [info, total, campaigns, daily] = await Promise.all([
        get<{ name?: string; currency?: string; timezone_name?: string }>(act, { fields: "name,currency,timezone_name" }),
        get<{ data: Row[] }>(`${act}/insights`, { ...common, fields: "reach,spend,impressions,clicks,actions,date_start,date_stop" }),
        get<{ data: Row[] }>(`${act}/insights`, { ...common, level: "campaign", fields: "campaign_id,campaign_name,spend,impressions,clicks,actions", limit: "200" }),
        get<{ data: Row[] }>(`${act}/insights`, { ...common, time_increment: "1", fields: "spend,actions,date_start", limit: "100" }),
      ]);
      const t = total.data[0] ?? {};
      return {
        accountName: info.name ?? act,
        currency: info.currency ?? "INR",
        timeZone: info.timezone_name ?? "Asia/Kolkata",
        since: String(t.date_start ?? ""),
        until: String(t.date_stop ?? ""),
        reach: n(t.reach),
        totals: { spendMinor: minor(t.spend), impressions: n(t.impressions), clicks: n(t.clicks), leads: leadsOf(t.actions) },
        campaigns: campaigns.data
          .map((c) => ({ id: String(c.campaign_id), name: String(c.campaign_name ?? "Campaign"), spendMinor: minor(c.spend), impressions: n(c.impressions), clicks: n(c.clicks), leads: leadsOf(c.actions) }))
          .sort((a, b) => b.spendMinor - a.spendMinor),
        daily: daily.data.map((d) => ({ date: String(d.date_start), spendMinor: minor(d.spend), leads: leadsOf(d.actions) })),
      };
    },
  };
}

export function notConnectedMetaInsights(): MetaAdInsights {
  return {
    connected: false,
    insights: async () => {
      throw new Error("Meta ad results aren't set up (META_ADS_TOKEN).");
    },
  };
}
