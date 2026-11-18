import { Link } from "react-router-dom";
import { Building2, ChevronRight, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { storage, useStorageVersion } from "@/lib/storage";
import { formatDate } from "@/lib/utils";

/** Market Research entry point: pick a business to open its workspace. */
export function ResearchIndex() {
  useStorageVersion();
  const businesses = storage.listBusinesses();
  const reports = storage.listReports();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-base">Choose a business</CardTitle>
          <CardDescription>Open a business to generate or review its market research.</CardDescription>
        </div>
        <Link to="/businesses/new" className={buttonVariants({ size: "sm" })}><Plus /> New business</Link>
      </CardHeader>
      <CardContent>
        {businesses.length ? (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {businesses.map((b) => {
              const last = reports.find((r) => r.businessId === b.id);
              return (
                <li key={b.id}>
                  <Link to={`/businesses/${b.id}/research`} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Building2 className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{b.name}</p>
                      <p className="truncate text-xs text-slate-500">{[b.industry, b.location].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className="hidden text-xs text-slate-500 sm:block">{last ? `Last research ${formatDate(last.createdAt)}` : "No research yet"}</span>
                    <Badge variant="neutral">{b.stage}</Badge>
                    <ChevronRight className="size-4 text-slate-300" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center">
            <Building2 className="mx-auto size-6 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">Add a business first, then generate its market research.</p>
            <Link to="/businesses/new" className={buttonVariants({ variant: "outline", size: "sm" }) + " mt-3"}>Create business</Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
