import { createValidator } from "../../utils/validate.js";
import { ValidationError } from "../../errors.js";

/** Client tool Claude calls to submit the synthesis (live mode). */
export const PLAN_TOOL_NAME = "submit_growth_plan";

export const PRIORITIES = ["high", "medium", "low"];
export const TIMELINES = ["immediate", "short_term", "long_term"];
export const BASIS = ["market_research", "customer_insights", "financials", "strategy", "business_profile"];

// ---- Input -------------------------------------------------------------------
// Compact outputs of the existing agents. research and financials are optional:
// the plan degrades gracefully when either is missing.

const text = (max) => ({ type: "string", minLength: 1, maxLength: max });
const list = (maxItems, maxLen = 400) => ({ type: "array", maxItems, items: text(maxLen) });
const num = { type: "number" }; // unknown values are omitted, not null

export const inputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["business"],
  properties: {
    business: { type: "string", minLength: 3, maxLength: 500 },
    name: { type: "string", maxLength: 80 },
    industry: { type: "string", maxLength: 200 },
    region: { type: "string", maxLength: 200 },
    stage: { type: "string", maxLength: 40 },
    targetCustomers: { type: "string", maxLength: 300 },
    research: {
      type: "object",
      additionalProperties: false,
      properties: {
        mock: { type: "boolean" },
        summary: { type: "string", maxLength: 2000 },
        segments: list(6),
        competitors: list(10),
        trends: list(8),
        opportunities: list(6),
        risks: list(8),
        marketSize: list(6),
        gaps: list(10),
      },
    },
    financials: {
      type: "object",
      additionalProperties: false,
      properties: {
        businessModel: { type: "string", maxLength: 60 },
        currency: { type: "string", maxLength: 3 },
        volumeUnit: { type: "string", maxLength: 40 },
        unitsPerMonth: num,
        pricePerUnit: num,
        monthlyRevenue: num,
        monthlyOperatingProfit: num,
        contributionPerUnit: num,
        breakEvenUnits: num,
        paybackMonths: num,
        confidence: { type: "string", enum: PRIORITIES },
      },
    },
  },
};

const validateInput = createValidator(inputSchema);

export function parseInput(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Request body must be a JSON object", [{ path: "(root)", message: "expected an object" }]);
  }
  const cleaned = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = typeof value === "string" ? value.trim() : value;
    if ((v === "" || v === null) && key !== "business") continue;
    cleaned[key] = v;
  }
  const { valid, errors } = validateInput(cleaned);
  if (!valid) throw new ValidationError("Invalid input for growth-plan agent", errors);
  return cleaned;
}

// ---- Output ------------------------------------------------------------------

const rationale = { type: "string", minLength: 1, maxLength: 600, description: "Why this fits THIS business, citing the specific insight it is based on." };

export const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "marketing", "action_plan", "data_gaps"],
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 1200, description: "2-4 sentences: the core growth thesis for this business." },
    marketing: {
      type: "object",
      additionalProperties: false,
      required: ["positioning", "channels", "acquisition", "campaigns"],
      properties: {
        positioning: {
          type: "object",
          additionalProperties: false,
          required: ["statement", "differentiators", "rationale"],
          properties: {
            statement: { type: "string", minLength: 1, maxLength: 500, description: "One-sentence brand positioning statement." },
            differentiators: { type: "array", minItems: 1, maxItems: 5, items: text(200) },
            rationale,
          },
        },
        channels: {
          type: "array",
          minItems: 2,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["channel", "priority", "tactics", "rationale"],
            properties: { channel: text(120), priority: { type: "string", enum: PRIORITIES }, tactics: text(500), rationale },
          },
        },
        acquisition: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["strategy", "description", "rationale"],
            properties: { strategy: text(120), description: text(500), rationale },
          },
        },
        campaigns: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "format", "description", "rationale"],
            properties: { title: text(120), format: text(80), description: text(500), rationale },
          },
        },
      },
    },
    action_plan: {
      type: "array",
      minItems: 5,
      maxItems: 7,
      description: "Ordered by importance: the first task is what the entrepreneur should do first.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "priority", "timeline", "expected_outcome", "based_on"],
        properties: {
          title: text(120),
          description: text(600),
          priority: { type: "string", enum: PRIORITIES },
          timeline: { type: "string", enum: TIMELINES, description: "immediate = next 2 weeks; short_term = 1-3 months; long_term = 3-12 months." },
          expected_outcome: text(400),
          based_on: { type: "array", minItems: 1, maxItems: 4, uniqueItems: true, items: { type: "string", enum: BASIS } },
        },
      },
    },
    data_gaps: {
      type: "array",
      maxItems: 6,
      items: text(300),
      description: "Missing or mock inputs that limit this plan, and what to validate first.",
    },
  },
};

export const validatePlan = createValidator(planSchema);

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const TIMELINE_RANK = { immediate: 0, short_term: 1, long_term: 2 };

/** Normalizes enum casing and orders tasks by priority, then timeline (stable). */
export function normalizePlan(plan) {
  const lower = (v) => (typeof v === "string" ? v.toLowerCase().replace(/[\s-]+/g, "_") : v);
  for (const c of plan?.marketing?.channels ?? []) c.priority = lower(c.priority);
  if (Array.isArray(plan?.action_plan)) {
    for (const t of plan.action_plan) {
      t.priority = lower(t.priority);
      t.timeline = lower(t.timeline);
      if (Array.isArray(t.based_on)) t.based_on = t.based_on.map(lower);
    }
    plan.action_plan = plan.action_plan
      .map((t, i) => [t, i])
      .sort(([a, i], [b, j]) =>
        (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) ||
        (TIMELINE_RANK[a.timeline] ?? 3) - (TIMELINE_RANK[b.timeline] ?? 3) || i - j)
      .map(([t]) => t);
  }
  return plan;
}
