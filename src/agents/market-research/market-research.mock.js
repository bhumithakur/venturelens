/**
 * Fixture used when MOCK_MODE=true. Fully local: no Anthropic API, no network.
 * It must always validate against the real report schema (a test enforces it).
 * All URLs use example.com and all text is marked as mock data.
 */
export function buildMockReport(input) {
  const subject = input.business;
  const place = input.region ? ` in ${input.region}` : "";

  return {
    summary:
      `[MOCK DATA - no research was performed] Placeholder report for "${subject}"${place}. ` +
      "Use it to test the API, the schema, and the UI without spending API credits.",
    market_size: [
      {
        metric: "Market revenue",
        value: "$1.2B (mock)",
        as_of: "2025",
        claim: "[MOCK] The market was worth about $1.2B in 2025.",
        evidence: "[MOCK] Fabricated figure from a fictional industry report.",
        sources: [{ url: "https://example.com/mock/market-report", title: "Mock Industry Report" }],
        verification: "verified",
        confidence: "high",
      },
      {
        metric: "CAGR",
        value: "6.5% (mock)",
        as_of: "2025-2030",
        claim: "[MOCK] The market is projected to grow about 6.5% per year through 2030.",
        evidence: "[MOCK] A single fictional forecast; no second source found.",
        sources: [{ url: "https://example.com/mock/forecast", title: "Mock Forecast" }],
        verification: "partially_verified",
        confidence: "medium",
      },
    ],
    trends: [
      {
        direction: "growing",
        claim: "[MOCK] Online ordering is gaining share over in-person sales.",
        evidence: "[MOCK] Fictional survey showing a shift towards online purchases.",
        sources: [{ url: "https://example.com/mock/trends", title: "Mock Consumer Trends Survey" }],
        verification: "verified",
        confidence: "medium",
      },
    ],
    competitors: [
      {
        name: "ExampleCo (mock)",
        type: "direct",
        scope: "local",
        location: "[MOCK] Fictional location",
        category: "[MOCK] Fictional category",
        services: ["[MOCK] Fictional service"],
        listing_type: "directory_listing",
        claim: "[MOCK] ExampleCo is a fictional direct competitor with a strong online presence.",
        evidence: "[MOCK] Fictional company profile.",
        sources: [{ url: "https://example.com/mock/exampleco", title: "ExampleCo Overview" }],
        verification: "unverified",
        confidence: "low",
      },
    ],
    target_segments: [
      {
        segment: "Urban millennials (mock)",
        claim: "[MOCK] Urban millennials are the largest buyer segment.",
        evidence: "[MOCK] Fictional demographic breakdown.",
        sources: [{ url: "https://example.com/mock/segments", title: "Mock Demographics Study" }],
        verification: "conflicting",
        confidence: "low",
      },
    ],
    risks: [
      {
        severity: "medium",
        claim: "[MOCK] Rising input costs may squeeze margins.",
        evidence: "[MOCK] Fictional commodity price report.",
        sources: [{ url: "https://example.com/mock/costs", title: "Mock Input Cost Report" }],
        verification: "partially_verified",
        confidence: "medium",
      },
    ],
    opportunities: [
      {
        title: "Subscription offering (mock)",
        claim: "[MOCK] Few competitors offer subscriptions, which leaves room for a recurring-revenue product.",
        evidence: "[MOCK] Fictional competitor feature comparison.",
        sources: [{ url: "https://example.com/mock/subscriptions", title: "Mock Competitor Comparison" }],
        verification: "unverified",
        confidence: "low",
      },
    ],
    research_gaps: ["[MOCK] No real research was performed, so every section is placeholder data."],
    overall_confidence: {
      level: "low",
      rationale: "[MOCK] Fixture data only; nothing here is real.",
    },
  };
}
