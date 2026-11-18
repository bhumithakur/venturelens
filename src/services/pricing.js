/**
 * Price table for cost ESTIMATES in response metadata. Not a billing source of truth.
 * Source: https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-11-18).
 * USD per million tokens. cacheWrite = 5-minute cache write (the default TTL we use).
 */
export const MODEL_PRICES = Object.freeze({
  "claude-sonnet-5-5": Object.freeze({ input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 }),
});

/** $10 per 1,000 searches; failed searches are not billed. */
export const WEB_SEARCH_PRICE_PER_SEARCH = 0.01;

const PER_MTOK = 1_000_000;

/** Looks up a model's prices, tolerating dated or prefixed IDs. */
export function priceFor(model) {
  if (!model) return null;
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];
  const key = Object.keys(MODEL_PRICES).find((k) => model.startsWith(k) || model.endsWith(k));
  return key ? MODEL_PRICES[key] : null;
}

/**
 * Estimates cost from per-model token usage and a search count.
 * usageByModel: { [model]: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens } }
 * If any model has no known price, `complete` is false and its tokens are excluded.
 */
export function estimateCost(usageByModel, searches) {
  let tokens = 0;
  const unpricedModels = [];
  for (const [model, u] of Object.entries(usageByModel)) {
    const p = priceFor(model);
    if (!p) {
      unpricedModels.push(model);
      continue;
    }
    tokens +=
      ((u.input_tokens ?? 0) * p.input +
        (u.output_tokens ?? 0) * p.output +
        (u.cache_creation_input_tokens ?? 0) * p.cacheWrite +
        (u.cache_read_input_tokens ?? 0) * p.cacheRead) /
      PER_MTOK;
  }
  const searchCost = searches * WEB_SEARCH_PRICE_PER_SEARCH;
  const round = (n) => Math.round(n * 1e6) / 1e6;
  return {
    currency: "USD",
    total: round(tokens + searchCost),
    tokens: round(tokens),
    searches: round(searchCost),
    complete: unpricedModels.length === 0,
    ...(unpricedModels.length ? { unpricedModels } : {}),
    note: "Estimate from response usage and published list prices; not an invoice.",
  };
}
