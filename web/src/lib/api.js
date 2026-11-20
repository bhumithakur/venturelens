/**
 * Backend client. Calls same-origin paths; in development the Vite proxy forwards
 * them to Express and attaches the API key server-side. No secrets live here.
 */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, { ...options, headers: { "content-type": "application/json", ...options.headers } });
  } catch (err) {
    if (options.signal?.aborted) throw err; // caller cancelled: keep the AbortError
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the VentureLens backend.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.code ?? "HTTP_ERROR", e.message ?? `Request failed (${res.status})`, e.details);
  }
  return body;
}

export const api = {
  health: () => request("/health"),
  agents: () => request("/api/agents"),
  /**
   * input: { business, industry?, region?, notes? } (backend validates; unknown fields rejected)
   * mode: "mock" | "live" (always sent explicitly; the server rejects "live" unless it is enabled)
   */
  runMarketResearch: (input, { signal, mode = "mock" } = {}) =>
    request(`/api/agents/market-research/run?mode=${encodeURIComponent(mode)}`, { method: "POST", body: JSON.stringify(input), signal }),
  /** Synthesizes marketing recommendations + action plan from existing agent outputs (see lib/growthPlan.js). */
  runGrowthPlan: (input, { signal, mode = "mock" } = {}) =>
    request(`/api/agents/growth-plan/run?mode=${encodeURIComponent(mode)}`, { method: "POST", body: JSON.stringify(input), signal }),
};
