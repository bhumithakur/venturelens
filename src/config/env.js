import dotenv from "dotenv";

dotenv.config({ quiet: true });

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function readBool(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

/**
 * Strict: the whole value must be decimal digits (surrounding whitespace allowed).
 * Rejects "10abc", "3000.9", "-5", "+5", "1e3", "0x10", 0 and unsafe integers.
 */
function readPositiveInt(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const text = String(raw).trim();
  const n = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer (got "${raw}")`);
  }
  return n;
}

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];

function readEnum(env, name, allowed, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const v = String(raw).trim().toLowerCase();
  if (!allowed.includes(v)) {
    throw new Error(`${name} must be one of ${allowed.join(", ")} (got "${raw}")`);
  }
  return v;
}

function readNonNegativeInt(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) {
    throw new Error(`${name} must be a non-negative integer (got "${raw}")`);
  }
  return Number(text);
}

export const RESEARCH_MODES = ["mock", "live"];

/**
 * Decides the mode for one request. Never silently switches: an explicit "live" request
 * on a server without live research enabled is rejected, not served from mock data.
 * Returns "mock" | "live", or throws { status, code, message }.
 */
export function resolveResearchMode(cfg, requested) {
  if (requested === undefined || requested === null || requested === "") return cfg.mockMode ? "mock" : "live";
  if (!RESEARCH_MODES.includes(requested)) {
    throw Object.assign(new Error(`mode must be "mock" or "live"`), { status: 400, code: "INVALID_MODE" });
  }
  if (requested === "live" && !cfg.liveResearchEnabled) {
    throw Object.assign(new Error("Live research is not enabled on this server"), { status: 403, code: "LIVE_RESEARCH_DISABLED" });
  }
  return requested;
}

/** Pure function: builds the config object from an env-like object. */
export function loadConfig(env = process.env) {
  return Object.freeze({
    // Missing NODE_ENV is treated as production, so a forgotten variable can never
    // switch on verbose error output.
    nodeEnv: env.NODE_ENV || "production",
    port: readPositiveInt(env, "PORT", 3000),

    // Internal error messages are sent to clients ONLY when NODE_ENV is explicitly
    // "development" or "test". They are always logged server-side.
    exposeErrorDetails: env.NODE_ENV === "development" || env.NODE_ENV === "test",

    // Reverse-proxy hops to trust for the client IP (X-Forwarded-For). Production runs behind
    // exactly one proxy (Caddy), so it defaults to 1 there; elsewhere 0, because trusting the
    // header without a proxy in front would let any client forge its IP.
    trustProxyHops: readNonNegativeInt(env, "TRUST_PROXY_HOPS", env.NODE_ENV === "production" ? 1 : 0),

    // Key clients must send to call protected endpoints. Unrelated to ANTHROPIC_API_KEY.
    appApiKey: env.APP_API_KEY || "",

    rateLimit: Object.freeze({
      windowMs: readPositiveInt(env, "RATE_LIMIT_WINDOW_MS", 60_000),
      max: readPositiveInt(env, "RATE_LIMIT_MAX", 10),
    }),

    // Default research mode when a request does not ask for one. Defaults to true so a
    // missing .env can never spend API credits by accident.
    mockMode: readBool(env.MOCK_MODE, true),

    // Allows a request to explicitly ask for live research (?mode=live) while MOCK_MODE=true.
    // Off by default. With MOCK_MODE=false, live research is the default and always allowed.
    liveResearchEnabled: readBool(env.LIVE_RESEARCH_ENABLED, false) || !readBool(env.MOCK_MODE, true),

    // Extra cap on LIVE runs only (they cost money), per client IP.
    liveRateLimit: Object.freeze({
      windowMs: readPositiveInt(env, "LIVE_RATE_LIMIT_WINDOW_MS", 3_600_000),
      max: readPositiveInt(env, "LIVE_RATE_LIMIT_MAX", 5),
    }),

    claude: Object.freeze({
      apiKey: env.ANTHROPIC_API_KEY || "",
      model: env.CLAUDE_MODEL || "claude-sonnet-5-5",
      effort: readEnum(env, "CLAUDE_EFFORT", EFFORT_LEVELS, "medium"),
      maxTokens: readPositiveInt(env, "CLAUDE_MAX_TOKENS", 16000),
      // Per-request timeout (one API call).
      timeoutMs: readPositiveInt(env, "CLAUDE_TIMEOUT_MS", 120000),
      // Deadline for a whole agent run, across all API calls.
      runTimeoutMs: readPositiveInt(env, "CLAUDE_RUN_TIMEOUT_MS", 180000),
      // Max API requests per run (initial + pause_turn continuations + nudge + correction).
      maxTurns: readPositiveInt(env, "CLAUDE_MAX_TURNS", 5),
      // SDK-level automatic retries per request (429/5xx/connection errors). 0 = never retry.
      maxRetries: readNonNegativeInt(env, "CLAUDE_MAX_RETRIES", 0),
      // Server-side refusal fallback (beta). Off unless explicitly enabled.
      refusalFallback: readBool(env.CLAUDE_REFUSAL_FALLBACK, false),
    }),

    webSearch: Object.freeze({
      toolType: env.WEB_SEARCH_TOOL_TYPE || "web_search_20260209",
      // Per API request (enforced by Anthropic).
      maxUses: readPositiveInt(env, "WEB_SEARCH_MAX_USES", 2),
      // Per agent run (enforced by us: no further continuation once reached).
      maxTotal: readPositiveInt(env, "WEB_SEARCH_MAX_TOTAL", 4),
    }),
  });
}

export const APP_API_KEY_PLACEHOLDER = "replace-with-a-long-random-string";
export const APP_API_KEY_MIN_LENGTH = 32;

/** Fails fast on startup if required secrets are missing or unsafe. */
export function assertConfig(cfg) {
  if (!cfg.appApiKey) {
    throw new Error(
      "APP_API_KEY is not set. Generate one (e.g. `openssl rand -hex 32`) and put it in .env."
    );
  }
  if (cfg.appApiKey === APP_API_KEY_PLACEHOLDER) {
    throw new Error("APP_API_KEY still has the placeholder value from .env.example. Replace it.");
  }
  if (cfg.appApiKey.length < APP_API_KEY_MIN_LENGTH) {
    throw new Error(`APP_API_KEY must be at least ${APP_API_KEY_MIN_LENGTH} characters.`);
  }
  if (cfg.claude.apiKey && cfg.appApiKey === cfg.claude.apiKey) {
    throw new Error("APP_API_KEY must not be the same value as ANTHROPIC_API_KEY.");
  }
  if (cfg.liveResearchEnabled && !cfg.claude.apiKey) {
    throw new Error(
      "Live research is enabled (MOCK_MODE=false or LIVE_RESEARCH_ENABLED=true) but ANTHROPIC_API_KEY is not set. " +
        "Set the key in .env, or disable live research."
    );
  }
}

export const config = loadConfig();
