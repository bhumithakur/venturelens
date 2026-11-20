import { config, resolveResearchMode } from "../../config/env.js";
import { AppError } from "../../errors.js";
import * as claude from "../../services/claude.service.js";
import { PLAN_TOOL_NAME, normalizePlan, parseInput, planSchema, validatePlan } from "./growth-plan.schema.js";
import { SYSTEM_PROMPT, buildUserMessage } from "./growth-plan.instructions.js";
import { buildMockPlan } from "./growth-plan.mock.js";

const NAME = "growth-plan";

/** Feedback for the single correction round, or null if the plan is acceptable. */
export function reviewPlan(raw) {
  const check = validatePlan(normalizePlan(structuredClone(raw)));
  if (check.valid) return null;
  return `The plan was not accepted:\n- ${check.errors.slice(0, 15).map((e) => `Schema: ${e.path} ${e.message}`).join("\n- ")}`;
}

/**
 * Synthesis step (no web search): turns the outputs of the existing agents
 * (Market Research incl. customer segments/competitors, Financial Analyst) into
 * marketing recommendations and a prioritized action plan.
 */
export const growthPlanAgent = {
  name: NAME,
  description: "Synthesizes market research, customer insights and financials into marketing recommendations and a prioritized action plan.",

  async run(rawInput, { signal, mode: requestedMode } = {}) {
    const input = parseInput(rawInput);
    let mode;
    try {
      mode = resolveResearchMode(config, requestedMode);
    } catch (e) {
      throw new AppError(e.status, e.code, e.message);
    }

    const startedAt = Date.now();
    let plan;
    let meta;
    if (mode === "mock") {
      plan = buildMockPlan(input);
      meta = { mode: "mock" };
    } else {
      const result = await claude.generate({
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(input) }],
        tools: [],
        outputSchema: {
          name: PLAN_TOOL_NAME,
          description: "Submit the marketing recommendations and prioritized action plan. Call exactly once.",
          schema: planSchema,
        },
        reviewOutput: reviewPlan,
        signal,
      });
      plan = result.output;
      meta = result.meta;
    }

    plan = normalizePlan(structuredClone(plan));
    const check = validatePlan(plan);
    if (!check.valid) {
      throw new AppError(502, "INVALID_AGENT_OUTPUT", "Agent produced a plan that failed schema validation", { errors: check.errors, meta });
    }

    return {
      agent: NAME,
      mock: mode === "mock",
      generatedAt: new Date().toISOString(),
      inputsUsed: { research: input.research ? (input.research.mock ? "mock" : "live") : "missing", financials: input.financials ? "saved" : "missing" },
      plan,
      meta: { ...meta, durationMs: Date.now() - startedAt },
    };
  },
};
