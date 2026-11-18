import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Building2, FileSearch, Lightbulb, Plus, ShieldCheck, TriangleAlert, Activity, Layers } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { storage, useStorageVersion } from "@/lib/storage";
import { cn, formatDate } from "@/lib/utils";

const SECTIONS = [
  ["market_size", "Market size"],
  ["trends", "Trends"],
  ["competitors", "Competitors"],
  ["target_segments", "Segments"],
  ["risks", "Risks"],
  ["opportunities", "Opportunities"],
];
const VERIFICATION = [
  ["verified", "Verified", "#4f46e5"],
  ["partially_verified", "Partially verified", "#a5b4fc"],
  ["unverified", "Unverified", "#cbd5e1"],
  ["conflicting", "Conflicting", "#f59e0b"],
];

const findingsOf = (report) => SECTIONS.flatMap(([key]) => report?.[key] ?? []);

function useDashboardData() {
  const version = useStorageVersion();
  return useMemo(() => {
    const businesses = storage.listBusinesses();
    const reports = storage.listReports();
    const byId = Object.fromEntries(businesses.map((b) => [b.id, b]));
    const completed = reports.filter((r) => r.status === "completed" && r.result?.report);
    const latest = completed[0] ?? null;

    const allFindings = completed.flatMap((r) => findingsOf(r.result.report));
    const supported = allFindings.filter((f) => f.verification === "verified" || f.verification === "partially_verified").length;

    const chart = latest
      ? SECTIONS.map(([key, label]) => {
          const row = { section: label };
          for (const [v] of VERIFICATION) row[v] = (latest.result.report[key] ?? []).filter((f) => f.verification === v).length;
          return row;
        })
      : [];

    const activity = [
      ...businesses.map((b) => ({ at: b.createdAt, kind: "business", text: `Created business “${b.name}”` })),
      ...reports.map((r) => ({
        at: r.createdAt,
        kind: r.status,
        text: `${r.status === "completed" ? "Completed" : "Failed"} market research for ${byId[r.businessId]?.name ?? "a business"}`,
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6);

    return {
      businesses,
      reports,
      byId,
      latest,
      latestBusiness: businesses[0] ?? null,
      chart,
      activity,
      stats: {
        businesses: businesses.length,
        reports: completed.length,
        findings: allFindings.length,
        supportedPct: allFindings.length ? Math.round((supported / allFindings.length) * 100) : null,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal for localStorage
  }, [version]);
}

export function Dashboard() {
  const d = useDashboardData();
  const isMock = Boolean(d.latest?.result?.mock);

  return (
    <div className="space-y-6">
      <Welcome hasBusiness={d.businesses.length > 0} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Building2} label="Businesses" value={d.stats.businesses} />
        <Stat icon={FileSearch} label="Research reports" value={d.stats.reports} />
        <Stat icon={Layers} label="Findings tracked" value={d.stats.findings} />
        <Stat
          icon={ShieldCheck}
          label="Source-backed findings"
          value={d.stats.supportedPct === null ? "-" : `${d.stats.supportedPct}%`}
          hint="Verified or partially verified"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Evidence quality by category</CardTitle>
                <CardDescription>
                  {d.latest ? `Latest report · ${d.byId[d.latest.businessId]?.name ?? "Business"}` : "Findings from your latest report"}
                </CardDescription>
              </div>
              {isMock && <Badge variant="warning">Mock data</Badge>}
            </CardHeader>
            <CardContent>
              {d.latest ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.chart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barSize={28}>
                      <CartesianGrid vertical={false} stroke="#eef2f7" />
                      <XAxis dataKey="section" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                      {VERIFICATION.map(([key, label, color], i) => (
                        <Bar key={key} dataKey={key} name={label} stackId="v" fill={color} radius={i === VERIFICATION.length - 1 ? [4, 4, 0, 0] : 0} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty icon={FileSearch} text="Run market research on a business to see evidence quality here." />
              )}
            </CardContent>
          </Card>

          <RecentReports reports={d.reports} byId={d.byId} />
        </div>

        <div className="space-y-6">
          <BusinessOverview business={d.latestBusiness} />
          <KeyInsights report={d.latest} isMock={isMock} />
          <ActivityFeed items={d.activity} />
        </div>
      </div>
    </div>
  );
}

function Welcome({ hasBusiness }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-brand-600">Welcome to VentureLens</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            {hasBusiness ? "Here’s how your businesses are shaping up" : "Validate your next business idea with evidence"}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Market research with sourced findings, competitor analysis and clear confidence levels, all in one workspace.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {hasBusiness && (
            <Link to="/research" className={buttonVariants({ variant: "outline" })}>
              <FileSearch /> New research
            </Link>
          )}
          <Link to="/businesses/new" className={buttonVariants()}>
            <Plus /> Create business
          </Link>
        </div>
      </div>
    </Card>
  );
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentReports({ reports, byId }) {
  const rows = reports.slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Recent research reports</CardTitle>
          <CardDescription>Your latest market research runs</CardDescription>
        </div>
        <Link to="/history" className={buttonVariants({ variant: "link", size: "sm" })}>
          View all <ArrowRight />
        </Link>
      </CardHeader>
      <CardContent className={cn(rows.length && "px-0 pb-2")}>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/60 text-left text-xs text-slate-500">
                  <th className="px-5 py-2 font-medium">Business</th>
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 font-medium">Confidence</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-medium text-slate-900">{byId[r.businessId]?.name ?? "Unknown business"}</td>
                    <td className="px-5 py-3 text-slate-500">{formatDate(r.createdAt)}</td>
                    <td className="px-5 py-3">
                      <Badge variant={r.status === "completed" ? "success" : "danger"}>{r.status === "completed" ? "Completed" : "Failed"}</Badge>
                      {r.result?.mock && <Badge variant="warning" className="ml-1.5">Mock</Badge>}
                    </td>
                    <td className="px-5 py-3 capitalize text-slate-600">{r.result?.report?.overall_confidence?.level ?? "-"}</td>
                    <td className="px-5 py-3 text-right">
                      {r.status === "completed" && (
                        <Link to={`/research/${r.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                          Open
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={FileSearch} text="No research reports yet." />
        )}
      </CardContent>
    </Card>
  );
}

function BusinessOverview({ business }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Business overview</CardTitle>
          <CardDescription>Most recently added business</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {business ? (
          <div className="space-y-3">
            <div>
              <p className="text-base font-semibold text-slate-900">{business.name}</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{business.description}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
              <Field label="Industry" value={business.industry} />
              <Field label="Location" value={business.location} />
              <Field label="Stage" value={business.stage} />
              <Field label="Target customers" value={business.targetCustomers} />
            </dl>
          </div>
        ) : (
          <Empty icon={Building2} text="Add a business to start tracking it here." action={{ to: "/businesses/new", label: "Create business" }} />
        )}
      </CardContent>
    </Card>
  );
}

const Field = ({ label, value }) => (
  <div>
    <dt className="text-xs text-slate-400">{label}</dt>
    <dd className="truncate font-medium text-slate-700">{value || "-"}</dd>
  </div>
);

function KeyInsights({ report, isMock }) {
  const r = report?.result?.report;
  const items = r
    ? [
        ...(r.opportunities ?? []).slice(0, 2).map((f) => ({ kind: "opportunity", title: f.title, text: f.claim, conf: f.confidence })),
        ...(r.risks ?? [])
          .filter((f) => f.severity === "high")
          .concat((r.risks ?? []).filter((f) => f.severity !== "high"))
          .slice(0, 2)
          .map((f) => ({ kind: "risk", title: `${f.severity} risk`, text: f.claim, conf: f.confidence })),
      ]
    : [];
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Key insights</CardTitle>
          <CardDescription>Top opportunities and risks from the latest report</CardDescription>
        </div>
        {isMock && <Badge variant="warning">Mock</Badge>}
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="space-y-3">
            {items.map((it, i) => (
              <li key={i} className="flex gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
                    it.kind === "opportunity" ? "bg-brand-50 text-brand-600" : "bg-amber-50 text-amber-600"
                  )}
                >
                  {it.kind === "opportunity" ? <Lightbulb className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize text-slate-900">{it.title}</p>
                  <p className="line-clamp-2 text-xs text-slate-500">{it.text}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Confidence: {it.conf}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={Lightbulb} text="Insights appear after your first research report." />
        )}
      </CardContent>
    </Card>
  );
}

function ActivityFeed({ items }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Recent changes in your workspace</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ol className="relative space-y-4 border-l border-slate-200 pl-4">
            {items.map((it, i) => (
              <li key={i}>
                <span
                  className={cn(
                    "absolute -left-[5px] mt-1.5 size-2.5 rounded-full ring-2 ring-white",
                    it.kind === "failed" ? "bg-rose-400" : it.kind === "business" ? "bg-slate-400" : "bg-brand-500"
                  )}
                />
                <p className="text-sm text-slate-700">{it.text}</p>
                <p className="text-[11px] text-slate-400">{formatDate(it.at)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <Empty icon={Activity} text="No activity yet." />
        )}
      </CardContent>
    </Card>
  );
}

function Empty({ icon: Icon, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
      <Icon className="size-5 text-slate-300" />
      <p className="mt-2 text-sm text-slate-500">{text}</p>
      {action && (
        <Link to={action.to} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
