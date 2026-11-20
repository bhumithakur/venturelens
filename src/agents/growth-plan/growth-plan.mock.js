/**
 * Deterministic plan used in mock mode: no Anthropic API. Built from the actual inputs
 * (business profile, research, financials) with rules, so it stays specific to the business.
 * Must always validate against planSchema (a test enforces it).
 */
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);
// Strips label prefixes added by the frontend ("high severity: ", "growing: ") and [MOCK] markers.
const short = (s, n = 90) => {
  const t = String(s).replace(/^(?:(?:high|medium|low) severity|growing|stable|declining|emerging):\s*/i, "").replace(/\[MOCK\]\s*/g, "");
  return clip(t.split(/[.:;]/)[0].trim() || t, n);
};
const nameOf = (s) => short(String(s).split(" (")[0], 60);
const money = (n, c) => (Number.isFinite(n) ? `${c ? `${c} ` : ""}${Math.round(n).toLocaleString("en-US")}` : "unknown");

export function buildMockPlan(input) {
  const r = input.research;
  const f = input.financials;
  const name = input.name || "the business";
  const where = input.region ? ` in ${input.region}` : "";
  const segment = short(first(r?.segments) ?? input.targetCustomers ?? "your core customers", 80);
  const segment2 = r?.segments?.[1] ? short(r.segments[1], 80) : null;
  const competitor = first(r?.competitors) ? nameOf(r.competitors[0]) : null;
  const opportunity = first(r?.opportunities) ? short(r.opportunities[0], 100) : null;
  const risk = first(r?.risks) ? short(r.risks[0], 100) : null;
  const trend = first(r?.trends) ? short(r.trends[0], 100) : null;
  const early = /idea|pre-launch/i.test(input.stage ?? "");
  const unit = f?.volumeUnit ?? "sales";
  const loss = f && Number.isFinite(f.monthlyOperatingProfit) && f.monthlyOperatingProfit <= 0;

  const gaps = [];
  if (!r) gaps.push("No market research has been run: channels and positioning are based on the business profile only.");
  else if (r.mock) gaps.push("Market research is MOCK data: validate segments and competitors with live research before spending on marketing.");
  if (!f) gaps.push("No saved financial model: marketing budget and break-even targets could not be sized.");
  else if (f.confidence === "low") gaps.push("Financial inputs are mostly assumptions: replace them with real quotes and prices.");

  const tasks = [];
  if (!r || r.mock) {
    tasks.push({
      title: early ? "Validate demand with 15-20 target customers" : "Run live market research and confirm segments",
      description: `Interview or survey ${segment}${where} about how they solve this today, what they pay, and where they discover options. ${r ? "Then run live research to replace the mock report." : "Then run Market Research in VentureLens."}`,
      priority: "high", timeline: "immediate",
      expected_outcome: "Confirmed target segment, willingness to pay and top 2 discovery channels before spending on marketing.",
      based_on: r ? ["market_research", "customer_insights"] : ["business_profile"],
    });
  }
  if (!f) {
    tasks.push({
      title: "Build the unit economics in the Financials tab",
      description: `Enter price, volume and costs for ${name} to get break-even ${unit} and payback period.`,
      priority: "high", timeline: "immediate",
      expected_outcome: "A break-even target that sets the monthly customer acquisition goal and marketing budget.",
      based_on: ["financials"],
    });
  } else if (loss) {
    tasks.push({
      title: "Fix unit economics before scaling marketing",
      description: `Current model shows a monthly operating result of ${money(f.monthlyOperatingProfit, f.currency)}. Review price (${money(f.pricePerUnit, f.currency)}) and variable costs so each ${unit.replace(/s$/, "")} contributes more.`,
      priority: "high", timeline: "immediate",
      expected_outcome: "Positive contribution and a reachable break-even point, so marketing spend can pay back.",
      based_on: ["financials"],
    });
  } else {
    tasks.push({
      title: `Reach break-even volume of ${f.breakEvenUnits ?? "?"} ${unit}/month`,
      description: `Set a monthly acquisition target from the break-even of ${f.breakEvenUnits ?? "unknown"} ${unit} (plan: ${f.unitsPerMonth ?? "?"}). Track ${unit} weekly against it.`,
      priority: "high", timeline: "short_term",
      expected_outcome: `Covering ${money(f.monthlyRevenue, f.currency)} monthly revenue target with a clear weekly sales goal.`,
      based_on: ["financials"],
    });
  }
  tasks.push({
    title: `Launch a focused offer for ${clip(segment, 60)}`,
    description: `Package one clear offer and message for ${segment}${competitor ? `, differentiated from ${competitor}` : ""}. Test it on the top recommended channel.`,
    priority: "high", timeline: "short_term",
    expected_outcome: "First repeatable source of customers and a measured cost per acquisition.",
    based_on: r ? ["customer_insights", "strategy"] : ["business_profile", "strategy"],
  });
  tasks.push({
    title: "Set up local discovery and reviews",
    description: `Create/optimise a Google Business Profile and listings for ${name}${where}; ask every early customer for a review.`,
    priority: "medium", timeline: "immediate",
    expected_outcome: "Visible in local searches and a base of social proof within 30 days.",
    based_on: ["strategy", "business_profile"],
  });
  tasks.push({
    title: opportunity ? `Pursue: ${clip(opportunity, 100)}` : "Start a referral programme",
    description: opportunity ? `Turn the opportunity found in research into a pilot with a measurable goal.` : "Give existing customers an incentive for each referred customer.",
    priority: "medium", timeline: "short_term",
    expected_outcome: "A second growth lever beyond the first channel.",
    based_on: opportunity ? ["market_research", "strategy"] : ["strategy"],
  });
  tasks.push({
    title: risk ? `Mitigate risk: ${clip(risk, 100)}` : "Review results and plan the next quarter",
    description: risk ? "Define an early warning signal and a fallback for this risk." : "Compare channel results against targets and double down on what works.",
    priority: "low", timeline: "long_term",
    expected_outcome: "Lower downside and a data-based plan for the next stage.",
    based_on: risk ? ["market_research"] : ["strategy"],
  });

  const basisWhy = r ? `Based on the research segment "${segment}"` : `Based on the stated target customers (${segment})`;
  return {
    summary: clip(
      `${r?.mock ? "[MOCK INPUTS] " : ""}Growth plan for ${name}${where}: win ${segment} first with a focused offer and low-cost local channels` +
        `${f && !loss ? `, aiming at break-even of ${f.breakEvenUnits ?? "?"} ${unit}/month` : ""}${loss ? ", after fixing unit economics" : ""}.`,
      1200
    ),
    marketing: {
      positioning: {
        statement: clip(`For ${segment}${where}, ${name} is the ${input.industry ? `${input.industry.toLowerCase()} ` : ""}option that ${short(input.business, 160).toLowerCase()}.`, 500),
        differentiators: [
          clip(`Built specifically for ${segment}`, 200),
          competitor ? clip(`Clearer offer than ${competitor}`, 200) : "Simple, transparent pricing",
          input.region ? clip(`Local presence in ${input.region}`, 200) : "Personal, fast service",
        ],
        rationale: clip(`${basisWhy}${competitor ? ` and the competitor ${competitor}` : ""}.`, 600),
      },
      channels: [
        { channel: "Google Business Profile & local search", priority: "high", tactics: clip(`Complete profile, photos, ${input.industry ?? "category"} keywords${where}, weekly posts and review requests.`, 500), rationale: clip(`${segment} search for options nearby; free and fast for a ${input.stage ?? "small"} business.`, 600) },
        { channel: "Instagram / WhatsApp", priority: early ? "high" : "medium", tactics: "Short before/after or behind-the-scenes content 3x a week; WhatsApp for enquiries and bookings.", rationale: clip(`${trend ? `Trend: ${trend}. ` : ""}Low cost, visual, and lets you talk directly to ${segment}.`, 600) },
        { channel: "Partnerships & referrals", priority: "medium", tactics: "Partner with 2-3 complementary local businesses for cross-promotion; referral reward for customers.", rationale: "Borrowed trust converts better than cold ads at an early stage." },
      ],
      acquisition: [
        { strategy: "Launch offer for first customers", description: clip(`Time-limited introductory offer for ${segment}, tracked with a unique code.`, 500), rationale: "Lowers the barrier to first purchase and measures channel performance." },
        { strategy: "Referral loop", description: "Reward each customer who brings a new paying customer.", rationale: f ? `Keeps acquisition cost below the ${money(f.contributionPerUnit, f.currency)} contribution per ${unit.replace(/s$/, "")}.` : "Cheapest acquisition channel while budget is unknown." },
      ],
      campaigns: [
        { title: clip(`"Made for ${segment}"`, 120), format: "Short video series", description: "3-5 short videos showing a real customer problem and how you solve it.", rationale: clip(`Speaks directly to the primary segment: ${segment}.`, 600) },
        { title: competitor ? clip(`Why choose ${name} over ${competitor}`, 120) : `Why ${name}`, format: "Comparison post / FAQ", description: "Honest comparison of price, convenience and quality.", rationale: competitor ? "Customers compare options; addressing it directly builds trust." : "Clarifies the value proposition for first-time visitors." },
      ],
    },
    action_plan: tasks.slice(0, 7),
    data_gaps: gaps,
  };
}
