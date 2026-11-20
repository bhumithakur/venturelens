import { CheckCircle2, Compass, Info, ListChecks, Megaphone, Radio, Rocket, Target, UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MockBanner } from "@/components/research/ReportView";
import { BASIS, PRIORITY, TIMELINE } from "@/lib/growthPlan";
import { formatDate } from "@/lib/utils";

/*
 * Renders the backend response of POST /api/agents/growth-plan/run:
 *   { agent, mock, generatedAt, inputsUsed, plan, meta }
 * plan: summary, marketing { positioning, channels, acquisition, campaigns }, action_plan[], data_gaps[]
 */

const INPUT_LABEL = { live: "Live", mock: "Mock", missing: "Not run" };

const SectionIcon = ({ icon: Icon }) => (
  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="size-4" /></span>
);

function SectionHeader({ icon, title, description }) {
  return (
    <CardHeader>
      <div className="flex gap-3">
        <SectionIcon icon={icon} />
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
        </div>
      </div>
    </CardHeader>
  );
}

const Why = ({ children }) => (
  <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
    <span className="font-medium text-slate-700">Why: </span>{children}
  </p>
);

export function ActionPlan({ tasks }) {
  return (
    <Card>
      <SectionHeader icon={ListChecks} title="Prioritized action plan" description={`${tasks.length} tasks, in the order to tackle them`} />
      <CardContent>
        <ol className="space-y-3">
          {tasks.map((t, i) => {
            const p = PRIORITY[t.priority] ?? { label: t.priority, variant: "neutral" };
            return (
              <li key={i} className="flex gap-4 rounded-lg border border-slate-200 p-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={p.variant}>{p.label} priority</Badge>
                      <Badge variant="default">{TIMELINE[t.timeline] ?? t.timeline}</Badge>
                    </div>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-700">{t.description}</p>
                  <p className="mt-2 flex gap-1.5 text-xs text-emerald-700">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /><span><span className="font-medium">Expected outcome: </span>{t.expected_outcome}</span>
                  </p>
                  {t.based_on?.length > 0 && (
                    <p className="mt-2 text-[11px] text-slate-400">Based on: {t.based_on.map((b) => BASIS[b] ?? b).join(" · ")}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export function MarketingRecommendations({ marketing }) {
  const { positioning, channels, acquisition, campaigns } = marketing;
  return (
    <>
      <Card>
        <SectionHeader icon={Compass} title="Brand positioning" />
        <CardContent>
          <p className="rounded-lg border border-brand-100 bg-brand-50/60 p-4 text-sm font-medium leading-relaxed text-slate-900">{positioning.statement}</p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {positioning.differentiators.map((d, i) => <li key={i}><Badge variant="neutral">{d}</Badge></li>)}
          </ul>
          <Why>{positioning.rationale}</Why>
        </CardContent>
      </Card>

      <Card>
        <SectionHeader icon={Radio} title="Recommended marketing channels" description={`${channels.length} channels`} />
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {channels.map((c, i) => {
            const p = PRIORITY[c.priority] ?? { label: c.priority, variant: "neutral" };
            return (
              <div key={i} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{c.channel}</p>
                  <Badge variant={p.variant}>{p.label} priority</Badge>
                </div>
                <p className="mt-1.5 text-sm text-slate-700">{c.tactics}</p>
                <Why>{c.rationale}</Why>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <SectionHeader icon={UserPlus} title="Customer acquisition strategies" />
          <CardContent className="space-y-3">
            {acquisition.map((a, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">{a.strategy}</p>
                <p className="mt-1.5 text-sm text-slate-700">{a.description}</p>
                <Why>{a.rationale}</Why>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <SectionHeader icon={Megaphone} title="Campaign & content ideas" />
          <CardContent className="space-y-3">
            {campaigns.map((c, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{c.title}</p>
                  <Badge variant="neutral">{c.format}</Badge>
                </div>
                <p className="mt-1.5 text-sm text-slate-700">{c.description}</p>
                <Why>{c.rationale}</Why>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function GrowthPlanView({ result }) {
  const { plan, mock, inputsUsed, meta } = result;
  return (
    <div className="space-y-6">
      {mock && <MockBanner />}
      <Card>
        <CardHeader>
          <div className="flex gap-3">
            <SectionIcon icon={Rocket} />
            <div>
              <CardTitle className="text-base">Growth plan</CardTitle>
              <CardDescription>Generated {formatDate(result.generatedAt)}{meta?.mode ? ` · ${meta.mode} mode` : ""}</CardDescription>
            </div>
          </div>
          {mock ? <Badge variant="warning">MOCK DATA</Badge> : <Badge variant="success">AI synthesis</Badge>}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-700">{plan.summary}</p>
          {inputsUsed && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              Built from:
              <Badge variant={inputsUsed.research === "live" ? "success" : "warning"}>Market research: {INPUT_LABEL[inputsUsed.research]}</Badge>
              <Badge variant={inputsUsed.financials === "saved" ? "success" : "warning"}>Financials: {inputsUsed.financials === "saved" ? "Saved model" : "Not saved"}</Badge>
            </p>
          )}
          {plan.data_gaps?.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-900"><Info className="size-3.5" /> Limits of this plan</p>
              <ul className="mt-1.5 space-y-1">
                {plan.data_gaps.map((g, i) => <li key={i} className="flex gap-2 text-xs text-amber-800"><Target className="mt-0.5 size-3 shrink-0" />{g}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      <ActionPlan tasks={plan.action_plan} />
      <MarketingRecommendations marketing={plan.marketing} />
    </div>
  );
}
