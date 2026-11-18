import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReport } from "../src/agents/market-research/market-research.schema.js";
import { buildMockReport } from "../src/agents/market-research/market-research.mock.js";

const report = () => buildMockReport({ business: "candle shop" });

test("mock fixture satisfies the report schema", () => {
  const { valid, errors } = validateReport(report());
  assert.ok(valid, JSON.stringify(errors));
});

test("a finding without sources is rejected", () => {
  const r = report();
  delete r.trends[0].sources;
  assert.equal(validateReport(r).valid, false);
});

test("a finding with an empty sources array is rejected", () => {
  const r = report();
  r.competitors[0].sources = [];
  assert.equal(validateReport(r).valid, false);
});

test("a non-http source URL is rejected", () => {
  const r = report();
  r.risks[0].sources[0].url = "not a url";
  assert.equal(validateReport(r).valid, false);
});

test("an unknown verification status is rejected", () => {
  const r = report();
  r.market_size[0].verification = "probably";
  assert.equal(validateReport(r).valid, false);
});

test("missing evidence or confidence is rejected", () => {
  for (const field of ["evidence", "confidence"]) {
    const r = report();
    delete r.opportunities[0][field];
    assert.equal(validateReport(r).valid, false, `${field} should be required`);
  }
});

test("every finding section in the fixture carries all four proof fields", () => {
  const r = report();
  for (const section of ["market_size", "trends", "competitors", "target_segments", "risks", "opportunities"]) {
    for (const item of r[section]) {
      for (const field of ["evidence", "sources", "verification", "confidence"]) {
        assert.ok(item[field], `${section} item missing ${field}`);
      }
    }
  }
});
