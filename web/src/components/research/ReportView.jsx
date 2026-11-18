import { useState } from "react";
import {
  AlertTriangle, BarChart3, ChevronDown, ExternalLink, FlaskConical, HelpCircle, Lightbulb, Swords, TrendingDown,
  TrendingUp, Minus, Sparkles, Target, Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import { FINDING_SECTIONS, VERIFICATION } from "@/lib/report";

/*
 * Renders the backend response of POST /api/agents/market-research/run:
 *   { agent, mock, generatedAt, input, report, meta }
 * report: summary, market_size, trends, competitors, target_segments, risks, opportunities,
 *         research_gaps, overall_confidence { level, rationale }
 * every finding: claim, evidence, sources [{ url, title }], verification, confidence
 */

const CONFIDENCE = { high: "success", medium: "default", low: "neutral" };
const SEVERITY = { high: "danger", medium: "warning", low: "neutral" };
const COMPETITOR_TYPE = { direct: "Direct", indirect: "Indirect", substitute: "Substitute" };
const DIRECTION = {
  growing: { icon: TrendingUp, cls: "text-emerald-600" },
  emerging: { icon: Sparkles, cls: "text-brand-600" },
  stable: { icon: Minus, cls: "text-slate-500" },
  declining: { icon: TrendingDown, cls: "text-rose-600" },
};

/** Only http(s) links are rendered as anchors (defence in depth; the backend schema enforces this too). */
const safeHref = (url) => (typeof url === "string" && /^https?:\/\//i.test(url) ? url : null);

export function MockBanner() {
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
      <FlaskConical className="mt-0.5 size-5 shrink-0" />
      <div className="text-sm">
        <p className="font-semibold tracking-wide">MOCK DATA: no research was performed</p>
        <p className="mt-0.5 text-amber-800">
          The backend is in mock mode. Every figure, finding and source below is placeholder content for testing the
          interface. Do not use it for business decisions.
        </p>
      </div>
    </div>
  );
}

export function ReportView({ result }) {
  const { report, mock, meta } = result;
  const findings = FINDING_SECTIONS.flatMap((s) => report[s] ?? []);
  const counts = Object.keys(VERIFICATION).map((k) => [k, findings.filter((f) => f.verification === k).length]);

  return (
    <div className="space-y-6">
      {mock && <MockBanner />}

      {/* Executive summary */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-base">Executive summary</CardTitle>
            <CardDescription>Generated {formatDate(result.generatedAt)}{meta?.mode ? ` · ${meta.mode} mode` : ""}</CardDescription>
          </div>
          {mock && <Badge variant="warning">MOCK DATA</Badge>}
          {!mock && meta?.mode === "live" && <Badge variant="success">Live research</Badge>}
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-3">
          <p className="text-sm leading-relaxed text-slate-700 lg:col-span-2">{report.summary}</p>
          <div className="space-y-4 rounded-lg border border-slate-100 bg-slate-50/60 p-4">
            <div>
              <p className="text-xs text-slate-500">Overall confidence</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={CONFIDENCE[report.overall_confidence.level]} className="capitalize">{report.overall_confidence.level}</Badge>
              </div>
              <p className="mt-1.5 text-xs text-slate-600">{report.overall_confidence.rationale}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Verification of {findings.length} findings</p>
              <VerificationBar counts={counts} total={findings.length} />
            </div>
            {meta?.mode === "live" && <LiveMeta meta={meta} />}
          </div>
        </CardContent>
      </Card>

      {/* Market findings */}
      <Section icon={BarChart3} title="Market size & growth" mock={mock} items={report.market_size} empty="No market size figures found.">
        {(f) => (
          <FindingCard f={f} key={f.claim}
            heading={<span className="flex flex-wrap items-baseline gap-x-2"><span className="text-lg font-semibold text-slate-900">{f.value}</span><span className="text-sm text-slate-600">{f.metric}</span><span className="text-xs text-slate-400">as of {f.as_of}</span></span>} />
        )}
      </Section>

      <Section icon={TrendingUp} title="Market trends" mock={mock} items={report.trends} empty="No trends found.">
        {(f) => {
          const d = DIRECTION[f.direction] ?? DIRECTION.stable;
          return <FindingCard f={f} key={f.claim} heading={<span className={cn("inline-flex items-center gap-1.5 text-xs font-medium capitalize", d.cls)}><d.icon className="size-3.5" />{f.direction}</span>} />;
        }}
      </Section>

      <Section icon={Users} title="Target segments" mock={mock} items={report.target_segments} empty="No customer segments found.">
        {(f) => <FindingCard f={f} key={f.claim} heading={<span className="text-sm font-semibold text-slate-900">{f.segment}</span>} />}
      </Section>

      {/* Competitor insights */}
      <Section icon={Swords} title="Competitor insights" mock={mock} items={report.competitors} empty="No competitors identified.">
        {(f) => (
          <FindingCard f={f} key={f.name + f.claim}
            heading={<CompetitorHeading f={f} />} />
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section icon={Lightbulb} title="Opportunities" mock={mock} items={report.opportunities} empty="No opportunities identified." single>
          {(f) => <FindingCard f={f} key={f.title} heading={<span className="text-sm font-semibold text-slate-900">{f.title}</span>} />}
        </Section>
        <Section icon={AlertTriangle} title="Risks & challenges" mock={mock} items={report.risks} empty="No risks identified." single>
          {(f) => <FindingCard f={f} key={f.claim} heading={<Badge variant={SEVERITY[f.severity]} className="capitalize">{f.severity} severity</Badge>} />}
        </Section>
      </div>

      {/* Research gaps */}
      <Card>
        <CardHeader>
          <div className="flex gap-3">
            <SectionIcon icon={HelpCircle} />
            <div>
              <CardTitle>Research gaps</CardTitle>
              <CardDescription className="mt-0.5">What could not be found or verified. Treat these as open questions.</CardDescription>
            </div>
          </div>
          {mock && <Badge variant="warning">MOCK</Badge>}
        </CardHeader>
        <CardContent>
          {report.research_gaps.length ? (
            <ul className="space-y-2">
              {report.research_gaps.map((g, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-600"><Target className="mt-0.5 size-3.5 shrink-0 text-slate-400" />{g}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No gaps reported.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const LISTING_LABEL = {
  official_website: "Official website", directory_listing: "Directory listing", social_profile: "Social profile",
  marketplace: "Marketplace", news_or_article: "News / article", review_site: "Review site", other: "Other source",
};

/** Competitor name, type and the optional discovery fields (shown only when the report has them). */
function CompetitorHeading({ f }) {
  return (
    <div className="space-y-1.5">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">{f.name}</span>
        <Badge variant="neutral">{COMPETITOR_TYPE[f.type] ?? f.type}</Badge>
        {f.scope && <Badge variant="default" className="capitalize">{f.scope}</Badge>}
        {f.listing_type && (
          <Badge variant={f.listing_type === "directory_listing" || f.listing_type === "social_profile" ? "warning" : "neutral"}>
            {LISTING_LABEL[f.listing_type] ?? f.listing_type}
          </Badge>
        )}
      </span>
      {(f.location || f.category) && <p className="text-xs text-slate-500">{[f.category, f.location].filter(Boolean).join(" · ")}</p>}
      {f.services?.length > 0 && (
        <ul className="flex flex-wrap gap-1">{f.services.map((s, i) => <li key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{s}</li>)}</ul>
      )}
    </div>
  );
}

function VerificationBar({ counts, total }) {
  const colors = { verified: "bg-emerald-500", partially_verified: "bg-brand-400", unverified: "bg-slate-300", conflicting: "bg-amber-400" };
  return (
    <div className="mt-2 space-y-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-200">
        {total > 0 && counts.map(([k, n]) => n > 0 && <div key={k} className={colors[k]} style={{ width: `${(n / total) * 100}%` }} />)}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
        {counts.map(([k, n]) => (
          <li key={k} className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", colors[k])} />{VERIFICATION[k].label}: {n}</li>
        ))}
      </ul>
    </div>
  );
}

function LiveMeta({ meta }) {
  return (
    <dl className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-[11px]">
      <div><dt className="text-slate-400">Model</dt><dd className="text-slate-700">{meta.servedBy ?? meta.model}</dd></div>
      <div><dt className="text-slate-400">Web searches</dt><dd className="text-slate-700">{meta.searches}</dd></div>
      {meta.usage && (
        <div className="col-span-2"><dt className="text-slate-400">Tokens (input / output)</dt><dd className="text-slate-700">
          {(meta.usage.input_tokens + (meta.usage.cache_creation_input_tokens ?? 0) + (meta.usage.cache_read_input_tokens ?? 0)).toLocaleString()} / {meta.usage.output_tokens.toLocaleString()}
        </dd></div>
      )}
      {meta.estimatedCostUsd && <div><dt className="text-slate-400">Est. cost</dt><dd className="text-slate-700">${meta.estimatedCostUsd.total.toFixed(4)}</dd></div>}
      {meta.sourceCheck && <div><dt className="text-slate-400">Sources removed</dt><dd className="text-slate-700">{meta.sourceCheck.removedSources}</dd></div>}
    </dl>
  );
}

const SectionIcon = ({ icon: Icon }) => (
  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="size-4" /></span>
);

function Section({ icon, title, items, empty, mock, single, children }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex gap-3">
          <SectionIcon icon={icon} />
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-0.5">{items.length} finding{items.length === 1 ? "" : "s"}</CardDescription>
          </div>
        </div>
        {mock && <Badge variant="warning">MOCK</Badge>}
      </CardHeader>
      <CardContent>
        {items.length ? (
          <div className={cn("grid gap-3", !single && "lg:grid-cols-2")}>{items.map(children)}</div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}

function FindingCard({ f, heading }) {
  const [open, setOpen] = useState(false);
  const v = VERIFICATION[f.verification] ?? { label: f.verification, variant: "neutral" };
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">{heading}</div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={v.variant}>{v.label}</Badge>
          <Badge variant={CONFIDENCE[f.confidence] ?? "neutral"} className="capitalize">{f.confidence} confidence</Badge>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-700">{f.claim}</p>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        Evidence & {f.sources.length} source{f.sources.length === 1 ? "" : "s"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-md bg-slate-50 p-3">
          <p className="text-xs leading-relaxed text-slate-600">{f.evidence}</p>
          <ul className="space-y-1">
            {f.sources.map((s, i) => {
              const href = safeHref(s.url);
              return (
                <li key={i} className="text-xs">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                      <ExternalLink className="size-3" /> {s.title || href}
                    </a>
                  ) : (
                    <span className="text-slate-500">{s.title} (invalid link)</span>
                  )}
                  {href && <span className="ml-1 text-slate-400">{new URL(href).hostname}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
