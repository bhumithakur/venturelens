import { Link, useParams } from "react-router-dom";
import { ArrowLeft, SearchX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ReportView } from "@/components/research/ReportView";
import { storage, useStorageVersion } from "@/lib/storage";
import { formatDate } from "@/lib/utils";

/** A single saved report, reachable from Research History and the Dashboard. */
export function ReportPage() {
  useStorageVersion();
  const { reportId } = useParams();
  const report = storage.getReport(reportId);
  const business = report ? storage.getBusiness(report.businessId) : null;

  if (!report?.result?.report) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center p-10 text-center">
          <SearchX className="size-6 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-900">Report not found</p>
          <p className="mt-1 text-sm text-slate-500">It may have been saved in another browser.</p>
          <Link to="/history" className={buttonVariants({ variant: "outline", size: "sm" }) + " mt-4"}>Research history</Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/history" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><ArrowLeft className="size-3.5" /> Research history</Link>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{business?.name ?? "Deleted business"}</h2>
          <p className="text-xs text-slate-500">Report from {formatDate(report.createdAt)}</p>
        </div>
        {business && (
          <Link to={`/businesses/${business.id}/research`} className={buttonVariants({ variant: "outline" })}>Open workspace</Link>
        )}
      </div>
      <ReportView result={report.result} />
    </div>
  );
}
