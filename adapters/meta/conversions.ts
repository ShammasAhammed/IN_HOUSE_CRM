// Meta's Conversions API for CRM events (Stage 10a.5, D90): tells Meta which lead-ad leads became qualified or won,
// so its delivery learns from real results. The only place that posts conversions to graph.facebook.com.
import type { MetaConversions } from "@/repositories";

export function metaConversions(deps: { token: string; version?: string; fetch?: typeof fetch }): MetaConversions {
  const http = deps.fetch ?? fetch;
  return {
    connected: true,
    async send(datasetId, event, testEventCode) {
      const res = await http(`https://graph.facebook.com/${deps.version || "v23.0"}/${encodeURIComponent(datasetId)}/events?access_token=${encodeURIComponent(deps.token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [event], ...(testEventCode ? { test_event_code: testEventCode } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return res.ok ? { ok: true, message: "sent" } : { ok: false, message: `error: ${body.error?.message ?? res.status}` };
    },
  };
}

export function notConnectedMetaConversions(): MetaConversions {
  return { connected: false, send: async () => ({ ok: false, message: "not set up" }) };
}
