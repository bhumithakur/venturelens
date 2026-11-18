/**
 * ONE controlled live research run. THIS SPENDS API CREDITS.
 * Never run by `npm test`. Run only after explicit approval:
 *
 *   LIVE_SMOKE_CONFIRM=yes MOCK_MODE=false node scripts/live-smoke.js
 *
 * Needs ANTHROPIC_API_KEY and APP_API_KEY in .env. Budget is forced low below
 * (expected cost roughly $0.05-0.20). Prints metadata only; the report is
 * written to live-smoke-output.json (git-ignored).
 */
if (process.env.LIVE_SMOKE_CONFIRM !== "yes" || process.env.MOCK_MODE !== "false") {
  console.error("Refusing to run: set LIVE_SMOKE_CONFIRM=yes and MOCK_MODE=false explicitly.");
  process.exit(1);
}

// Tight budget for the smoke run, applied before config is loaded.
Object.assign(process.env, {
  CLAUDE_EFFORT: "low",
  CLAUDE_MAX_TURNS: "3",
  CLAUDE_RUN_TIMEOUT_MS: "90000",
  WEB_SEARCH_MAX_USES: "2",
  WEB_SEARCH_MAX_TOTAL: "2",
  CLAUDE_REFUSAL_FALLBACK: "false",
  CLAUDE_MAX_RETRIES: "0", // no automatic SDK retries: at most the requests the run itself makes
});

const { writeFile } = await import("node:fs/promises");
const { config, assertConfig } = await import("../src/config/env.js");
assertConfig(config);
if (config.mockMode) {
  console.error("Config is still in mock mode; aborting.");
  process.exit(1);
}

const { marketResearchAgent } = await import("../src/agents/market-research/market-research.agent.js");

const started = Date.now();
try {
  const result = await marketResearchAgent.run({
    business: "Rang Rivaaz, a clothing rental business",
    industry: "Clothing rental",
    region: "Aligarh, India",
  });
  const { meta, report } = result;
  console.log(JSON.stringify({
    ok: true,
    servedBy: meta.servedBy,
    stopReasons: meta.stopReasons,
    turns: meta.turns,
    searches: meta.searches,
    searchErrors: meta.searchErrors,
    searchResultsSeen: meta.searchResultsSeen,
    usage: meta.usage,
    estimatedCostUsd: meta.estimatedCostUsd,
    sourceCheck: meta.sourceCheck,
    findings: Object.fromEntries(
      ["market_size", "trends", "competitors", "target_segments", "risks", "opportunities"].map((s) => [s, report[s].length])
    ),
    durationMs: Date.now() - started,
  }, null, 2));
  await writeFile("live-smoke-output.json", JSON.stringify(result, null, 2));
  console.log("Full result written to live-smoke-output.json");
} catch (err) {
  console.error(JSON.stringify({ ok: false, status: err.status, code: err.code, message: err.message, details: err.details }, null, 2));
  process.exit(1);
}
