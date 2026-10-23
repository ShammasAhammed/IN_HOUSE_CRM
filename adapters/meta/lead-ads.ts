// Meta (Facebook/Instagram) lead ads: reading a lead's answers from the Graph API (Stage 10a.4, D89). The only place
// that calls graph.facebook.com for leads (CLAUDE.md). Leads must be read with the Page's own token, derived from the
// system user token and cached while the function instance lives.
import type { MetaLeadAds, MetaLeadData } from "@/repositories";

const GRAPH = "https://graph.facebook.com";
const FIELDS = "created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic";

export function metaLeadAds(deps: { accessToken: string; version?: string; defaultPageId?: string; fetch?: typeof fetch }): MetaLeadAds {
  const http = deps.fetch ?? fetch;
  const version = deps.version || "v23.0";
  const pageTokens = new Map<string, string>();

  async function get<T>(path: string, token: string): Promise<T> {
    const res = await http(`${GRAPH}/${version}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`);
    const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) throw new Error(`Meta said ${res.status}: ${body.error?.message ?? "unknown error"}`);
    return body;
  }

  async function pageToken(pageId: string): Promise<string> {
    const known = pageTokens.get(pageId);
    if (known) return known;
    const { access_token } = await get<{ access_token?: string }>(`${encodeURIComponent(pageId)}?fields=access_token`, deps.accessToken);
    if (!access_token) throw new Error("Meta gave no Page token: check the system user has the Page.");
    pageTokens.set(pageId, access_token);
    return access_token;
  }

  return {
    connected: true,
    async fetchLead(leadgenId, pageId) {
      const page = pageId ?? deps.defaultPageId ?? null;
      const token = page ? await pageToken(page) : deps.accessToken;
      const d = await get<Record<string, unknown>>(`${encodeURIComponent(leadgenId)}?fields=${FIELDS}`, token);
      const s = (v: unknown) => (typeof v === "string" && v ? v : v === undefined || v === null ? null : String(v));
      return {
        createdTime: s(d.created_time),
        fields: ((d.field_data as Array<{ name: string; values?: string[] }>) ?? []).map((f) => ({ name: String(f.name), values: (f.values ?? []).map(String) })),
        adId: s(d.ad_id),
        adName: s(d.ad_name),
        adsetName: s(d.adset_name),
        campaignId: s(d.campaign_id),
        campaignName: s(d.campaign_name),
        formId: s(d.form_id),
        platform: s(d.platform),
        isOrganic: d.is_organic === true,
      } satisfies MetaLeadData;
    },
  };
}

export function notConnectedMeta(): MetaLeadAds {
  return {
    connected: false,
    fetchLead: async () => {
      throw new Error("Meta lead ads aren't set up (META_ACCESS_TOKEN).");
    },
  };
}
