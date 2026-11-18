/**
 * Source checks for live reports. Pure functions, no network.
 *
 * A source URL is "supported" only if it appeared in an actual web search
 * result during this run. That proves Claude SAW the page in results; it does
 * NOT prove the page supports the claim (result text is encrypted), so these
 * checks never raise a finding's verification level, only lower it.
 */
import { COMPETITOR_SCOPES, CONFIDENCE_LEVELS, LISTING_TYPES, VERIFICATION_STATUSES } from "./market-research.schema.js";

export const FINDING_SECTIONS = [
  "market_size",
  "trends",
  "competitors",
  "target_segments",
  "risks",
  "opportunities",
];

const MAX_RESEARCH_GAPS = 10; // matches reportSchema.research_gaps.maxItems

/** Canonical form for comparing URLs: lowercase host, no "www.", no fragment, no default port, no trailing slash. */
export function normalizeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const port = u.port && !["80", "443"].includes(u.port) ? `:${u.port}` : "";
  const path = u.pathname.replace(/\/+$/, "");
  return `${host}${port}${path}${u.search}`;
}

/** Builds the allowlist from collected search results ([{ url, title }]). */
export function buildAllowlist(searchResults) {
  const set = new Set();
  for (const r of searchResults) {
    const n = normalizeUrl(r.url);
    if (n) set.add(n);
  }
  return set;
}

/**
 * Claude's tool input is not schema-guaranteed (the report tool is not strict), so a section
 * or `sources` may arrive as a string, object or number. Only real arrays are iterated here;
 * anything else is left for the schema check to report.
 */
const asArray = (v) => (Array.isArray(v) ? v : []);

/** Lists report sources that are not in the allowlist: [{ section, index, url }]. */
export function findUnsupportedSources(report, allowlist) {
  const out = [];
  for (const section of FINDING_SECTIONS) {
    asArray(report?.[section]).forEach((finding, index) => {
      for (const s of asArray(finding?.sources)) {
        if (!allowlist.has(normalizeUrl(s?.url))) out.push({ section, index, url: s?.url });
      }
    });
  }
  return out;
}

/**
 * Final enforcement after the correction round:
 *  - removes unsupported sources;
 *  - a finding that lost sources can no longer be "verified" (downgraded to partially_verified);
 *  - a finding left with no sources is dropped and recorded in research_gaps.
 * Returns a new report plus a summary. Never upgrades verification or confidence.
 */
export function enforceSupportedSources(report, allowlist) {
  const out = structuredClone(report);
  const summary = { removedSources: 0, droppedFindings: 0, downgradedFindings: 0, listingDowngrades: 0 };

  // A competitor known only from a directory listing or social profile is a lead, not a
  // verified fact: it can never stay "verified".
  for (const c of asArray(out.competitors)) {
    if ((c.listing_type === "directory_listing" || c.listing_type === "social_profile") && c.verification === "verified") {
      c.verification = "partially_verified";
      summary.listingDowngrades += 1;
    }
  }
  const newGaps = [];

  for (const section of FINDING_SECTIONS) {
    if (!Array.isArray(out[section])) continue; // only reached for schema-valid reports
    const kept = [];
    for (const finding of out[section]) {
      if (!Array.isArray(finding?.sources)) {
        kept.push(finding);
        continue;
      }
      const before = finding.sources.length;
      finding.sources = finding.sources.filter((s) => allowlist.has(normalizeUrl(s.url)));
      const removed = before - finding.sources.length;
      summary.removedSources += removed;

      if (finding.sources.length === 0) {
        summary.droppedFindings += 1;
        newGaps.push(`Unverified (no source found in search results), removed from ${section}: ${truncate(finding.claim, 200)}`);
        continue;
      }
      if (removed > 0 && finding.verification === "verified") {
        finding.verification = "partially_verified";
        summary.downgradedFindings += 1;
      }
      kept.push(finding);
    }
    out[section] = kept;
  }

  out.research_gaps = mergeGaps(out.research_gaps ?? [], newGaps);
  return { report: out, summary };
}

function mergeGaps(existing, added) {
  const all = [...existing, ...added];
  if (all.length <= MAX_RESEARCH_GAPS) return all;
  const keep = all.slice(0, MAX_RESEARCH_GAPS - 1);
  const rest = all.length - keep.length;
  keep.push(`${rest} further gap(s) or removed finding(s) not listed.`);
  return keep;
}

function truncate(text, max) {
  const s = String(text ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Strict structured output can return an enum value that differs only in
 * capitalization (documented behavior). Normalize those before schema checks.
 */
const ENUMS = {
  verification: VERIFICATION_STATUSES,
  confidence: CONFIDENCE_LEVELS,
  direction: ["growing", "stable", "declining", "emerging"],
  type: ["direct", "indirect", "substitute"],
  scope: COMPETITOR_SCOPES,
  listing_type: LISTING_TYPES,
  severity: ["high", "medium", "low"],
};

export function normalizeEnumCase(report) {
  if (!report || typeof report !== "object") return report;
  const fix = (obj) => {
    for (const [field, allowed] of Object.entries(ENUMS)) {
      if (typeof obj?.[field] === "string") {
        const match = allowed.find((a) => a.toLowerCase() === obj[field].toLowerCase());
        if (match) obj[field] = match;
      }
    }
  };
  for (const section of FINDING_SECTIONS) {
    for (const item of asArray(report[section])) if (item && typeof item === "object") fix(item);
  }
  if (report.overall_confidence && typeof report.overall_confidence.level === "string") {
    const m = CONFIDENCE_LEVELS.find((a) => a === report.overall_confidence.level.toLowerCase());
    if (m) report.overall_confidence.level = m;
  }
  return report;
}
