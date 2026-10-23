"use client";

// Import leads from a spreadsheet (Stage 10b): pick the file, match its columns, check, import.
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { csvRecords } from "@/lib/csv";
import { countOf, formatCount } from "@/lib/format";
import { LEAD_STAGES, LEAD_STAGE_LABELS } from "@/lib/types";
import { IMPORT_FIELDS, MAX_IMPORT, type ImportField } from "@/services/rules/lead-intake";
import { checkImportAction, runImportAction, type ImportReply } from "./actions";

const LABELS: Record<ImportField, string> = {
  name: "Contact name",
  phone: "Phone",
  email: "Email",
  institution: "Institution",
  contactRole: "Their role",
  district: "District / city",
  segment: "Type",
  channel: "Source / channel",
  campaign: "Campaign",
  score: "Score (hot/warm/cold)",
  problem: "What they need",
  tags: "Tags",
  note: "Note",
};

/** Header words that usually mean each field. */
const GUESS: Array<[ImportField, RegExp]> = [
  ["email", /e-?mail/i],
  ["phone", /phone|mobile|whats ?app|contact (no|number)|tel/i],
  ["institution", /institut|school|college|company|organi[sz]ation|academy|centre|center/i],
  ["contactRole", /role|designation|title|position/i],
  ["district", /district|city|place|location|town/i],
  ["segment", /type|segment|category/i],
  ["channel", /source|channel|medium/i],
  ["campaign", /campaign/i],
  ["score", /score|temperature|priority/i],
  ["problem", /need|requirement|problem|message|comment|enquiry|inquiry/i],
  ["tags", /tag|label/i],
  ["note", /note|remark/i],
  ["name", /name/i],
];

function guess(header: string, taken: Set<string>): ImportField | "" {
  const hit = GUESS.find(([f, re]) => re.test(header) && !taken.has(f));
  return hit ? hit[0] : "";
}

export function ImportWizard({ people }: { people: Array<{ id: string; fullName: string }> }) {
  const [file, setFile] = useState<{ name: string; headers: string[]; records: Array<Record<string, string>> } | null>(null);
  const [mapping, setMapping] = useState<Record<string, ImportField | "">>({});
  const [defaults, setDefaults] = useState({ ownerId: "", stage: "new", tag: "", channel: "" });
  const [reply, setReply] = useState<ImportReply | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(() => {
    if (!file) return null;
    const rows = file.records.map((r) => {
      const out: Record<string, string> = {};
      for (const [header, field] of Object.entries(mapping)) if (field && r[header]) out[field] = out[field] ? `${out[field]} ${r[header]}` : r[header]!;
      return out;
    });
    return { fileName: file.name, rows, ...defaults };
  }, [file, mapping, defaults]);

  async function pick(f: File | undefined) {
    setReply(null);
    setDone(null);
    setError(null);
    if (!f) return setFile(null);
    if (f.size > 3_000_000) return setError("That file is over 3 MB. Split it into smaller files.");
    const parsed = csvRecords(await f.text());
    const records = parsed.records.filter((r) => Object.values(r).some((v) => v.trim()));
    if (!parsed.headers.length || !records.length) return setError("No rows found. Save the sheet as CSV (File → Download → CSV) and pick that file.");
    if (records.length > MAX_IMPORT) return setError(`The file has ${formatCount(records.length)} rows. Import at most ${formatCount(MAX_IMPORT)} at a time: split the file.`);
    const taken = new Set<string>();
    const m: Record<string, ImportField | ""> = {};
    for (const h of parsed.headers) {
      const g = guess(h, taken);
      if (g) taken.add(g);
      m[h] = g;
    }
    setMapping(m);
    setFile({ name: f.name, headers: parsed.headers, records });
  }

  const mapped = Object.values(mapping).filter(Boolean);
  const ready = mapped.includes("name") || mapped.includes("phone") || mapped.includes("email");

  return (
    <div className="max-w-4xl space-y-5">
      <section className="space-y-2 rounded-lg border bg-card p-4 shadow-card" aria-label="File">
        <h2 className="text-sm font-semibold">1. The file</h2>
        <p className="text-sm text-muted-foreground">A spreadsheet saved as CSV: in Excel, File → Save as → CSV; in Google Sheets, File → Download → CSV. The first row must be the column names.</p>
        <Input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={(e) => pick(e.currentTarget.files?.[0])} className="h-auto py-1.5" />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </section>

      {file ? (
        <>
          <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card" aria-label="Columns">
            <h2 className="text-sm font-semibold">
              2. Match the columns <span className="font-normal text-muted-foreground">· {formatCount(file.records.length)} rows</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-1.5 font-normal">Column in the file</th>
                    <th className="pb-1.5 font-normal">Example</th>
                    <th className="pb-1.5 font-normal">Goes into</th>
                  </tr>
                </thead>
                <tbody>
                  {file.headers.map((h) => (
                    <tr key={h} className="border-t">
                      <td className="py-1.5 pr-2 font-medium">{h || "(no name)"}</td>
                      <td className="max-w-48 truncate py-1.5 pr-2 text-muted-foreground">{file.records.find((r) => r[h])?.[h] ?? ""}</td>
                      <td className="py-1.5">
                        <Select aria-label={`Field for ${h}`} value={mapping[h] ?? ""} onChange={(e) => (setReply(null), setMapping({ ...mapping, [h]: e.target.value as ImportField | "" }))} className="h-8">
                          <option value="">Skip this column</option>
                          {IMPORT_FIELDS.map((f) => (
                            <option key={f} value={f}>
                              {LABELS[f]}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ready ? null : <p className="text-sm text-warning">Match at least a name, phone or email column.</p>}
          </section>

          <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card" aria-label="For every lead">
            <h2 className="text-sm font-semibold">3. For every imported lead (optional)</h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">Owner</span>
                <Select value={defaults.ownerId} onChange={(e) => setDefaults({ ...defaults, ownerId: e.target.value })} className="h-9">
                  <option value="">Nobody yet</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">Stage</span>
                <Select value={defaults.stage} onChange={(e) => setDefaults({ ...defaults, stage: e.target.value })} className="h-9">
                  {LEAD_STAGES.filter((s) => s !== "lost").map((s) => (
                    <option key={s} value={s}>
                      {LEAD_STAGE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">Tag</span>
                <Input value={defaults.tag} maxLength={30} placeholder="e.g. Expo Oct 2026" onChange={(e) => setDefaults({ ...defaults, tag: e.target.value })} className="h-9" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">Source, if the file has none</span>
                <Input value={defaults.channel} maxLength={100} placeholder="e.g. Education expo" onChange={(e) => setDefaults({ ...defaults, channel: e.target.value })} className="h-9" />
              </label>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card" aria-label="Check and import">
            <h2 className="text-sm font-semibold">4. Check, then import</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!ready || pending}
                onClick={() =>
                  start(async () => {
                    setDone(null);
                    setReply(await checkImportAction(payload));
                  })
                }
              >
                {pending && !reply ? "Checking…" : "Check the file"}
              </Button>
              {reply?.ok && reply.check.fresh > 0 && done === null ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await runImportAction(payload);
                      setReply(r);
                      if (r.ok) setDone(r.imported ?? 0);
                    })
                  }
                >
                  <FileUp /> {pending ? "Importing…" : `Import ${formatCount(reply.check.fresh)} new leads`}
                </Button>
              ) : null}
            </div>
            {reply && !reply.ok ? (
              <p role="alert" className="text-sm text-danger">
                {reply.message}
              </p>
            ) : null}
            {reply?.ok ? <Report check={reply.check} /> : null}
            {done !== null ? (
              <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
                {countOf(done, "lead")} imported.{" "}
                <Link href={defaults.tag ? `/sales/leads?stage=all&tag=${encodeURIComponent(defaults.tag)}` : "/sales/leads?stage=all"} className="font-medium underline">
                  See them
                </Link>
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Report({ check: c }: { check: Extract<ImportReply, { ok: true }>["check"] }) {
  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className="font-medium">{formatCount(c.fresh)} new</span> · {formatCount(c.duplicates.length)} already there (skipped) · {formatCount(c.unusable.length)} can&apos;t be used (skipped)
      </p>
      {c.duplicates.length ? (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Duplicates</summary>
          <ul className="mt-1 space-y-0.5 text-xs">
            {c.duplicates.slice(0, 50).map((d) => (
              <li key={d.row}>
                Row {d.row}: {d.name} matches {d.matches}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {c.unusable.length ? (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Rows that can&apos;t be used</summary>
          <ul className="mt-1 space-y-0.5 text-xs">
            {c.unusable.slice(0, 50).map((d) => (
              <li key={d.row}>
                Row {d.row}: {d.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
