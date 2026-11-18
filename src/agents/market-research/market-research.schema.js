import { createValidator } from "../../utils/validate.js";

/** Name of the client tool Claude calls to submit its final report (used in live mode). */
export const REPORT_TOOL_NAME = "submit_research_report";

export const VERIFICATION_STATUSES = ["verified", "partially_verified", "unverified", "conflicting"];
export const CONFIDENCE_LEVELS = ["high", "medium", "low"];

// ---- Shared building blocks ----------------------------------------------

const source = {
  type: "object",
  additionalProperties: false,
  required: ["url", "title"],
  properties: {
    url: {
      type: "string",
      pattern: "^https?://\\S+$",
      description: "Full URL of a page that appeared in your web search results. Never invent or guess URLs.",
    },
    title: { type: "string", minLength: 1, description: "Title of the page." },
  },
};

const coreFindingProperties = {
  claim: {
    type: "string",
    minLength: 1,
    description: "One specific, checkable statement. Include numbers, units and dates where relevant.",
  },
  evidence: {
    type: "string",
    minLength: 1,
    description:
      "What the sources actually say that supports the claim: key figures, dates, and context, in your own words.",
  },
  sources: {
    type: "array",
    minItems: 1,
    maxItems: 5,
    items: source,
    description: "Pages that support the claim. At least one is required for every finding.",
  },
  verification: {
    type: "string",
    enum: VERIFICATION_STATUSES,
    description:
      "verified = confirmed by an authoritative primary source or 2+ independent sources that agree. " +
      "partially_verified = one secondary source, or only part of the claim is confirmed. " +
      "unverified = single weak, promotional or indirect source; treat as a lead, not a fact. " +
      "conflicting = credible sources disagree (explain in evidence).",
  },
  confidence: {
    type: "string",
    enum: CONFIDENCE_LEVELS,
    description:
      "Your confidence the claim is accurate and current. Lower it for old data, weak sources, or estimates.",
  },
};

const CORE_REQUIRED = ["claim", "evidence", "sources", "verification", "confidence"];

/** Every factual item in the report is a "finding": it must carry the same proof fields. */
function finding(extraProperties = {}) {
  return {
    type: "object",
    additionalProperties: false,
    required: [...Object.keys(extraProperties), ...CORE_REQUIRED],
    properties: { ...extraProperties, ...coreFindingProperties },
  };
}

export const LISTING_TYPES = ["official_website", "directory_listing", "social_profile", "marketplace", "news_or_article", "review_site", "other"];
export const COMPETITOR_SCOPES = ["local", "national", "online"];

/**
 * Competitor finding. name/type are required as before; the other fields are OPTIONAL
 * additions (older reports without them remain valid).
 */
function competitorFinding() {
  const base = finding({
    name: { type: "string", minLength: 1 },
    type: { type: "string", enum: ["direct", "indirect", "substitute"] },
  });
  base.properties = {
    ...base.properties,
    scope: {
      type: "string",
      enum: COMPETITOR_SCOPES,
      description: "local = same city/region as the business; national = same country; online = primarily online/app.",
    },
    location: {
      type: "string",
      minLength: 1,
      maxLength: 200,
      description: "Where the competitor operates, exactly as stated in a source (e.g. locality, city). Omit if no source states it.",
    },
    category: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: "Business category as described by the source, e.g. 'bridal lehenga rental', 'boutique'.",
    },
    services: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 120 },
      description: "Services or products stated in a source. Do not infer services that no source mentions.",
    },
    listing_type: {
      type: "string",
      enum: LISTING_TYPES,
      description:
        "Strongest kind of source for this competitor. A directory listing or social profile alone shows a listing exists; " +
        "it does not verify the business's details, so such competitors must not be marked 'verified'.",
    },
  };
  return base;
}

// ---- The report ------------------------------------------------------------

export const reportSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "market_size",
    "trends",
    "competitors",
    "target_segments",
    "risks",
    "opportunities",
    "research_gaps",
    "overall_confidence",
  ],
  properties: {
    summary: {
      type: "string",
      minLength: 1,
      maxLength: 2000,
      description: "3-6 sentence overview. Only state things supported by the findings below.",
    },
    market_size: {
      type: "array",
      maxItems: 6,
      description: "Market size and growth figures (TAM, SAM, revenue, CAGR, etc.).",
      items: finding({
        metric: { type: "string", description: "e.g. TAM, SAM, market revenue, CAGR." },
        value: { type: "string", description: "The figure with units, e.g. '$12.4B' or '7.8% CAGR'." },
        as_of: { type: "string", description: "Year or period the figure refers to, or 'not stated'." },
      }),
    },
    trends: {
      type: "array",
      maxItems: 8,
      items: finding({
        direction: { type: "string", enum: ["growing", "stable", "declining", "emerging"] },
      }),
    },
    competitors: {
      type: "array",
      maxItems: 10,
      items: competitorFinding(),
    },
    target_segments: {
      type: "array",
      maxItems: 6,
      items: finding({ segment: { type: "string", minLength: 1 } }),
    },
    risks: {
      type: "array",
      maxItems: 8,
      items: finding({ severity: { type: "string", enum: ["high", "medium", "low"] } }),
    },
    opportunities: {
      type: "array",
      maxItems: 6,
      items: finding({ title: { type: "string", minLength: 1 } }),
    },
    research_gaps: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 1 },
      description: "Things you looked for but could not find or verify. Be honest; gaps are valuable.",
    },
    overall_confidence: {
      type: "object",
      additionalProperties: false,
      required: ["level", "rationale"],
      properties: {
        level: { type: "string", enum: CONFIDENCE_LEVELS },
        rationale: { type: "string", minLength: 1 },
      },
    },
  },
};

export const validateReport = createValidator(reportSchema);
