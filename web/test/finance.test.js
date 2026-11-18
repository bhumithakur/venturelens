import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FINANCE_VERSION, RANG_RIVAAZ_DEMO, SCENARIOS, TEMPLATES, TEMPLATE_KEYS, calculate, calculateScenarios, createDefaultModel,
  cumulativeCash, defaultCurrency, deriveEconomics, formatMoney, inferTemplate, migrateModel, overallConfidence,
  paybackMonthInSeries, scenarioEconomics, switchTemplate, templateInputs, validateModel,
} from "../src/lib/finance.js";

const RANG = { id: "r1", name: "Rang Rivaaz", industry: "Clothing rental", location: "Aligarh, India", description: "Rang Rivaaz, a clothing rental business." };
const run = (model) => calculate(deriveEconomics(model));
const modelFor = (template, overrides = {}) => {
  const inputs = templateInputs(template);
  for (const [k, v] of Object.entries(overrides)) inputs[k] = { ...inputs[k], value: v };
  return { version: FINANCE_VERSION, template, currency: "USD", inputs, origin: "template" };
};
const close = (a, b) => Math.abs(a - b) < 1e-9;

// ---- Rang Rivaaz: original rental results are preserved --------------------------------

test("Rang Rivaaz keeps its illustrative rental assumptions and original results", () => {
  const m = createDefaultModel(RANG);
  assert.equal(m.template, "rental");
  assert.equal(m.currency, "INR");
  assert.equal(m.origin, "demo");
  const r = run(m);
  assert.equal(r.monthlyRevenue, 180000);
  assert.equal(r.contributionPerUnit, 1150);
  assert.equal(r.monthlyOperatingProfit, 48000);
  assert.equal(r.breakEvenUnits, 79);
  assert.ok(close(r.paybackMonths, 500000 / 48000));
  assert.equal(r.capacity, null, "no capacity check in the original demo");
});

test("break-even rounds up to whole units and is exact on even division", () => {
  assert.equal(run(switchFixed(createDefaultModel(RANG), 115000)).breakEvenUnits, 100);
  assert.equal(run(switchFixed(createDefaultModel(RANG), 115001)).breakEvenUnits, 101);
});
function switchFixed(m, v) { return { ...m, inputs: { ...m.inputs, monthlyFixedExpenses: { ...m.inputs.monthlyFixedExpenses, value: v } } }; }

test("non-positive contribution: break-even not achievable; payback only for positive profit", () => {
  assert.equal(calculate({ volume: 10, capacity: null, price: 50, variableCostPerUnit: 50, fixedCosts: 100, initialInvestment: 0 }).breakEvenUnits, null);
  assert.equal(calculate({ volume: 10, capacity: null, price: 50, variableCostPerUnit: 60, fixedCosts: 100, initialInvestment: 0 }).breakEvenUnits, null);
  assert.equal(calculate({ volume: 10, capacity: null, price: 50, variableCostPerUnit: 40, fixedCosts: 100, initialInvestment: 500 }).paybackMonths, null, "profit exactly 0");
  assert.equal(calculate({ volume: 10, capacity: null, price: 50, variableCostPerUnit: 0, fixedCosts: 100, initialInvestment: 0 }).paybackMonths, 0);
});

test("volume is rounded to whole units before calculating", () => {
  const r = calculate({ volume: 120.6, capacity: null, price: 1500, variableCostPerUnit: 350, fixedCosts: 90000, initialInvestment: 0 });
  assert.equal(r.units, 121);
  assert.equal(r.monthlyRevenue, 1500 * 121);
});

// ---- Every template ----------------------------------------------------------------

const EXPECTED = {
  // template: [units, revenue, contribution/unit, operating profit, break-even, payback months]
  retail: [400, 24000, 27, 2800, 297, 30000 / 2800],
  saas: [300, 14700, 43, 3900, 210, 60000 / 3900],
  restaurant: [2080, 52000, 17, 7360, 1648, 120000 / 7360],
  rental: [60, 4800, 65, 1400, 39, 20000 / 1400],
  services: [392, 35280, 80, 9360, 275, 15000 / 9360],
  manufacturing: [2000, 60000, 15, 12000, 1200, 150000 / 12000],
  other: [200, 20000, 60, 4000, 134, 25000 / 4000],
};

test("every template is covered by a test", () => {
  assert.deepEqual(Object.keys(EXPECTED).sort(), [...TEMPLATE_KEYS].sort());
});

for (const [key, [units, revenue, contribution, profit, breakEven, payback]] of Object.entries(EXPECTED)) {
  test(`template ${key}: defaults are valid labelled assumptions and produce the documented results`, () => {
    const m = modelFor(key);
    assert.deepEqual(validateModel(m), {});
    assert.ok(Object.values(m.inputs).every((i) => i.source === "assumption"));
    assert.equal(overallConfidence(m), "low");
    const r = run(m);
    assert.equal(r.units, units);
    assert.ok(close(r.monthlyRevenue, revenue), `${r.monthlyRevenue}`);
    assert.ok(close(r.contributionPerUnit, contribution), `${r.contributionPerUnit}`);
    assert.ok(close(r.monthlyOperatingProfit, profit), `${r.monthlyOperatingProfit}`);
    assert.equal(r.breakEvenUnits, breakEven);
    assert.ok(close(r.paybackMonths, payback));
    assert.ok(TEMPLATES[key].volumeUnit && TEMPLATES[key].explain.volume && TEMPLATES[key].explain.variableCost);
  });
}

test("retail: variable cost combines COGS % of order value with per-order fulfilment", () => {
  assert.ok(close(deriveEconomics(modelFor("retail")).variableCostPerUnit, 60 * 0.45 + 6));
});

test("SaaS: churn produces explicit notes, never a hidden revenue change", () => {
  const e = deriveEconomics(modelFor("saas"));
  assert.match(e.notes[0], /9 subscribers lost per month/);
  assert.match(e.notes[1], /33\.3 months/);
  assert.equal(deriveEconomics(modelFor("saas", { monthlyChurnPercent: 0 })).notes.length, 1, "no lifetime note at 0% churn");
});

test("restaurant: covers are capped by seats × turns × days", () => {
  const r = run(modelFor("restaurant", { coversPerDay: 150 })); // demand 3900 > capacity 40×3×26 = 3120
  assert.equal(r.capacity, 3120);
  assert.equal(r.units, 3120);
  assert.equal(r.capacityConstrained, true);
  assert.equal(r.capacityUtilisation, 1);
});

test("services: billable hours follow staff × hours × utilisation, within capacity", () => {
  const r = run(modelFor("services"));
  assert.equal(r.capacity, 560);
  assert.equal(r.capacityConstrained, false);
  assert.ok(close(r.capacityUtilisation, 0.7));
});

test("manufacturing: sales above production capacity are capped", () => {
  const r = run(modelFor("manufacturing", { unitsSoldPerMonth: 3000 }));
  assert.equal(r.units, 2500);
  assert.equal(r.capacityConstrained, true);
});

test("rental: inventory capacity applies only when both fields are filled", () => {
  assert.equal(run(modelFor("rental", { monthlyRentals: 200 })).units, 120); // 40 × 3
  const none = modelFor("rental", { monthlyRentals: 200, inventoryItems: null, maxRentalsPerItemPerMonth: null });
  assert.deepEqual(validateModel(none), {});
  assert.equal(run(none).units, 200);
  assert.ok(validateModel(modelFor("rental", { inventoryItems: null })).inventoryItems, "half-filled capacity rejected");
});

// ---- Scenarios & cash -----------------------------------------------------------

test("scenario volumes are whole numbers, capped by capacity, and ordered conservative ≤ realistic ≤ optimistic", () => {
  for (const key of TEMPLATE_KEYS) {
    const e = deriveEconomics(modelFor(key));
    const sc = calculateScenarios(e);
    assert.ok(sc.every((s) => Number.isInteger(s.results.units)), key);
    assert.ok(sc.every((s) => s.results.capacity === null || s.results.units <= s.results.capacity), key);
    const [c, r, o] = sc.map((s) => s.results.monthlyOperatingProfit);
    assert.ok(c <= r && r <= o, `${key}: ${c} ${r} ${o}`);
  }
  const c = scenarioEconomics(deriveEconomics(createDefaultModel(RANG)), SCENARIOS[0]);
  assert.equal(c.volume, 84); // round(120 × 0.7)
  assert.equal(calculateScenarios(deriveEconomics(createDefaultModel(RANG)))[1].results.monthlyOperatingProfit, 48000);
});

test("cumulative cash starts at −investment at month 0, then adds monthly profit", () => {
  const s = cumulativeCash(500000, 48000, 24);
  assert.equal(s.length, 25);
  assert.deepEqual(s[0], { month: 0, cash: -500000 });
  assert.equal(paybackMonthInSeries(s), 11);
  assert.equal(paybackMonthInSeries(cumulativeCash(500000, -1000, 24)), null);
  assert.equal(paybackMonthInSeries(cumulativeCash(0, 100, 24)), 0);
});

// ---- Defaults: Rang Rivaaz values never leak -----------------------------------------

test("new businesses get template defaults for their industry, never Rang Rivaaz values", () => {
  const cases = [
    [{ name: "Brew & Co", industry: "Cafe", location: "Austin, USA" }, "restaurant", "USD"],
    [{ name: "TaskFlow", industry: "SaaS", location: "London, UK" }, "saas", "GBP"],
    [{ name: "Gear Hire", industry: "Camera rental", location: "Mumbai, India" }, "rental", "INR"],
    [{ name: "Northwind", industry: "Online store", location: "Berlin, Germany" }, "retail", "EUR"],
  ];
  for (const [b, template, currency] of cases) {
    const m = createDefaultModel(b);
    assert.equal(m.template, template, b.name);
    assert.equal(m.currency, currency, b.name);
    assert.equal(m.origin, "template");
    const vals = Object.values(m.inputs).map((i) => i.value);
    assert.ok(!Object.values(RANG_RIVAAZ_DEMO).some((v) => vals.includes(v)), `${b.name} must not get Rang Rivaaz values`);
  }
});

test("template inference covers every model; unknown industries fall back to 'other'", () => {
  assert.equal(inferTemplate({ industry: "Management consulting" }), "services");
  assert.equal(inferTemplate({ industry: "Furniture manufacturing" }), "manufacturing");
  assert.equal(inferTemplate({ industry: "Beekeeping" }), "other");
});

test("switching template resets inputs to that template's labelled assumptions and keeps currency", () => {
  const m = switchTemplate(createDefaultModel(RANG), "saas");
  assert.equal(m.template, "saas");
  assert.equal(m.currency, "INR");
  assert.deepEqual(Object.keys(m.inputs).sort(), TEMPLATES.saas.inputs.map((f) => f.key).sort());
  assert.deepEqual(validateModel(m), {});
});

// ---- Provenance & confidence -----------------------------------------------------------

test("confidence: low with any assumption, medium with benchmarks, high only with all actual data", () => {
  const m = modelFor("other");
  const all = (source, note = "") => ({ ...m, inputs: Object.fromEntries(Object.entries(m.inputs).map(([k, i]) => [k, { ...i, source, note }])) });
  assert.equal(overallConfidence(m), "low");
  assert.equal(overallConfidence(all("benchmark", "Industry report 2026")), "medium");
  assert.equal(overallConfidence(all("actual")), "high");
  const mixed = all("actual");
  mixed.inputs.pricePerUnit = { ...mixed.inputs.pricePerUnit, source: "assumption" };
  assert.equal(overallConfidence(mixed), "low");
});

test("a research benchmark must name its source; unknown sources rejected", () => {
  const m = modelFor("other");
  m.inputs.pricePerUnit = { value: 100, source: "benchmark", note: "" };
  assert.match(validateModel(m).pricePerUnit, /research source/);
  m.inputs.pricePerUnit.note = "Sector pricing survey 2026";
  assert.deepEqual(validateModel(m), {});
  m.inputs.pricePerUnit.source = "rumour";
  assert.ok(validateModel(m).pricePerUnit);
});

test("validation: required, numeric, non-negative, percent ≤ 100, supported currency", () => {
  assert.ok(validateModel(modelFor("retail", { monthlyOrders: null })).monthlyOrders);
  assert.ok(validateModel(modelFor("retail", { averageOrderValue: -1 })).averageOrderValue);
  assert.ok(validateModel(modelFor("retail", { cogsPercent: 101 })).cogsPercent);
  assert.ok(validateModel(modelFor("retail", { monthlyFixedCosts: NaN })).monthlyFixedCosts);
  assert.ok(validateModel({ ...modelFor("retail"), currency: "XYZ" }).currency);
  assert.ok(validateModel({ template: "nope" }).template);
});

test("currency defaults from location and formats per currency", () => {
  assert.equal(defaultCurrency("Aligarh, India"), "INR");
  assert.equal(defaultCurrency("Somewhere"), "USD");
  assert.equal(formatMoney(180000, "INR"), "₹1,80,000");
  assert.equal(formatMoney(180000, "USD"), "$180,000");
});

// ---- Migration -------------------------------------------------------------------------

test("v1 saved data migrates to v2 with values, results and INR preserved", () => {
  const v1 = { initialInvestment: 500000, pricePerRental: 2000, monthlyRentals: 120, variableCostPerRental: 350, monthlyFixedExpenses: 90000 };
  const m = migrateModel(v1);
  assert.equal(m.version, 2);
  assert.equal(m.template, "rental");
  assert.equal(m.currency, "INR");
  assert.equal(m.migratedFrom, 1);
  assert.equal(m.origin, "user", "edited v1 values are the user's");
  assert.ok(Object.keys(v1).every((k) => m.inputs[k].value === v1[k] && m.inputs[k].source === "assumption"));
  assert.deepEqual(validateModel(m), {});
  const r = run(m);
  assert.equal(r.monthlyOperatingProfit, 1650 * 120 - 90000);
  assert.equal(r.capacity, null);
  assert.equal(migrateModel({ ...RANG_RIVAAZ_DEMO }).origin, "demo");
});

test("v2 data passes through; unrecognised data is rejected (falls back to defaults)", () => {
  const v2 = createDefaultModel(RANG);
  assert.equal(migrateModel(v2), v2);
  for (const bad of [null, "x", { foo: 1 }, { version: 2, template: "nope", inputs: {} }, { initialInvestment: "1" }]) assert.equal(migrateModel(bad), null);
});
