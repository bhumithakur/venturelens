import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { FileUp, History } from "lucide-react";
import { Button } from "@/components/ui/button";
// Loaded on demand: the importer bundles Ajv + the backend schema for validation.
const ImportReport = lazy(() => import("@/components/research/ImportReport").then((m) => ({ default: m.ImportReport })));
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FINDING_SECTIONS } from "@/lib/report";
import { storage, useStorageVersion } from "@/lib/storage";
import { formatDate } from "@/lib/utils";

export function ResearchHistory() {
  useStorageVersion();
  const reports = storage.listReports();
  const byId = Object.fromEntries(storage.listBusinesses().map((b) => [b.id, b]));
  const [importing, setImporting] = useState(false);

  return (
    <div className="space-y-6">
    {importing && <Suspense fallback={<div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />}><ImportReport onClose={() => setImporting(false)} /></Suspense>}
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-base">Research history</CardTitle>
          <CardDescription>All saved market research reports, newest first.</CardDescription>
        </div>
        {!importing && <Button variant="outline" size="sm" onClick={() => setImporting(true)}><FileUp /> Import report</Button>}
      </CardHeader>
      <CardContent className={reports.length ? "px-0 pb-2" : undefined}>
        {reports.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/60 text-left text-xs text-slate-500">
                  <th className="px-5 py-2 font-medium">Business</th>
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 font-medium">Findings</th>
                  <th className="px-5 py-2 font-medium">Confidence</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((r) => {
                  const rep = r.result?.report;
                  const n = rep ? FINDING_SECTIONS.reduce((acc, s) => acc + (rep[s]?.length ?? 0), 0) : 0;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-medium text-slate-900">{byId[r.businessId]?.name ?? "Deleted business"}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDate(r.createdAt)}</td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <Badge variant={r.status === "completed" ? "success" : "danger"}>{r.status === "completed" ? "Completed" : "Failed"}</Badge>
                        {r.result?.mock && <Badge variant="warning" className="ml-1.5">MOCK DATA</Badge>}
                        {r.result?.mock === false && r.result?.meta?.mode === "live" && <Badge variant="success" className="ml-1.5">Live</Badge>}
                        {r.source === "import" && <Badge variant="neutral" className="ml-1.5">Imported</Badge>}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{rep ? n : "-"}</td>
                      <td className="px-5 py-3 capitalize text-slate-600">{rep?.overall_confidence?.level ?? "-"}</td>
                      <td className="px-5 py-3 text-right">
                        {rep && <Link to={`/research/${r.id}`} className="text-xs font-medium text-brand-600 hover:underline">Open</Link>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center">
            <History className="mx-auto size-6 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">No reports yet. Generate research from a business workspace.</p>
            <Link to="/research" className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline">Go to Market Research</Link>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
