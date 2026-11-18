import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Calculator, Info, RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/field";
import { financials } from "@/lib/storage";
import {
  CURRENCIES, SOURCES, TEMPLATES, TEMPLATE_KEYS, calculate, calculateScenarios, createDefaultModel, cumulativeCash,
  deriveEconomics, formatMoney, overallConfidence, paybackMonthInSeries, switchTemplate, validateModel,
} from "@/lib/finance";
import { cn } from "@/lib/utils";

const COLORS = { conservative: "#94a3b8", realistic: "#4f46e5", optimistic: "#10b981" };
const CONF_VARIANT = { low: "warning", medium: "default", high: "success" };
const months = (n) => (n === null ? "No payback" : `${n.toFixed(1)} months`);
const toDrafts = (model) => Object.fromEntries(Object.entries(model.inputs).map(([k, i]) => [k, i.value === null ? "" : String(i.value)]));
const parse = (s) => (s.trim() === "" ? null : Number(s));

export function FinancialAnalyst({ business }) {
  const [model, setModel] = useState(() => financials.get(business.id) ?? createDefaultModel(business));
  const [drafts, setDrafts] = useState(() => toDrafts(model));
  const [lastValid, setLastValid] = useState(model);

  const tpl = TEMPLATES[model.template];
  const errors = validateModel(model);
  const valid = Object.keys(errors).length === 0;
  const shown = valid ? model : lastValid; // keep results visible while an input is invalid
  const fmt = (n) => formatMoney(n, shown.currency);

  function commit(next) {
    setModel(next);
    if (Object.keys(validateModel(next)).length === 0) {
      setLastValid(next);
      financials.save(business.id, next);
    }
  }
  function setInput(key, patch) {
    commit({ ...model, origin: "user", inputs: { ...model.inputs, [key]: { ...model.inputs[key], ...patch } } });
  }
  function onValue(key, raw) {
    setDrafts((d) => ({ ...d, [key]: raw }));
    setInput(key, { value: parse(raw) });
  }
  function onTemplate(key) {
    const next = switchTemplate(model, key);
    setDrafts(toDrafts(next));
    commit(next);
  }
  function reset() {
    financials.clear(business.id);
    const next = createDefaultModel(business);
    setModel(next);
    setLastValid(next);
    setDrafts(toDrafts(next));
  }

  const economics = useMemo(() => deriveEconomics(shown), [shown]);
  const real = useMemo(() => calculate(economics), [economics]);
  const scenarios = useMemo(() => calculateScenarios(economics), [economics]);
  const cash = useMemo(() => {
    const series = scenarios.map((s) => cumulativeCash(economics.initialInvestment, s.results.monthlyOperatingProfit, 24));
    return series[0].map((_, i) => ({ month: i, ...Object.fromEntries(scenarios.map((s, j) => [s.key, series[j][i].cash])) }));
  }, [scenarios, economics.initialInvestment]);
  const paybackMonth = paybackMonthInSeries(cumulativeCash(economics.initialInvestment, real.monthlyOperatingProfit, 24));
  const confidence = overallConfidence(shown);
  const unit = TEMPLATES[shown.template].volumeUnit;
  const sourceCounts = Object.keys(SOURCES).map((s) => [s, Object.values(shown.inputs).filter((i) => i.value !== null && i.source === s).length]);

  return (
    <div className="space-y-6">
      <div role="note" className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
          <p>
            {model.origin === "demo" ? (
              <><Badge variant="warning" className="mr-1.5">Illustrative assumptions</Badge>Demo figures for Rang Rivaaz. These are examples, not research findings.</>
            ) : model.origin === "template" ? (
              <><Badge variant="warning" className="mr-1.5">Template assumptions</Badge>Placeholder figures for a typical {tpl.label.toLowerCase()} business. Replace them with your own.</>
            ) : (
              <><Badge variant="neutral" className="mr-1.5">Your inputs</Badge>Results use the values and sources you entered.</>
            )}{" "}
            Deterministic calculations in your browser; no AI is used.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Badge variant={CONF_VARIANT[confidence]} className="capitalize">{confidence} confidence</Badge>
          <p className="mt-1 text-[11px] text-slate-400">{sourceCounts.map(([s, n]) => `${SOURCES[s].label}: ${n}`).join(" · ")}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Model & assumptions</CardTitle>
              <CardDescription>Base case. Saved for this business in this browser.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={reset} title="Reset to defaults"><RotateCcw /> Reset</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField id="fin-template" label="Business model" required error={errors.template}>
                <Select id="fin-template" value={model.template} onChange={(e) => onTemplate(e.target.value)}>
                  {TEMPLATE_KEYS.map((k) => <option key={k} value={k}>{TEMPLATES[k].label}</option>)}
                </Select>
              </FormField>
              <FormField id="fin-currency" label="Currency" required error={errors.currency}>
                <Select id="fin-currency" value={model.currency} onChange={(e) => commit({ ...model, currency: e.target.value })}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </FormField>
            </div>
            <p className="text-[11px] text-slate-400">Changing the business model resets inputs to that model's template assumptions.</p>

            {tpl.inputs.map((f) => {
              const input = model.inputs[f.key];
              const unitLabel = f.kind === "money" ? model.currency : f.kind === "percent" ? "%" : f.kind === "count" ? "number" : "";
              return (
                <div key={f.key} className="space-y-1.5 rounded-lg border border-slate-100 p-3">
                  <FormField id={`fin-${f.key}`} label={`${f.label} (${unitLabel})`} required={!f.optional} description={f.help} error={errors[f.key]}>
                    <Input id={`fin-${f.key}`} type="number" inputMode="decimal" min="0" step={f.kind === "count" ? "1" : "any"}
                      value={drafts[f.key] ?? ""} invalid={Boolean(errors[f.key])} onChange={(e) => onValue(f.key, e.target.value)} />
                  </FormField>
                  <div className="flex gap-2">
                    <Select aria-label={`${f.label} data source`} className="h-8 w-40 text-xs" value={input.source}
                      onChange={(e) => setInput(f.key, { source: e.target.value })}>
                      {Object.entries(SOURCES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                    </Select>
                    {input.source !== "assumption" && (
                      <Input aria-label={`${f.label} source note`} className="h-8 text-xs" value={input.note}
                        placeholder={input.source === "benchmark" ? "Research source (required)" : "e.g. last 3 months' average"}
                        onChange={(e) => setInput(f.key, { note: e.target.value })} />
                    )}
                  </div>
                </div>
              );
            })}
            {!valid && <p className="text-xs text-amber-700">Showing results for the last valid inputs.</p>}
          </CardContent>
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi label="Monthly revenue" value={fmt(real.monthlyRevenue)} />
            <Kpi label={`Contribution per ${singular(unit)}`} value={fmt(real.contributionPerUnit)} tone={real.contributionPerUnit <= 0 && "bad"} />
            <Kpi label="Monthly operating profit" value={fmt(real.monthlyOperatingProfit)} tone={real.monthlyOperatingProfit < 0 ? "bad" : "good"} />
            <Kpi label={`Break-even ${unit} / month`} value={real.breakEvenUnits ?? "Not achievable"} hint={`vs ${real.units} planned`} />
            <Kpi label="Payback period" value={months(real.paybackMonths)} hint="Simplified estimate" />
            <Kpi label="Cash positive by" value={paybackMonth === null ? "Not within 24 months" : `Month ${paybackMonth}`} hint="Cumulative cash ≥ 0" />
          </div>

          {(real.capacity !== null || economics.notes.length > 0) && (
            <Card>
              <CardContent className="space-y-2 p-4 text-sm">
                {real.capacity !== null && (
                  <p className={cn("flex items-center gap-2", real.capacityConstrained ? "text-amber-800" : "text-slate-600")}>
                    {real.capacityConstrained && <AlertTriangle className="size-4 shrink-0" />}
                    Capacity: {Math.round(real.capacity)} {unit}/month · utilisation {Math.round(real.capacityUtilisation * 100)}%
                    {real.capacityConstrained && ` · demand (${Math.round(real.demand)}) exceeds capacity, so volume is capped`}
                  </p>
                )}
                {economics.notes.map((n) => <p key={n} className="text-slate-600">{n}</p>)}
              </CardContent>
            </Card>
          )}

          <ScenarioTable scenarios={scenarios} fmt={fmt} unit={unit} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Monthly economics by scenario</CardTitle><CardDescription>Revenue, costs and operating profit ({shown.currency})</CardDescription></div></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scenarios.map((s) => ({ name: s.label, Revenue: s.results.monthlyRevenue, "Variable costs": s.results.monthlyVariableCosts, "Fixed costs": s.results.monthlyFixedCosts, "Operating profit": s.results.monthlyOperatingProfit }))} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={0} stroke="#cbd5e1" />
                  <Bar dataKey="Revenue" fill="#4f46e5" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Variable costs" fill="#a5b4fc" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Fixed costs" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Operating profit" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Cumulative cash, 24 months</CardTitle><CardDescription>Month 0 = −initial investment, then + monthly operating profit</CardDescription></div></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cash} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => fmt(v)} labelFormatter={(m) => `Month ${m}`} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                  {scenarios.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[s.key]} strokeWidth={s.key === "realistic" ? 2.5 : 1.5} dot={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Formulas model={shown} e={economics} r={real} fmt={fmt} unit={unit} />
    </div>
  );
}

const SINGULAR = { orders: "order", subscribers: "subscriber", covers: "cover", rentals: "rental", "billable hours": "billable hour", units: "unit", "units sold": "unit" };
const singular = (u) => SINGULAR[u] ?? u;
const compact = (v) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(v);

function Kpi({ label, value, hint, tone }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className={cn("mt-1 text-xl font-semibold tracking-tight text-slate-900", tone === "bad" && "text-rose-600", tone === "good" && "text-emerald-700")}>{value}</p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ScenarioTable({ scenarios, fmt, unit }) {
  const rows = [
    [`Monthly ${unit}`, (s) => s.results.units],
    ["Price per unit", (s) => fmt(s.economics.price)],
    ["Variable cost per unit", (s) => fmt(s.economics.variableCostPerUnit)],
    ["Monthly fixed costs", (s) => fmt(s.economics.fixedCosts)],
    ["Monthly revenue", (s) => fmt(s.results.monthlyRevenue)],
    ["Contribution per unit", (s) => fmt(s.results.contributionPerUnit)],
    ["Monthly operating profit", (s) => fmt(s.results.monthlyOperatingProfit)],
    [`Break-even ${unit}`, (s) => s.results.breakEvenUnits ?? "Not achievable"],
    ["Payback (simplified)", (s) => months(s.results.paybackMonths)],
  ];
  const mult = (s) => `volume ×${s.m.volume}, price ×${s.m.price}, variable cost ×${s.m.variableCost}, fixed ×${s.m.fixed}`;
  return (
    <Card>
      <CardHeader><div><CardTitle>Scenarios</CardTitle><CardDescription>Multipliers on the base case; volumes rounded to whole numbers and capped by capacity</CardDescription></div></CardHeader>
      <CardContent className="overflow-x-auto px-0 pb-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/60 text-left text-xs text-slate-500">
              <th className="px-5 py-2 font-medium">Metric</th>
              {scenarios.map((s) => <th key={s.key} className="px-5 py-2 text-right font-medium" title={mult(s)}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(([label, get]) => (
              <tr key={label}>
                <td className="px-5 py-2 text-slate-600">{label}</td>
                {scenarios.map((s) => <td key={s.key} className={cn("px-5 py-2 text-right tabular-nums text-slate-800", s.key === "realistic" && "font-medium")}>{get(s)}</td>)}
              </tr>
            ))}
            <tr><td colSpan={4} className="px-5 pt-3 text-[11px] text-slate-400">{scenarios.filter((s) => s.key !== "realistic").map((s) => `${s.label}: ${mult(s)}`).join(" · ")}</td></tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Formulas({ model, e, r, fmt, unit }) {
  const ex = TEMPLATES[model.template].explain;
  const items = [
    [`Monthly ${unit}`, ex.volume + (ex.capacity ? `, capped at capacity (${ex.capacity})` : "") + ", rounded", `${r.units}${r.capacityConstrained ? " (capacity-capped)" : ""}`],
    ["Variable cost per unit", ex.variableCost, fmt(e.variableCostPerUnit)],
    ["Monthly revenue", "price × units", `${fmt(e.price)} × ${r.units} = ${fmt(r.monthlyRevenue)}`],
    ["Contribution per unit", "price − variable cost per unit", `${fmt(e.price)} − ${fmt(e.variableCostPerUnit)} = ${fmt(r.contributionPerUnit)}`],
    ["Monthly operating profit", "contribution × units − fixed costs", `${fmt(r.contributionPerUnit)} × ${r.units} − ${fmt(e.fixedCosts)} = ${fmt(r.monthlyOperatingProfit)}`],
    [`Break-even ${unit}`, "⌈fixed costs ÷ contribution⌉ (only if contribution > 0)", r.breakEvenUnits === null ? "Not achievable: each unit does not cover its variable cost" : `⌈${fmt(e.fixedCosts)} ÷ ${fmt(r.contributionPerUnit)}⌉ = ${r.breakEvenUnits}`],
    ["Payback period (simplified)", "initial investment ÷ monthly operating profit (only if profit > 0)", r.paybackMonths === null ? "No payback: operating profit is not positive" : `${fmt(e.initialInvestment)} ÷ ${fmt(r.monthlyOperatingProfit)} = ${months(r.paybackMonths)}`],
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Calculator className="size-4" /></span>
          <div>
            <CardTitle>How it's calculated</CardTitle>
            <CardDescription className="mt-0.5">{TEMPLATES[model.template].label} model, realistic scenario, with your current values.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-slate-100 text-sm">
          {items.map(([name, formula, applied]) => (
            <div key={name} className="grid gap-1 py-2.5 md:grid-cols-3">
              <dt className="font-medium text-slate-800">{name}</dt>
              <dd className="text-slate-500"><code className="text-xs">{formula}</code></dd>
              <dd className="tabular-nums text-slate-700">{applied}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          Steady-state monthly estimate. The payback period is simplified: it ignores taxes, financing, seasonality, ramp-up,
          inventory replacement and the time value of money. Confidence reflects the data sources you selected for the inputs.
        </p>
      </CardContent>
    </Card>
  );
}
