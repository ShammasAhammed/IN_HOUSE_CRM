// Settings → AI → which model does what (Stage 12.3): providers and personal data, Malayalam, each tier's order,
// a first choice or lock per feature, and the decision helper's two uses. Owner only (the service checks).
import type { Route } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { AI_FEATURE_LABELS, AI_FEATURES } from "@/lib/types";
import type { RouterPage } from "@/services/ai";
import { DEFAULT_ORDER, FEATURE_TIER, PROVIDER_LABELS, PROVIDERS, TIER_LABELS, TIERS } from "@/services/rules/ai-router";
import { routerAction } from "../actions";

const Hidden = ({ values }: { values: Record<string, string> }) => (
  <>
    {Object.entries(values).map(([k, v]) => (
      <input key={k} type="hidden" name={k} value={v} />
    ))}
  </>
);

function Switch({ on, values, label }: { on: boolean; values: Record<string, string>; label: string }) {
  return (
    <form action={routerAction} className="flex items-center gap-2">
      <Hidden values={values} />
      {on ? null : <input type="hidden" name="on" value="on" />}
      <span className="text-sm">{on ? "On" : "Off"}</span>
      <Button type="submit" size="sm" variant="outline" aria-label={`${on ? "Turn off" : "Turn on"}: ${label}`}>
        {on ? "Turn off" : "Turn on"}
      </Button>
    </form>
  );
}

export function RouterSettingsSection({ page }: { page: RouterPage }) {
  const { settings, models, decision } = page;
  const connected = new Set(models.map((m) => m.model));
  const providers = new Set(models.map((m) => m.provider));
  const helper = decision.map((d) => PROVIDER_LABELS[d.provider] ?? d.provider).join(", then ");
  return (
    <section className="space-y-4" aria-label="Which model does what">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Which model does what</h2>
        <Link href={"/settings/ai/compare" as Route} className="text-sm text-primary hover:underline">
          Compare models side by side
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Each job uses the cheapest connected model of its level first, and moves to the next one if that fails, refuses or answers badly. Every try counts against the limit above. Malayalam never goes to Claude.
      </p>

      <div className="rounded-lg border bg-card p-4 shadow-card">
        <h3 className="mb-2 text-sm font-semibold">Providers</h3>
        <ul className="divide-y">
          {PROVIDERS.map((p) => (
            <li key={p} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm">
              <span className="min-w-0 flex-1 font-medium">{PROVIDER_LABELS[p]}</span>
              {providers.has(p) ? <Badge tone="success">Connected</Badge> : <Badge tone="neutral">No key</Badge>}
              <span className="text-xs text-muted-foreground">May receive personal data</span>
              <Switch on={settings.personal?.[p] !== false} values={{ op: "personal", provider: p }} label={`${PROVIDER_LABELS[p]} may receive personal data`} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">All three are paid APIs that don&apos;t train on what they&apos;re sent. Free tiers are never used. Turning one off keeps names, phones, chats and client details away from it.</p>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-card">
        <h3 className="mb-2 text-sm font-semibold">Malayalam</h3>
        <form action={routerAction} className="flex flex-wrap items-center gap-2">
          <Hidden values={{ op: "malayalam" }} />
          <Select name="first" defaultValue={settings.malayalamFirst ?? "gemini"} aria-label="Malayalam goes first to" className="h-9 min-w-0 flex-1 sm:w-56 sm:flex-none">
            <option value="gemini">Gemini, then ChatGPT</option>
            <option value="openai">ChatGPT, then Gemini</option>
          </Select>
          <Button type="submit" size="sm" variant="outline">
            Save
          </Button>
        </form>
        {!providers.has("gemini") && !providers.has("openai") ? <p className="mt-2 text-xs text-warning">Neither is connected, so Malayalam jobs stop with a message until a Gemini or OpenAI key is added.</p> : null}
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-card">
        <h3 className="mb-2 text-sm font-semibold">Order within each level</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => {
            const list = settings.order?.[tier] ?? DEFAULT_ORDER[tier];
            return (
              <div key={tier}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{TIER_LABELS[tier]}</p>
                <ol className="space-y-1">
                  {list.map((model, i) => (
                    <li key={model} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                      <span className={connected.has(model) ? "min-w-0 flex-1 truncate" : "min-w-0 flex-1 truncate text-muted-foreground line-through"}>{model}</span>
                      {[-1, 1].map((by) => (
                        <form key={by} action={routerAction}>
                          <Hidden values={{ op: "move", tier, model, by: String(by) }} />
                          <button type="submit" disabled={(by < 0 && i === 0) || (by > 0 && i === list.length - 1)} aria-label={`Move ${model} ${by < 0 ? "up" : "down"}`} className="rounded p-1 text-muted-foreground hover:bg-hover disabled:opacity-30">
                            {by < 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                          </button>
                        </form>
                      ))}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Crossed out: no key yet, skipped. Gemini doesn&apos;t look things up yet, so Ask and @AI skip it.</p>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-card">
        <h3 className="mb-2 text-sm font-semibold">By feature</h3>
        <ul className="divide-y">
          {AI_FEATURES.filter((f) => f !== "compare" && f !== "route_hint" && f !== "lead_score").map((f) => {
            const p = settings.prefer?.[f];
            return (
              <li key={f} className="py-2">
                <form action={routerAction} className="flex flex-wrap items-center gap-2 text-sm">
                  <Hidden values={{ op: "prefer", feature: f }} />
                  <span className="min-w-0 flex-1">
                    {AI_FEATURE_LABELS[f]} <span className="text-xs text-muted-foreground">· {TIER_LABELS[FEATURE_TIER[f]]}</span>
                  </span>
                  <Select name="model" defaultValue={p?.model ?? ""} aria-label={`Model for ${AI_FEATURE_LABELS[f]}`} className="h-8 w-48">
                    <option value="">Automatic</option>
                    {models.map((m) => (
                      <option key={m.model} value={m.model}>
                        {m.model}
                      </option>
                    ))}
                  </Select>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" name="only" defaultChecked={p?.only ?? false} className="size-4 accent-primary" /> only this one
                  </label>
                  <Button type="submit" size="sm" variant="outline">
                    Save
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">A model picked here is tried first; with &quot;only this one&quot; the job uses nothing else.</p>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-card">
        <h3 className="mb-1 text-sm font-semibold">Decision helper</h3>
        <p className="mb-2 text-xs text-muted-foreground">{helper ? `Answered by ${helper}.` : "Not connected: add a TypeSafe key (or the Claude key) to use it."} Small, cheap questions; phone numbers and emails are never sent.</p>
        <ul className="divide-y">
          <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1">How hard is each Ask and @AI question (an easy one uses a cheaper model)</span>
            <Switch on={settings.hints !== false} values={{ op: "helper", use: "hints" }} label="Question difficulty hints" />
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1">Hot, warm or cold hint on new leads, for the sales team (never changes the lead)</span>
            <Switch on={settings.leadScores !== false} values={{ op: "helper", use: "leadScores" }} label="Lead hints" />
          </li>
        </ul>
      </div>
    </section>
  );
}
