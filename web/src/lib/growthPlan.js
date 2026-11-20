/**
 * Builds the growth-plan agent input from the outputs of the existing agents:
 * the Market Research report (segments, competitors, trends, opportunities, risks)
 * and the saved Financial Analyst model. Either may be missing.
 * Limits mirror the backend growth-plan input schema.
 */
import { TEMPLATES, calculate, deriveEconomics, overallConfidence, validateModel } from "./finance.js";

const clip = (s, n) => {
  const t = String(s ?? "").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const items = (arr, max, fmt) => (Array.isArray(arr) ? arr.slice(0, max).map((f) => clip(fmt(f), 400)).filter(Boolean) : []);
const finite = (n) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);

export function researchSummary(result) {
  const r = result?.report;
  if (!r) return undefined;
  return {
    mock: Boolean(result.mock),
    summary: clip(r.summary, 2000),
    marketSize: items(r.market_size, 6, (f) => `${f.metric}: ${f.value} (${f.as_of}, ${f.confidence} confidence)`),
    segments: items(r.target_segments, 6, (f) => `${f.segment}: ${f.claim}`),
    competitors: items(r.competitors, 10, (f) =>
      `${f.name} (${[f.type, f.scope, f.location].filter(Boolean).join(", ")}): ${f.claim}${f.services?.length ? ` Services: ${f.services.join(", ")}` : ""}`),
    trends: items(r.trends, 8, (f) => `${f.direction}: ${f.claim}`),
    opportunities: items(r.opportunities, 6, (f) => `${f.title}: ${f.claim}`),
    risks: items(r.risks, 8, (f) => `${f.severity} severity: ${f.claim}`),
    gaps: items(r.research_gaps, 10, (g) => g),
  };
}

export function financialSummary(model) {
  if (!model || Object.keys(validateModel(model)).length) return undefined;
  const tpl = TEMPLATES[model.template];
  const e = deriveEconomics(model);
  const r = calculate(e);
  const out = {
    businessModel: clip(tpl.label, 60),
    currency: model.currency,
    volumeUnit: clip(tpl.volumeUnit, 40),
    unitsPerMonth: finite(r.units),
    pricePerUnit: finite(e.price),
    monthlyRevenue: finite(r.monthlyRevenue),
    monthlyOperatingProfit: finite(r.monthlyOperatingProfit),
    contributionPerUnit: finite(r.contributionPerUnit),
    breakEvenUnits: finite(r.breakEvenUnits),
    paybackMonths: finite(r.paybackMonths),
    confidence: overallConfidence(model),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== ""));
}

export function toGrowthPlanInput(business, researchResult, financialModel) {
  const opt = (k, v, n) => (v && String(v).trim() ? { [k]: clip(v, n) } : {});
  const research = researchSummary(researchResult);
  const financials = financialSummary(financialModel);
  return {
    business: clip(business.description, 500),
    ...opt("name", business.name, 80),
    ...opt("industry", business.industry, 200),
    ...opt("region", business.location, 200),
    ...opt("stage", business.stage, 40),
    ...opt("targetCustomers", business.targetCustomers, 300),
    ...(research ? { research } : {}),
    ...(financials ? { financials } : {}),
  };
}

export const PRIORITY = { high: { label: "High", variant: "danger" }, medium: { label: "Medium", variant: "warning" }, low: { label: "Low", variant: "neutral" } };
export const TIMELINE = { immediate: "Immediate", short_term: "Short-term", long_term: "Long-term" };
export const BASIS = {
  market_research: "Market research", customer_insights: "Customer insights", financials: "Financials",
  strategy: "Strategy", business_profile: "Business profile",
};
