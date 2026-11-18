import { config, resolveResearchMode } from "../../config/env.js";
import { AppError } from "../../errors.js";
import { resolveTools } from "../../tools/index.js";
import * as claude from "../../services/claude.service.js";
import { parseInput } from "./market-research.input.js";
import { SYSTEM_PROMPT, buildUserMessage } from "./market-research.instructions.js";
import { REPORT_TOOL_NAME, reportSchema, validateReport } from "./market-research.schema.js";
import { buildMockReport } from "./market-research.mock.js";
import {
  buildAllowlist,
  enforceSupportedSources,
  findUnsupportedSources,
  normalizeEnumCase,
} from "./market-research.sources.js";

const NAME = "market-research";
const inFlight = new Set(); // live runs in progress, keyed by normalized input (per process)
const MAX_LISTED_PROBLEMS = 15;

/**
 * Feedback for the single correction round, or null if the report is acceptable.
 * Runs inside the Claude loop, before the report is accepted.
 */
export function reviewReport(rawReport, { searchResults }) {
  const report = normalizeEnumCase(structuredClone(rawReport));
  const problems = [];

  const check = validateReport(report);
  if (!check.valid) {
    // Shape problems first: source checks only run on a schema-valid report.
    for (const e of check.errors) problems.push(`Schema: ${e.path} ${e.message}`);
  } else {
    const unsupported = findUnsupportedSources(report, buildAllowlist(searchResults));
    for (const u of unsupported) {
      problems.push(
        `Source not found in your search results (${u.section}[${u.index}]): ${u.url}. ` +
          "Replace it with a URL from your search results, or move the claim to research_gaps."
      );
    }
  }

  if (problems.length === 0) return null;
  const listed = problems.slice(0, MAX_LISTED_PROBLEMS);
  if (problems.length > listed.length) listed.push(`...and ${problems.length - listed.length} more.`);
  return `The report was not accepted:\n- ${listed.join("\n- ")}`;
}

async function runLive(input, signal) {
  const { output, searchResults, meta } = await claude.generate({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input) }],
    tools: resolveTools(["web_search"], config),
    outputSchema: {
      name: REPORT_TOOL_NAME,
      description: "Submit the completed, fully sourced market research report. Call exactly once.",
      schema: reportSchema,
    },
    reviewOutput: reviewReport,
    signal,
  });

  // Final enforcement after the (at most one) correction round.
  const normalized = normalizeEnumCase(structuredClone(output));
  const schemaCheck = validateReport(normalized);
  if (!schemaCheck.valid) {
    throw new AppError(502, "INVALID_AGENT_OUTPUT", "Agent produced a report that failed schema validation", {
      errors: schemaCheck.errors,
      meta,
    });
  }

  const allowlist = buildAllowlist(searchResults);
  const { report, summary } = enforceSupportedSources(normalized, allowlist);
  return { report, meta: { ...meta, sourceCheck: { allowlistSize: allowlist.size, ...summary } } };
}

/** A plain-object agent: { name, description, run(input, options) }. */
export const marketResearchAgent = {
  name: NAME,
  description:
    "Researches a business's market (size, trends, competitors, segments, risks, opportunities) with cited, verified sources.",

  async run(rawInput, { signal, mode: requestedMode } = {}) {
    // 1. Validate input. Throws a 400 before anything else happens.
    const input = parseInput(rawInput);

    // 2. Decide the mode. An explicit live request on a server without live research fails;
    //    it is never served from mock data.
    let mode;
    try {
      mode = resolveResearchMode(config, requestedMode);
    } catch (e) {
      throw new AppError(e.status, e.code, e.message);
    }

    const startedAt = Date.now();
    let report;
    let meta;

    // 3. Mock mode never touches the Claude service. Live mode does.
    if (mode === "mock") {
      report = buildMockReport(input);
      meta = { mode: "mock" };
    } else {
      // Duplicate guard: the same live research cannot run twice at the same time.
      const key = JSON.stringify(input);
      if (inFlight.has(key)) {
        throw new AppError(409, "RESEARCH_IN_PROGRESS", "Live research for this business is already running");
      }
      inFlight.add(key);
      try {
        ({ report, meta } = await runLive(input, signal));
      } finally {
        inFlight.delete(key);
      }
    }

    // 4. Validate the output for both paths, so the response shape is always trustworthy.
    const check = validateReport(report);
    if (!check.valid) {
      throw new AppError(502, "INVALID_AGENT_OUTPUT", "Agent produced a report that failed schema validation", check.errors);
    }

    return {
      agent: NAME,
      mock: mode === "mock", // always the mode actually used
      generatedAt: new Date().toISOString(),
      input,
      report,
      meta: { ...meta, durationMs: Date.now() - startedAt },
    };
  },
};
