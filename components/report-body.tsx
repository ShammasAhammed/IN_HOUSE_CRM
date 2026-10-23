// A monthly client report's numbers and words (Stage 11.4), shared by the editor and the printable page.
import { formatCount, formatMonth, formatRupees } from "@/lib/format";
import type { ReportFacts } from "@/services/rules/reports";

const count = (n: number | null) => (n === null ? "—" : formatCount(n));
const rupees = (p: number | null) => (p === null ? "—" : formatRupees(p));

export function ReportNumbers({ facts: f }: { facts: ReportFacts }) {
  const r = f.results;
  const tiles = [
    { label: "Leads", value: count(r?.leads ?? null), target: r?.targetLeads },
    { label: "Counselling calls", value: count(r?.callsBooked ?? null) },
    { label: "Admissions", value: count(r?.admissions ?? null), target: r?.targetAdmissions },
    { label: "Ad spend", value: rupees(r?.spendPaise ?? f.ads?.spendPaise ?? null) },
    { label: "Cost per lead", value: rupees(r?.costPerLeadPaise ?? f.ads?.costPerLeadPaise ?? null) },
    { label: "Cost per admission", value: rupees(r?.costPerAdmissionPaise ?? null) },
  ];
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md bg-subtle px-3 py-2 print:border print:bg-transparent">
            <dt className="text-xs text-muted-foreground">{t.label}</dt>
            <dd className="tabular text-base font-semibold">
              {t.value}
              {t.target ? <span className="text-xs font-normal text-muted-foreground"> of {formatCount(t.target)}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      {f.ads ? (
        <p className="text-sm">
          Meta ads: {formatRupees(f.ads.spendPaise)} spent, {formatCount(f.ads.leads)} leads, {formatCount(f.ads.clicks)} clicks.
        </p>
      ) : null}
      <div>
        <h3 className="text-sm font-semibold">Work done in {formatMonth(f.month)}</h3>
        <ul className="mt-1 space-y-0.5 text-sm">
          {f.deliverables.map((d) => (
            <li key={d.name}>
              {d.name}: <span className="tabular">{d.delivered} of {d.target}</span>
            </li>
          ))}
          <li>
            Tasks completed: <span className="tabular">{f.tasksDone.count}</span>
          </li>
          <li>
            Creatives approved: <span className="tabular">{f.creativesApproved}</span>
          </li>
          <li>
            Posts published: <span className="tabular">{f.postsPublished}</span>
          </li>
        </ul>
        {f.tasksDone.titles.length ? <p className="mt-1 text-xs text-muted-foreground">Including: {f.tasksDone.titles.join(" · ")}</p> : null}
      </div>
    </div>
  );
}

export function ReportWords({ summary, wentWell, nextSteps }: { summary: string; wentWell: string; nextSteps: string }) {
  return (
    <div className="space-y-4 text-sm">
      {[
        ["Summary", summary],
        ["What went well", wentWell],
        ["Next month", nextSteps],
      ]
        .filter(([, text]) => text)
        .map(([title, text]) => (
          <section key={title}>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 break-words whitespace-pre-wrap">{text}</p>
          </section>
        ))}
    </div>
  );
}
