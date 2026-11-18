import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => (mem[k] = v) };
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class {};
const { financials, storage } = await import("../src/lib/storage.js");

beforeEach(() => { for (const k of Object.keys(mem)) delete mem[k]; });

const V1 = { initialInvestment: 400000, pricePerRental: 1800, monthlyRentals: 100, variableCostPerRental: 300, monthlyFixedExpenses: 80000 };

test("v1 entry is migrated on first read, saved as v2, and the v1 entry is left untouched", () => {
  mem["vl.financials.v1"] = JSON.stringify({ b1: V1 });
  const m = financials.get("b1");
  assert.equal(m.version, 2);
  assert.equal(m.template, "rental");
  assert.equal(m.inputs.pricePerRental.value, 1800);
  assert.deepEqual(JSON.parse(mem["vl.financials.v2"]).b1, m, "persisted as v2");
  assert.deepEqual(JSON.parse(mem["vl.financials.v1"]).b1, V1, "v1 data not modified");
  assert.equal(financials.get("b1").inputs.pricePerRental.value, 1800, "second read uses v2");
});

test("v2 takes precedence over v1; clear removes both so defaults apply", () => {
  mem["vl.financials.v1"] = JSON.stringify({ b1: V1 });
  const v2 = financials.get("b1");
  financials.save("b1", { ...v2, currency: "USD" });
  assert.equal(financials.get("b1").currency, "USD");
  financials.clear("b1");
  assert.equal(financials.get("b1"), null);
  assert.equal(JSON.parse(mem["vl.financials.v1"]).b1, undefined);
});

test("corrupt or unknown saved data returns null (UI falls back to defaults)", () => {
  mem["vl.financials.v2"] = JSON.stringify({ b1: { version: 2, template: "nope", inputs: {} } });
  mem["vl.financials.v1"] = "not json";
  assert.equal(financials.get("b1"), null);
});

test("existing business and report records are unaffected by financial storage", () => {
  const b = storage.saveBusiness({ name: "Rang Rivaaz", industry: "Clothing rental", description: "Rang Rivaaz, a clothing rental business.", stage: "Idea" });
  storage.saveReport({ businessId: b.id, status: "completed", result: { agent: "market-research", mock: true, generatedAt: "2026-01-01T00:00:00Z", input: { business: "x" }, report: {} } });
  const before = [mem["vl.businesses.v1"], mem["vl.reports.v1"]];
  mem["vl.financials.v1"] = JSON.stringify({ [b.id]: V1 });
  financials.get(b.id);
  financials.save(b.id, financials.get(b.id));
  financials.clear(b.id);
  assert.deepEqual([mem["vl.businesses.v1"], mem["vl.reports.v1"]], before);
});
