// Ad results (Stage 10.1, D92): ad accounts linked to clients, Meta's numbers behind an adapter, and a cache.

export const AD_RANGES = ["last_7d", "last_30d", "this_month", "last_month"] as const;
export type AdRange = (typeof AD_RANGES)[number];

export type AdTotals = {
  /** In the ad account's currency, in its smallest unit (paise for INR). */
  spendMinor: number;
  impressions: number;
  clicks: number;
  /** Leads Meta counts (lead form, website and messaging lead actions), with Meta's default attribution. */
  leads: number;
};

export type AdCampaignRow = AdTotals & { id: string; name: string };

export type AdInsights = {
  accountName: string;
  currency: string;
  timeZone: string;
  /** The dates Meta used, in the account's time zone. */
  since: string;
  until: string;
  /** Reach for the whole range (people are never added up across days or campaigns). */
  reach: number;
  totals: AdTotals;
  campaigns: AdCampaignRow[];
  daily: Array<{ date: string; spendMinor: number; leads: number }>;
};

export interface MetaAdInsights {
  readonly connected: boolean;
  insights(accountId: string, range: AdRange): Promise<AdInsights>;
}

export interface AdsRepository {
  accountFor(clientId: string): Promise<{ id: string; accountId: string } | null>;
  link(row: { id: string; clientId: string; accountId: string; linkedById: string }, at: Date): Promise<void>;
  unlink(clientId: string, at: Date): Promise<string | null>;
  cached(clientId: string, rangeKey: string): Promise<{ data: AdInsights; fetchedAt: Date } | null>;
  store(clientId: string, rangeKey: string, data: AdInsights, at: Date): Promise<void>;
}
