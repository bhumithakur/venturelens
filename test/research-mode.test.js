import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadConfig, assertConfig, resolveResearchMode } from "../src/config/env.js";
import { validateReport } from "../src/agents/market-research/market-research.schema.js";
import { buildMockReport } from "../src/agents/market-research/market-research.mock.js";
import { enforceSupportedSources, buildAllowlist } from "../src/agents/market-research/market-research.sources.js";
import { SYSTEM_PROMPT } from "../src/agents/market-research/market-research.instructions.js";

const KEY = "test-app-key-0123456789abcdef0123456789";

test("mode resolution: mock by default, live only when enabled, never a silent switch", () => {
  const mockDefault = loadConfig({});
  assert.equal(mockDefault.liveResearchEnabled, false);
  assert.equal(resolveResearchMode(mockDefault, undefined), "mock");
  assert.equal(resolveResearchMode(mockDefault, "mock"), "mock");
  assert.throws(() => resolveResearchMode(mockDefault, "live"), (e) => e.status === 403 && e.code === "LIVE_RESEARCH_DISABLED");
  assert.throws(() => resolveResearchMode(mockDefault, "LIVE"), (e) => e.status === 400 && e.code === "INVALID_MODE");

  const optIn = loadConfig({ LIVE_RESEARCH_ENABLED: "true" });
  assert.equal(optIn.mockMode, true, "MOCK_MODE stays the default");
  assert.equal(resolveResearchMode(optIn, undefined), "mock", "no mode -> still mock");
  assert.equal(resolveResearchMode(optIn, "live"), "live", "explicit live allowed");

  const liveDefault = loadConfig({ MOCK_MODE: "false" });
  assert.equal(liveDefault.liveResearchEnabled, true);
  assert.equal(resolveResearchMode(liveDefault, undefined), "live");
  assert.equal(resolveResearchMode(liveDefault, "mock"), "mock");
});

test("startup refuses live research without an Anthropic key", () => {
  assert.throws(() => assertConfig(loadConfig({ APP_API_KEY: KEY, LIVE_RESEARCH_ENABLED: "true" })), /ANTHROPIC_API_KEY/);
  assert.throws(() => assertConfig(loadConfig({ APP_API_KEY: KEY, MOCK_MODE: "false" })), /ANTHROPIC_API_KEY/);
  assert.doesNotThrow(() => assertConfig(loadConfig({ APP_API_KEY: KEY })));
});

test("live safety defaults: no SDK retries, hourly live cap, low-cost search limits unchanged", () => {
  const c = loadConfig({});
  assert.equal(c.claude.maxRetries, 0);
  assert.deepEqual({ ...c.liveRateLimit }, { windowMs: 3_600_000, max: 5 });
  assert.equal(c.webSearch.maxUses, 2);
  assert.equal(c.webSearch.maxTotal, 4);
  assert.equal(c.claude.maxTokens, 16000);
});

test("competitor schema: new fields optional (old reports still valid), enums enforced", () => {
  const old = buildMockReport({ business: "x shop" });
  for (const k of ["scope", "location", "category", "services", "listing_type"]) delete old.competitors[0][k];
  assert.ok(validateReport(old).valid, "competitor without new fields is valid");

  const full = buildMockReport({ business: "x shop" });
  assert.ok(validateReport(full).valid);
  const bad = buildMockReport({ business: "x shop" });
  bad.competitors[0].listing_type = "rumour";
  assert.equal(validateReport(bad).valid, false);
  const tooMany = buildMockReport({ business: "x shop" });
  tooMany.competitors[0].services = Array(9).fill("s");
  assert.equal(validateReport(tooMany).valid, false);
});

test("a competitor known only from a directory listing or social profile cannot stay verified", () => {
  for (const listing_type of ["directory_listing", "social_profile"]) {
    const r = buildMockReport({ business: "x shop" });
    Object.assign(r.competitors[0], { listing_type, verification: "verified" });
    const allow = buildAllowlist(r.competitors.flatMap((c) => c.sources));
    const { report, summary } = enforceSupportedSources(r, allow);
    assert.equal(report.competitors[0].verification, "partially_verified");
    assert.equal(summary.listingDowngrades, 1);
  }
  const site = buildMockReport({ business: "x shop" });
  Object.assign(site.competitors[0], { listing_type: "official_website", verification: "verified" });
  const { report } = enforceSupportedSources(site, buildAllowlist(site.competitors[0].sources));
  assert.equal(report.competitors[0].verification, "verified", "official website may stay verified");
});

test("prompt: local-first competitor discovery, no invention, gaps reported", () => {
  assert.match(SYSTEM_PROMPT, /LOCAL competitors first/);
  assert.match(SYSTEM_PROMPT, /national chains and online/);
  assert.match(SYSTEM_PROMPT, /never "verified"/);
  assert.match(SYSTEM_PROMPT, /Never invent competitors/);
  assert.match(SYSTEM_PROMPT, /research_gaps/);
});

test("no business-specific competitor leads are hardcoded in the agent", () => {
  const dir = new URL("../src/agents/market-research/", import.meta.url);
  const code = ["market-research.instructions.js", "market-research.schema.js", "market-research.sources.js", "market-research.agent.js"]
    .map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n").toLowerCase();
  for (const name of ["silvertree", "rivi trends", "ira rentel", "r royal", "khushbu", "aligarh", "rang rivaaz"]) {
    assert.ok(!code.includes(name), `${name} must not be hardcoded`);
  }
});
