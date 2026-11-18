import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileUp, ShieldAlert, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { storage } from "@/lib/storage";
import { MAX_IMPORT_BYTES, fingerprint, parseLiveResult } from "@/lib/importReport";
import { formatDate } from "@/lib/utils";

/** Import a saved live research result (e.g. live-smoke-output.json) into local report history. */
export function ImportReport({ onClose }) {
  const businesses = storage.listBusinesses();
  const [parsed, setParsed] = useState(null); // { ok, result?, errors?, fileName }
  const [businessId, setBusinessId] = useState(() => businesses.find((b) => /rang\s*rivaaz/i.test(b.name))?.id ?? "");
  const [done, setDone] = useState(null); // { report, duplicate }
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    setDone(null);
    const file = e.target.files?.[0];
    if (!file) return setParsed(null);
    if (file.size > MAX_IMPORT_BYTES) return setParsed({ ok: false, errors: ["The file is too large to be a research report."], fileName: file.name });
    setParsed({ ...parseLiveResult(await file.text()), fileName: file.name });
  }

  async function onImport() {
    if (!parsed?.ok || !businessId) return;
    setBusy(true);
    try {
      setDone(storage.importReport({ businessId, result: parsed.result, fingerprint: await fingerprint(parsed.result) }));
    } finally {
      setBusy(false);
    }
  }

  const r = parsed?.ok ? parsed.result : null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-base">Import a live research report</CardTitle>
          <CardDescription>Select a saved result such as <code className="text-[11px]">live-smoke-output.json</code>. It is validated and stored exactly as generated.</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close import"><X /></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600 hover:border-brand-400 hover:bg-brand-50/30">
          <FileUp className="size-5 text-brand-600" />
          <span>{parsed?.fileName ?? "Choose a .json file"}</span>
          <input type="file" accept="application/json,.json" className="sr-only" onChange={onFile} />
        </label>

        {parsed && !parsed.ok && (
          <div role="alert" className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">This file can’t be imported</p>
              <ul className="mt-1 list-disc pl-4 text-xs">{parsed.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          </div>
        )}

        {r && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle2 className="size-4" /> Valid live report
              <Badge variant="success">Live research</Badge>
              <span>· {formatDate(r.generatedAt)} · {r.meta.servedBy ?? r.meta.model} · {r.meta.searches} search{r.meta.searches === 1 ? "" : "es"} · confidence {r.report.overall_confidence.level}</span>
            </div>
            <p className="text-xs text-slate-500">Researched input: “{r.input.business}”{r.input.region ? ` · ${r.input.region}` : ""}</p>

            {businesses.length ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <label htmlFor="import-business" className="text-sm font-medium text-slate-800">Attach to business</label>
                  <Select id="import-business" value={businessId} onChange={(e) => { setBusinessId(e.target.value); setDone(null); }}>
                    <option value="" disabled>Select a business…</option>
                    {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </div>
                <Button onClick={onImport} disabled={!businessId || busy || Boolean(done)}>Import report</Button>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Create the business first, then import. <Link to="/businesses/new" className="font-medium text-brand-600 hover:underline">Create business</Link>
              </p>
            )}
          </div>
        )}

        {done && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-700">
              {done.duplicate ? "This report was already imported, so nothing was added." : "Report imported."}
            </span>
            <Link to={`/research/${done.report.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>Open report</Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
