/**
 * Validates and fingerprints a saved live research result (e.g. live-smoke-output.json)
 * before it is imported into local report history. Nothing is rewritten or normalized.
 */
import { validateReport } from "@backend-schema";

export const MAX_IMPORT_BYTES = 1_000_000;

/** Returns { ok: true, result } or { ok: false, errors: [string] }. */
export function parseLiveResult(text) {
  if (typeof text !== "string" || !text.trim()) return fail("The file is empty.");
  if (text.length > MAX_IMPORT_BYTES) return fail("The file is too large to be a research report.");

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    return fail("The file is not valid JSON.");
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) return fail("Expected a research result object.");

  const errors = [];
  if (result.agent !== "market-research") errors.push(`Not a market research result (agent: ${String(result.agent)}).`);
  if (result.mock !== false) errors.push("This is mock data, not live research. Only live results can be imported.");
  if (result.meta?.mode !== "live") errors.push("Result is not marked as live research (meta.mode must be \"live\").");
  if (!result.meta?.sourceCheck || typeof result.meta.sourceCheck !== "object") errors.push("Source validation results are missing (meta.sourceCheck).");
  if (typeof result.generatedAt !== "string" || Number.isNaN(Date.parse(result.generatedAt))) errors.push("Missing or invalid generatedAt timestamp.");
  if (!result.input || typeof result.input.business !== "string") errors.push("Missing the research input (input.business).");

  const check = validateReport(result.report);
  if (!check.valid) for (const e of check.errors.slice(0, 10)) errors.push(`Report schema: ${e.path} ${e.message}`);

  return errors.length ? { ok: false, errors } : { ok: true, result };
}

/** SHA-256 hex of the exact parsed result, used to detect duplicate imports. */
export async function fingerprint(result) {
  const bytes = new TextEncoder().encode(JSON.stringify(result));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fail(message) {
  return { ok: false, errors: [message] };
}
