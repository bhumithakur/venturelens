/**
 * Financial Analyst: deterministic, driver-based unit economics for any business model.
 * Pure functions, no network, no AI.
 *
 * A template turns business-specific drivers (orders, subscribers, covers, billable hours,
 * rentals, units...) into generic monthly economics:
 *   { volume, capacity, price, variableCostPerUnit, fixedCosts, initialInvestment }
 * which feed one set of transparent formulas.
 */

export const FINANCE_VERSION = 2;

// ---- Provenance ---------------------------------------------------------------

/** Where a number comes from. Assumptions are never presented as facts. */
export const SOURCES = Object.freeze({
  assumption: { label: "Assumption", confidence: "low" },
  benchmark: { label: "Research benchmark", confidence: "medium" },
  actual: { label: "Actual data", confidence: "high" },
});

/** Overall confidence: high only if every input is actual data; low if any input is an assumption. */
export function overallConfidence(model) {
  const sources = Object.values(model.inputs).filter((i) => i.value !== null).map((i) => i.source);
  if (sources.length && sources.every((s) => s === "actual")) return "high";
  if (sources.includes("assumption")) return "low";
  return "medium";
}

// ---- Currency -------------------------------------------------------------------

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

/** Default currency from the business location (editable). Unknown -> USD. */
export function defaultCurrency(location = "") {
  const l = location.toLowerCase();
  if (/india/.test(l)) return "INR";
  if (/united kingdom|\buk\b|england|scotland|wales|london/.test(l)) return "GBP";
  if (/uae|dubai|abu dhabi|emirates/.test(l)) return "AED";
  if (/singapore/.test(l)) return "SGD";
  if (/australia/.test(l)) return "AUD";
  if (/canada/.test(l)) return "CAD";
  if (/germany|france|spain|italy|netherlands|ireland|portugal|belgium|austria|finland|greece/.test(l)) return "EUR";
  return "USD";
}

const formatters = new Map();
export function formatMoney(n, currency = "USD") {
  if (!Number.isFinite(n)) return "-";
  if (!formatters.has(currency)) {
    formatters.set(currency, new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }));
  }
  return formatters.get(currency).format(n);
}

// ---- Templates -----------------------------------------------------------------

const money = (key, label, help, def, extra = {}) => ({ key, label, kind: "money", help, default: def, ...extra });
const count = (key, label, help, def, extra = {}) => ({ key, label, kind: "count", help, default: def, ...extra });
const percent = (key, label, help, def, extra = {}) => ({ key, label, kind: "percent", help, default: def, ...extra });
const fixedAndInvestment = (fixed, invest) => [
  money("monthlyFixedCosts", "Monthly fixed costs", "Rent, salaries, utilities, software, marketing.", fixed),
  money("initialInvestment", "Initial investment", "One-time setup: equipment, fit-out, inventory, deposits.", invest),
];
const base = (i, extra) => ({ fixedCosts: i.monthlyFixedCosts, initialInvestment: i.initialInvestment, capacity: null, notes: [], ...extra });

export const TEMPLATES = Object.freeze({
  retail: {
    label: "Retail & e-commerce",
    volumeUnit: "orders",
    priceLabel: "Average order value",
    explain: { volume: "monthly orders", variableCost: "order value × COGS % + fulfilment cost per order" },
    inputs: [
      count("monthlyOrders", "Monthly orders", "Orders completed per month.", 400),
      money("averageOrderValue", "Average order value", "Average revenue per order.", 60),
      percent("cogsPercent", "Cost of goods (%)", "Product cost as a % of the order value.", 45),
      money("fulfilmentCostPerOrder", "Fulfilment cost per order", "Packaging, shipping, payment fees per order.", 6),
      ...fixedAndInvestment(8000, 30000),
    ],
    derive: (i) => base(i, {
      volume: i.monthlyOrders,
      price: i.averageOrderValue,
      variableCostPerUnit: (i.averageOrderValue * i.cogsPercent) / 100 + i.fulfilmentCostPerOrder,
    }),
  },
  saas: {
    label: "SaaS & subscription",
    volumeUnit: "subscribers",
    priceLabel: "Monthly price per subscriber",
    explain: { volume: "paying subscribers", variableCost: "hosting, support and payment costs per subscriber" },
    inputs: [
      count("subscribers", "Paying subscribers", "Active paying subscribers this month.", 300),
      money("monthlyPrice", "Monthly price per subscriber", "Average monthly revenue per subscriber.", 49),
      money("variableCostPerSubscriber", "Variable cost per subscriber", "Hosting, support, payment fees per subscriber.", 6),
      percent("monthlyChurnPercent", "Monthly churn (%)", "Share of subscribers who cancel each month.", 3),
      ...fixedAndInvestment(9000, 60000),
    ],
    derive: (i) => {
      const lost = Math.round((i.subscribers * i.monthlyChurnPercent) / 100);
      const notes = [`Churn: about ${lost} subscribers lost per month must be replaced just to stay flat.`];
      if (i.monthlyChurnPercent > 0) notes.push(`Average subscriber lifetime ≈ ${(100 / i.monthlyChurnPercent).toFixed(1)} months.`);
      return base(i, { volume: i.subscribers, price: i.monthlyPrice, variableCostPerUnit: i.variableCostPerSubscriber, notes });
    },
  },
  restaurant: {
    label: "Restaurant & hospitality",
    volumeUnit: "covers",
    priceLabel: "Average spend per cover",
    explain: { volume: "covers per day × days open", variableCost: "spend per cover × food & beverage cost %", capacity: "seats × max turns per day × days open" },
    inputs: [
      count("coversPerDay", "Covers per day", "Guests served per day on average.", 80),
      count("daysOpenPerMonth", "Days open per month", "Trading days per month.", 26),
      money("averageSpendPerCover", "Average spend per cover", "Average bill per guest.", 25),
      percent("foodCostPercent", "Food & beverage cost (%)", "Ingredient cost as a % of sales.", 32),
      count("seats", "Seats", "Seating capacity.", 40),
      count("maxTurnsPerDay", "Max table turns per day", "How many times each seat can be used per day.", 3),
      ...fixedAndInvestment(28000, 120000),
    ],
    derive: (i) => base(i, {
      volume: i.coversPerDay * i.daysOpenPerMonth,
      capacity: i.seats * i.maxTurnsPerDay * i.daysOpenPerMonth,
      price: i.averageSpendPerCover,
      variableCostPerUnit: (i.averageSpendPerCover * i.foodCostPercent) / 100,
    }),
  },
  rental: {
    label: "Rental business",
    volumeUnit: "rentals",
    priceLabel: "Average rental price",
    explain: { volume: "monthly rentals", variableCost: "cleaning, repairs, packaging, delivery per rental", capacity: "inventory items × max rentals per item (if provided)" },
    // Keys match the v1 saved format, so v1 data migrates without changes.
    inputs: [
      count("monthlyRentals", "Monthly rentals", "Rentals completed per month.", 60),
      money("pricePerRental", "Average rental price", "Average amount charged per rental.", 80),
      money("variableCostPerRental", "Variable cost per rental", "Cleaning, repairs, packaging, delivery per rental.", 15),
      count("inventoryItems", "Inventory items", "Items available to rent. Leave blank to skip the capacity check.", 40, { optional: true }),
      count("maxRentalsPerItemPerMonth", "Max rentals per item per month", "Turnarounds possible per item per month.", 3, { optional: true }),
      money("monthlyFixedExpenses", "Monthly fixed expenses", "Rent, salaries, utilities, software, marketing.", 2500),
      money("initialInvestment", "Initial investment", "One-time setup: inventory, fit-out, deposits.", 20000),
    ],
    derive: (i) => ({
      volume: i.monthlyRentals,
      capacity: i.inventoryItems != null && i.maxRentalsPerItemPerMonth != null ? i.inventoryItems * i.maxRentalsPerItemPerMonth : null,
      price: i.pricePerRental,
      variableCostPerUnit: i.variableCostPerRental,
      fixedCosts: i.monthlyFixedExpenses,
      initialInvestment: i.initialInvestment,
      notes: [],
    }),
  },
  services: {
    label: "Professional services",
    volumeUnit: "billable hours",
    priceLabel: "Hourly rate",
    explain: { volume: "billable staff × available hours × utilisation", variableCost: "direct cost per billable hour (e.g. contractors)", capacity: "billable staff × available hours" },
    inputs: [
      count("billableStaff", "Billable staff", "People whose time is billed to clients.", 4),
      count("availableHoursPerStaff", "Available hours per person per month", "Working hours available per person.", 140),
      percent("utilisationPercent", "Utilisation (%)", "Share of available hours that is billed.", 70),
      money("hourlyRate", "Hourly rate", "Average billed rate per hour.", 90),
      money("directCostPerHour", "Direct cost per billable hour", "Contractor or delivery cost per billed hour (0 if salaried).", 10),
      ...fixedAndInvestment(22000, 15000),
    ],
    derive: (i) => base(i, {
      volume: (i.billableStaff * i.availableHoursPerStaff * i.utilisationPercent) / 100,
      capacity: i.billableStaff * i.availableHoursPerStaff,
      price: i.hourlyRate,
      variableCostPerUnit: i.directCostPerHour,
    }),
  },
  manufacturing: {
    label: "Manufacturing",
    volumeUnit: "units",
    priceLabel: "Price per unit",
    explain: { volume: "units sold per month", variableCost: "materials + other variable cost per unit", capacity: "production capacity per month" },
    inputs: [
      count("unitsSoldPerMonth", "Units sold per month", "Expected monthly sales volume.", 2000),
      money("pricePerUnit", "Price per unit", "Average selling price per unit.", 30),
      money("materialCostPerUnit", "Material cost per unit", "Raw materials and components per unit.", 11),
      money("otherVariableCostPerUnit", "Other variable cost per unit", "Direct labour, energy, packaging per unit.", 4),
      count("productionCapacityPerMonth", "Production capacity per month", "Maximum units the facility can produce.", 2500),
      ...fixedAndInvestment(18000, 150000),
    ],
    derive: (i) => base(i, {
      volume: i.unitsSoldPerMonth,
      capacity: i.productionCapacityPerMonth,
      price: i.pricePerUnit,
      variableCostPerUnit: i.materialCostPerUnit + i.otherVariableCostPerUnit,
    }),
  },
  other: {
    label: "Other business",
    volumeUnit: "units sold",
    priceLabel: "Price per unit",
    explain: { volume: "units sold per month", variableCost: "variable cost per unit" },
    inputs: [
      count("unitsPerMonth", "Units sold per month", "Products, services or jobs sold per month.", 200),
      money("pricePerUnit", "Price per unit", "Average revenue per unit.", 100),
      money("variableCostPerUnit", "Variable cost per unit", "Costs that rise with each unit sold.", 40),
      ...fixedAndInvestment(8000, 25000),
    ],
    derive: (i) => base(i, { volume: i.unitsPerMonth, price: i.pricePerUnit, variableCostPerUnit: i.variableCostPerUnit }),
  },
});

export const TEMPLATE_KEYS = Object.keys(TEMPLATES);

/** Picks a starting template from the business's industry/description (user can change it). */
export function inferTemplate(business = {}) {
  const t = `${business.industry ?? ""} ${business.description ?? ""}`.toLowerCase();
  if (/\brent(al|als|ing)?\b|\bhire\b|\bleasing\b/.test(t)) return "rental";
  if (/\bsaas\b|software|subscription|\bapp\b|platform/.test(t)) return "saas";
  if (/restaurant|cafe|café|food|bakery|hospitality|hotel|\bbar\b|catering|cloud kitchen/.test(t)) return "restaurant";
  if (/manufactur|factory|production|fabricat/.test(t)) return "manufacturing";
  if (/consult|agency|services?\b|legal|accounting|freelanc|design studio/.test(t)) return "services";
  if (/retail|e-?commerce|store|shop|boutique|online sales/.test(t)) return "retail";
  return "other";
}

// ---- Models ---------------------------------------------------------------------

/** Rang Rivaaz alone keeps these illustrative rental assumptions (INR). */
export const RANG_RIVAAZ_DEMO = Object.freeze({
  initialInvestment: 500000,
  pricePerRental: 1500,
  monthlyRentals: 120,
  variableCostPerRental: 350,
  monthlyFixedExpenses: 90000,
});
export const isRangRivaaz = (business) => /rang\s*rivaaz/i.test(business?.name ?? "");

const assumption = (value) => ({ value, source: "assumption", note: "" });

/** Template defaults (illustrative assumptions) for a template. */
export function templateInputs(templateKey) {
  return Object.fromEntries(TEMPLATES[templateKey].inputs.map((f) => [f.key, assumption(f.default)]));
}

/** Starting model for a business. Never gives Rang Rivaaz values to any other business. */
export function createDefaultModel(business) {
  if (isRangRivaaz(business)) {
    const inputs = templateInputs("rental");
    for (const [k, v] of Object.entries(RANG_RIVAAZ_DEMO)) inputs[k] = assumption(v);
    inputs.inventoryItems = assumption(null); // not part of the original demo: no capacity check
    inputs.maxRentalsPerItemPerMonth = assumption(null);
    return { version: FINANCE_VERSION, template: "rental", currency: "INR", inputs, origin: "demo" };
  }
  const template = inferTemplate(business);
  return { version: FINANCE_VERSION, template, currency: defaultCurrency(business?.location), inputs: templateInputs(template), origin: "template" };
}

/** Switches template: inputs reset to the new template's labelled assumptions; currency kept. */
export function switchTemplate(model, templateKey) {
  return { ...model, template: templateKey, inputs: templateInputs(templateKey), origin: "template" };
}

/**
 * Migrates saved data to the current version.
 * v1: plain numbers { initialInvestment, pricePerRental, monthlyRentals, variableCostPerRental, monthlyFixedExpenses }, INR.
 * Returns null for unrecognised data (caller falls back to defaults).
 */
export function migrateModel(saved) {
  if (!saved || typeof saved !== "object") return null;
  if (saved.version === FINANCE_VERSION && TEMPLATES[saved.template] && saved.inputs) return saved;
  if (saved.version === undefined && Object.keys(RANG_RIVAAZ_DEMO).every((k) => typeof saved[k] === "number")) {
    const inputs = templateInputs("rental");
    for (const k of Object.keys(RANG_RIVAAZ_DEMO)) inputs[k] = assumption(saved[k]);
    inputs.inventoryItems = assumption(null);
    inputs.maxRentalsPerItemPerMonth = assumption(null);
    const isDemo = Object.entries(RANG_RIVAAZ_DEMO).every(([k, v]) => saved[k] === v);
    return { version: FINANCE_VERSION, template: "rental", currency: "INR", inputs, origin: isDemo ? "demo" : "user", migratedFrom: 1 };
  }
  return null;
}

// ---- Validation ---------------------------------------------------------------------

/** Returns { inputKey: message } (and { currency, template }) for invalid models. */
export function validateModel(model) {
  const errors = {};
  const tpl = TEMPLATES[model?.template];
  if (!tpl) return { template: "Unknown business model." };
  if (!CURRENCIES.includes(model.currency)) errors.currency = "Choose a supported currency.";
  for (const f of tpl.inputs) {
    const input = model.inputs?.[f.key];
    const v = input?.value;
    if (v === null || v === undefined) {
      if (!f.optional) errors[f.key] = `${f.label} is required.`;
    } else if (typeof v !== "number" || !Number.isFinite(v)) errors[f.key] = `${f.label} must be a number.`;
    else if (v < 0) errors[f.key] = `${f.label} cannot be negative.`;
    else if (f.kind === "percent" && v > 100) errors[f.key] = `${f.label} cannot exceed 100%.`;
    if (!errors[f.key] && input && !SOURCES[input.source]) errors[f.key] = `${f.label}: unknown data source.`;
    if (!errors[f.key] && input?.source === "benchmark" && !input.note?.trim()) {
      errors[f.key] = `${f.label}: name the research source for this benchmark.`;
    }
  }
  if (tpl === TEMPLATES.rental) {
    const a = model.inputs.inventoryItems?.value, b = model.inputs.maxRentalsPerItemPerMonth?.value;
    if ((a === null) !== (b === null)) errors.inventoryItems = "Fill in both inventory fields, or leave both blank.";
  }
  return errors;
}

// ---- Calculations ----------------------------------------------------------------------

const values = (model) => Object.fromEntries(Object.entries(model.inputs).map(([k, i]) => [k, i.value]));

/** Template drivers -> generic monthly economics. */
export function deriveEconomics(model) {
  return TEMPLATES[model.template].derive(values(model));
}

/**
 * Core formulas on generic economics. Volume is capped by capacity (if any) and rounded to a
 * whole number BEFORE all calculations.
 */
export function calculate(e) {
  const demand = e.volume;
  const capped = e.capacity != null ? Math.min(demand, e.capacity) : demand;
  const units = Math.round(capped);
  const monthlyRevenue = e.price * units;
  const contributionPerUnit = e.price - e.variableCostPerUnit;
  const monthlyVariableCosts = e.variableCostPerUnit * units;
  const monthlyOperatingProfit = contributionPerUnit * units - e.fixedCosts;
  return {
    units,
    demand,
    capacity: e.capacity ?? null,
    capacityConstrained: e.capacity != null && demand > e.capacity,
    capacityUtilisation: e.capacity ? Math.min(demand, e.capacity) / e.capacity : null,
    monthlyRevenue,
    contributionPerUnit,
    monthlyVariableCosts,
    monthlyFixedCosts: e.fixedCosts,
    monthlyOperatingProfit,
    // Whole units needed to cover fixed costs; impossible if each unit loses money.
    breakEvenUnits: contributionPerUnit > 0 ? Math.ceil(e.fixedCosts / contributionPerUnit) : null,
    // Simplified payback estimate: only for positive monthly operating profit.
    paybackMonths: monthlyOperatingProfit > 0 ? e.initialInvestment / monthlyOperatingProfit : null,
  };
}

/** Multipliers on generic economics. Volumes are capped by capacity and rounded inside calculate(). */
export const SCENARIOS = Object.freeze([
  { key: "conservative", label: "Conservative", m: { volume: 0.7, price: 0.95, variableCost: 1.1, fixed: 1.05 } },
  { key: "realistic", label: "Realistic", m: { volume: 1, price: 1, variableCost: 1, fixed: 1 } },
  { key: "optimistic", label: "Optimistic", m: { volume: 1.25, price: 1.05, variableCost: 0.95, fixed: 1 } },
]);

export function scenarioEconomics(e, s) {
  return {
    ...e,
    volume: Math.round(e.volume * s.m.volume),
    price: e.price * s.m.price,
    variableCostPerUnit: e.variableCostPerUnit * s.m.variableCost,
    fixedCosts: e.fixedCosts * s.m.fixed,
  };
}

export function calculateScenarios(e) {
  return SCENARIOS.map((s) => {
    const economics = scenarioEconomics(e, s);
    return { ...s, economics, results: calculate(economics) };
  });
}

/** Month 0 = −initial investment, then + monthly operating profit each month. */
export function cumulativeCash(initialInvestment, monthlyOperatingProfit, months = 24) {
  return Array.from({ length: months + 1 }, (_, month) => ({ month, cash: -initialInvestment + month * monthlyOperatingProfit }));
}

export function paybackMonthInSeries(series) {
  return series.find((p) => p.cash >= 0)?.month ?? null;
}
