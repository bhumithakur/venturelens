import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUrl,
  buildAllowlist,
  findUnsupportedSources,
  enforceSupportedSources,
  normalizeEnumCase,
} from "../src/agents/market-research/market-research.sources.js";
import { validateReport } from "../src/agents/market-research/market-research.schema.js";
import { buildMockReport } from "../src/agents/market-research/market-research.mock.js";

const report = () => buildMockReport({ business: "candle shop" });
const allUrls = (r) => ["market_size", "trends", "competitors", "target_segments", "risks", "opportunities"]
  .flatMap((s) => r[s].flatMap((f) => f.sources.map((x) => x.url)));

test("normalizeUrl ignores case of host, www, fragment, default port and trailing slash", () => {
  const n = normalizeUrl("https://example.com/a/b");
  for (const v of ["HTTPS://WWW.Example.com/a/b/", "https://example.com:443/a/b#frag", "https://example.com/a/b//"]) {
    assert.equal(normalizeUrl(v), n, v);
  }
  assert.notEqual(normalizeUrl("https://example.com/a/b?x=1"), n, "query string matters");
  assert.notEqual(normalizeUrl("https://example.com/A/b"), n, "path is case-sensitive");
  assert.equal(normalizeUrl("ftp://example.com"), null);
  assert.equal(normalizeUrl("not a url"), null);
});

test("all sources found -> nothing unsupported, report unchanged", () => {
  const r = report();
  const allow = buildAllowlist(allUrls(r).map((url) => ({ url })));
  assert.deepEqual(findUnsupportedSources(r, allow), []);
  const { report: out, summary } = enforceSupportedSources(r, allow);
  assert.deepEqual(out, r);
  assert.deepEqual(summary, { removedSources: 0, droppedFindings: 0, downgradedFindings: 0, listingDowngrades: 0 });
});

test("unsupported sources are removed; verified findings that lost a source are downgraded", () => {
  const r = report();
  r.market_size[0].verification = "verified";
  r.market_size[0].sources.push({ url: "https://invented.example/page", title: "Invented" });
  const allow = buildAllowlist(allUrls(report()).map((url) => ({ url })));

  assert.deepEqual(findUnsupportedSources(r, allow), [{ section: "market_size", index: 0, url: "https://invented.example/page" }]);
  const { report: out, summary } = enforceSupportedSources(r, allow);
  assert.equal(out.market_size[0].sources.length, 1);
  assert.equal(out.market_size[0].verification, "partially_verified");
  assert.deepEqual(summary, { removedSources: 1, droppedFindings: 0, downgradedFindings: 1, listingDowngrades: 0 });
  assert.ok(validateReport(out).valid);
});

test("a finding with no valid sources is dropped and recorded in research_gaps", () => {
  const r = report();
  const claim = r.trends[0].claim;
  r.trends[0].sources = [{ url: "https://invented.example/x", title: "x" }];
  const allow = buildAllowlist(allUrls(report()).map((url) => ({ url })));
  const before = r.trends.length;

  const { report: out, summary } = enforceSupportedSources(r, allow);
  assert.equal(out.trends.length, before - 1);
  assert.equal(summary.droppedFindings, 1);
  assert.ok(out.research_gaps.some((g) => g.includes(claim.slice(0, 50)) && g.includes("trends")));
  assert.ok(validateReport(out).valid);
});

test("research_gaps never exceeds the schema maximum", () => {
  const r = report();
  r.research_gaps = Array.from({ length: 9 }, (_, i) => `gap ${i}`);
  const { report: out } = enforceSupportedSources(r, new Set()); // nothing supported: every finding dropped
  assert.equal(out.research_gaps.length, 10);
  assert.match(out.research_gaps.at(-1), /further gap/);
  assert.ok(validateReport(out).valid);
});

test("enforcement never upgrades verification or confidence", () => {
  const r = report();
  for (const s of ["market_size", "trends", "competitors", "target_segments", "risks", "opportunities"]) {
    for (const f of r[s]) { f.verification = "unverified"; f.confidence = "low"; }
  }
  const allow = buildAllowlist(allUrls(r).map((url) => ({ url })));
  const { report: out } = enforceSupportedSources(r, allow);
  for (const s of ["market_size", "trends", "competitors", "target_segments", "risks", "opportunities"]) {
    for (const f of out[s]) { assert.equal(f.verification, "unverified"); assert.equal(f.confidence, "low"); }
  }
});

test("enum values that differ only in case are normalized", () => {
  const r = report();
  r.market_size[0].verification = "Verified";
  r.trends[0].direction = "Growing";
  r.overall_confidence.level = "MEDIUM";
  normalizeEnumCase(r);
  assert.equal(r.market_size[0].verification, "verified");
  assert.equal(r.trends[0].direction, "growing");
  assert.equal(r.overall_confidence.level, "medium");
  assert.ok(validateReport(r).valid);
});

// Regression: the report tool is not strict, so Claude can send malformed shapes.
// These must never crash the checks (live failure: "(... ?? []).forEach is not a function").
const MALFORMED_SECTIONS = {
  "JSON string": (r) => JSON.stringify(r.trends),
  object: (r) => ({ 0: r.trends[0] }),
  number: () => 3,
};

for (const [label, make] of Object.entries(MALFORMED_SECTIONS)) {
  test(`checks tolerate a ${label} finding section`, () => {
    const r = report();
    r.trends = make(r);
    const allow = buildAllowlist(allUrls(report()).map((url) => ({ url })));
    assert.doesNotThrow(() => findUnsupportedSources(r, allow));
    assert.doesNotThrow(() => normalizeEnumCase(r));
    assert.equal(validateReport(r).valid, false, "schema still reports it");
  });
}

for (const [label, value] of [["string", "https://example.com/mock/trends"], ["object", { url: "https://example.com/mock/trends", title: "t" }]]) {
  test(`checks tolerate ${label} 'sources'`, () => {
    const r = report();
    r.trends[0].sources = value;
    const allow = buildAllowlist(allUrls(report()).map((url) => ({ url })));
    let unsupported;
    assert.doesNotThrow(() => (unsupported = findUnsupportedSources(r, allow)));
    assert.ok(!unsupported.some((u) => u.section === "trends" && u.index === 0), "a string is not iterated character by character");
    assert.equal(validateReport(r).valid, false);
  });
}
