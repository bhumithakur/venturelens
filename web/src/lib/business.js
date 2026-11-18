/** Business form options and validation (shared, framework-free). */

export const STAGES = [
  { value: "Idea", hint: "Exploring and validating the concept" },
  { value: "Pre-launch", hint: "Building the product, no customers yet" },
  { value: "Early-stage", hint: "First customers, under ~2 years" },
  { value: "Growing", hint: "Repeatable sales, scaling up" },
  { value: "Established", hint: "Stable business looking for new growth" },
];

export const INDUSTRIES = [
  "Retail & e-commerce", "Food & beverage", "Health & wellness", "Education", "Professional services",
  "Software & SaaS", "Hospitality & travel", "Beauty & personal care", "Home services", "Manufacturing",
  "Fintech", "Media & creative", "Agriculture", "Logistics",
];

// Limits mirror the backend market-research input schema (business 3-500, region <=200, industry <=200).
export const LIMITS = { name: 80, industry: 200, location: 200, description: 500, targetCustomers: 300 };
export const EMPTY_BUSINESS = { name: "", industry: "", location: "", description: "", stage: "", targetCustomers: "" };

export function validateBusiness(v) {
  const e = {};
  const t = (k) => v[k].trim();
  if (t("name").length < 2) e.name = "Enter a business name (at least 2 characters).";
  else if (t("name").length > LIMITS.name) e.name = `Keep the name under ${LIMITS.name} characters.`;
  if (!t("industry")) e.industry = "Choose or type an industry.";
  else if (t("industry").length > LIMITS.industry) e.industry = `Keep the industry under ${LIMITS.industry} characters.`;
  if (t("location").length > LIMITS.location) e.location = `Keep the location under ${LIMITS.location} characters.`;
  if (t("description").length < 20) e.description = "Describe the business in at least 20 characters so research has enough context.";
  else if (t("description").length > LIMITS.description) e.description = `Keep the description under ${LIMITS.description} characters.`;
  if (!STAGES.some((s) => s.value === v.stage)) e.stage = "Select the stage that best fits.";
  if (t("targetCustomers").length > LIMITS.targetCustomers) e.targetCustomers = `Keep this under ${LIMITS.targetCustomers} characters.`;
  return e;
}

