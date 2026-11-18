import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { AlertCircle, Building2, FileSearch, FlaskConical, Globe, Loader2, RotateCcw, SearchX, Sparkles, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ReportView } from "@/components/research/ReportView";
import { api } from "@/lib/api";
import { storage, toResearchInput, useStorageVersion } from "@/lib/storage";
import { cn, formatDate } from "@/lib/utils";

const FinancialAnalyst = lazy(() => import("@/components/finance/FinancialAnalyst").then((m) => ({ default: m.FinancialAnalyst })));

/** Friendly copy for backend / proxy error codes. Falls back to the server's own message. */
const ERROR_COPY = {
  NETWORK_ERROR: "The VentureLens backend is not reachable. Make sure the API server is running.",
  PROXY_NOT_CONFIGURED: "The development server is not configured to reach the research API. Check the developer setup.",
  UNAUTHORIZED: "The research API rejected this app's credentials. Check the developer setup.",
  RATE_LIMITED: "Too many research requests. Wait a minute and try again.",
  VALIDATION_ERROR: "Some business details were not accepted. Edit the business and try again.",
  REQUEST_DECLINED: "The AI model declined this request.",
  UPSTREAM_TIMEOUT: "Research took too long and was stopped.",
  RESEARCH_INCOMPLETE: "Research could not finish within its limits.",
  LIVE_RESEARCH_DISABLED: "Live research is not enabled on the server. Mock research is still available.",
  RESEARCH_IN_PROGRESS: "Live research for this business is already running. Wait for it to finish.",
};

export function BusinessWorkspace() {
  useStorageVersion();
  const { businessId } = useParams();
  const business = storage.getBusiness(businessId);
  const reports = business ? storage.listReportsForBusiness(businessId) : [];

  const { health } = useOutletContext() ?? {};
  const liveAvailable = health?.liveResearchAvailable === true;
  const [mode, setMode] = useState("mock"); // always starts as mock; live must be chosen each time
  const [confirming, setConfirming] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("research"); // research | financials
  const [state, setState] = useState({ status: "idle" }); // idle | loading | error
  const controller = useRef(null);
  const [elapsed, setElapsed] = useState(0);

  // Abort an in-flight request if the user leaves the page.
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (state.status !== "loading") return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [state.status]);

  if (!business) return <NotFound />;

  const selected = reports.find((r) => r.id === selectedId) ?? reports[0] ?? null;

  function onGenerateClick() {
    if (mode === "live") setConfirming(true); // live always needs an explicit confirmation
    else generate("mock");
  }

  async function generate(runMode) {
    if (state.status === "loading") return;
    if (runMode === "live" && !liveAvailable) return;
    setConfirming(false);
    controller.current = new AbortController();
    setElapsed(0);
    setState({ status: "loading", mode: runMode });
    try {
      const result = await api.runMarketResearch(toResearchInput(business), { signal: controller.current.signal, mode: runMode });
      const saved = storage.saveReport({ businessId: business.id, status: "completed", result });
      setSelectedId(saved.id);
      setState({ status: "idle" });
      setMode("mock"); // after a live run, go back to the free default
    } catch (err) {
      if (err?.name === "AbortError" || controller.current?.signal.aborted) {
        setState({ status: "idle" });
        return;
      }
      setState({ status: "error", error: err });
    }
  }

  const loading = state.status === "loading";

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Building2 className="size-5" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{business.name}</h2>
                <Badge variant="neutral">{business.stage}</Badge>
              </div>
              <p className="text-xs text-slate-500">
                {[business.industry, business.location].filter(Boolean).join(" · ")} · Added {formatDate(business.createdAt)}
              </p>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">{business.description}</p>
              {business.targetCustomers && <p className="mt-1 text-xs text-slate-500">Target customers: {business.targetCustomers}</p>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row lg:flex-col lg:items-end">
            <ModeSelector mode={mode} onChange={(m) => { setMode(m); setConfirming(false); }} liveAvailable={liveAvailable} disabled={loading} />
            <Button size="lg" onClick={onGenerateClick} disabled={loading || confirming}>
              {loading ? <Loader2 className="animate-spin" /> : reports.length ? <RotateCcw /> : <Sparkles />}
              {loading ? "Researching…" : reports.length ? "Generate new research" : "Generate Market Research"}
            </Button>
            {reports.length > 1 && !loading && (
              <select
                aria-label="Select a report"
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600"
                value={selected?.id}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {reports.map((r, i) => (
                  <option key={r.id} value={r.id}>
                    {i === 0 ? "Latest · " : ""}{formatDate(r.createdAt)} {new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{r.result?.mock ? " (mock)" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        </CardContent>
      </Card>

      <div role="tablist" aria-label="Workspace sections" className="flex gap-1 border-b border-slate-200">
        {[["research", "Market Research"], ["financials", "Financials"]].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "financials" ? (
        <Suspense fallback={<div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />}>
          <FinancialAnalyst business={business} />
        </Suspense>
      ) : (
      <>
      {confirming && <LiveConfirm onConfirm={() => generate("live")} onCancel={() => setConfirming(false)} />}
      {loading && <LoadingState live={state.mode === "live"} elapsed={elapsed} onCancel={() => controller.current?.abort()} />}
      {state.status === "error" && (
        <ErrorState error={state.error} onRetry={onGenerateClick} onDismiss={() => setState({ status: "idle" })} />
      )}

      {!loading && selected?.result?.report ? (
        <div className={cn(state.status === "error" && "opacity-60")}>
          <ReportView result={selected.result} />
        </div>
      ) : (
        !loading && state.status !== "error" && <EmptyState />
      )}
      </>
      )}
    </div>
  );
}

function ModeSelector({ mode, onChange, liveAvailable, disabled }) {
  const opt = (value, Icon, label, enabled) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      disabled={disabled || !enabled}
      onClick={() => onChange(value)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        mode === value ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"
      )}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
  return (
    <div className="space-y-1">
      <div role="radiogroup" aria-label="Research mode" className="inline-flex rounded-lg bg-slate-100 p-1">
        {opt("mock", FlaskConical, "Mock data", true)}
        {opt("live", Globe, "Live research", liveAvailable)}
      </div>
      <p className="text-[11px] text-slate-400 lg:text-right">
        {liveAvailable ? (mode === "live" ? "Uses web search and API credits" : "Free placeholder data") : "Live research is not enabled on the server"}
      </p>
    </div>
  );
}

function LiveConfirm({ onConfirm, onCancel }) {
  return (
    <div role="alertdialog" aria-labelledby="live-confirm-title" className="flex flex-col gap-4 rounded-xl border border-brand-200 bg-brand-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <p id="live-confirm-title" className="font-semibold text-slate-900">Run live market research?</p>
        <p className="mt-1 max-w-xl text-slate-600">
          Claude will search the web and assemble a sourced report. This uses Anthropic API credits (typically a few cents,
          with server-side search and token limits) and can take 1–3 minutes. Failed runs are not retried automatically.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={onConfirm}><Globe /> Run live research</Button>
      </div>
    </div>
  );
}

function LoadingState({ live, elapsed, onCancel }) {
  return (
    <Card>
      <CardContent className="space-y-5 p-6" aria-live="polite">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-brand-600" />
            <div>
              <p className="text-sm font-medium text-slate-900">{live ? "Running live market research…" : "Generating mock report…"}</p>
              <p className="text-xs text-slate-500">
                {live ? "Searching the web, checking sources and validating the report · usually 1–3 minutes" : "Placeholder data, no web research"} · {elapsed}s
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onCancel}><X /> Cancel</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorState({ error, onRetry, onDismiss }) {
  const copy = ERROR_COPY[error?.code] ?? error?.message ?? "Something went wrong.";
  const fields = Array.isArray(error?.details) ? error.details : null;
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-rose-600" />
      <div className="flex-1 text-sm">
        <p className="font-medium text-rose-900">Research failed</p>
        <p className="mt-0.5 text-rose-800">{copy}</p>
        {fields && (
          <ul className="mt-2 list-disc pl-5 text-xs text-rose-700">
            {fields.slice(0, 5).map((d, i) => <li key={i}>{d.path}: {d.message}</li>)}
          </ul>
        )}
        {error?.details?.meta?.estimatedCostUsd && (
          <p className="mt-2 text-xs text-rose-700">
            Usage before failure: {error.details.meta.usage?.input_tokens ?? 0} input / {error.details.meta.usage?.output_tokens ?? 0} output tokens ·{" "}
            {error.details.meta.searches ?? 0} searches · est. ${error.details.meta.estimatedCostUsd.total.toFixed(4)}
          </p>
        )}
        <p className="mt-2 text-[11px] text-rose-700/80">
          {error?.status ? `HTTP ${error.status} · ` : ""}{error?.code ?? "UNKNOWN"}
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onRetry}><RotateCcw /> Try again</Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center p-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><FileSearch className="size-6" /></span>
        <p className="mt-4 text-sm font-semibold text-slate-900">No research for this business yet</p>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          Generate a market research report covering market size, trends, competitors, customer segments, opportunities
          and risks, with evidence and source links for every finding.
        </p>
      </CardContent>
    </Card>
  );
}

function NotFound() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center p-10 text-center">
        <SearchX className="size-6 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-900">Business not found</p>
        <p className="mt-1 text-sm text-slate-500">It may have been created in another browser, or the link is wrong.</p>
        <div className="mt-4 flex gap-2">
          <Link to="/research" className={buttonVariants({ variant: "outline", size: "sm" })}>All businesses</Link>
          <Link to="/businesses/new" className={buttonVariants({ size: "sm" })}>Create a business</Link>
        </div>
      </CardContent>
    </Card>
  );
}
