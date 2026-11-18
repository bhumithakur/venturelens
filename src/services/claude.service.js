import { config as defaultConfig } from "../config/env.js";
import { AppError, ClientClosedError } from "../errors.js";
import { estimateCost } from "./pricing.js";

/**
 * The ONLY file that touches the Anthropic SDK.
 *
 * - The SDK is loaded with a dynamic import() on first live use, so in
 *   MOCK_MODE the package is never even loaded.
 * - The client is created on first use, never at import or server start.
 *
 * Verified against platform.claude.com docs on 2026-11-18:
 *   web search (web_search_20260209, dynamic filtering, result/error blocks,
 *   pause_turn), refusals and server-side
 *   fallback (server-side-fallback-2026-07-01, fallbacks: "default"), pricing.
 */

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_CORRECTIONS = 1; // one correction round for schema/source problems
const MAX_NUDGES = 1; // one reminder if Claude ends without submitting the report

let sdkPromise = null;
const loadSdk = () => (sdkPromise ??= import("@anthropic-ai/sdk"));

let clientPromise = null;

export function getClient() {
  if (!clientPromise) {
    if (!defaultConfig.claude.apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set (live mode requires it).");
    }
    clientPromise = loadSdk().then(
      ({ default: Anthropic }) =>
        new Anthropic({
          apiKey: defaultConfig.claude.apiKey,
          timeout: defaultConfig.claude.timeoutMs,
          maxRetries: defaultConfig.claude.maxRetries, // default 1; the smoke test uses 0
        })
    );
  }
  return clientPromise;
}

/**
 * TESTS ONLY: make the production generate() use a fake client.
 * Refuses to run outside NODE_ENV=test so it cannot be misused in production.
 */
export function useClientForTesting(client) {
  if (process.env.NODE_ENV !== "test") throw new Error("useClientForTesting is only available when NODE_ENV=test");
  clientPromise = Promise.resolve(client);
}

/** For tests and diagnostics: has a client ever been requested? */
export function isClientInitialized() {
  return clientPromise !== null;
}

/**
 * Creates a generate() bound to a config and a client source.
 * Tests inject a fake client; production uses the lazy real one.
 */
export function createClaudeService({ config = defaultConfig, getClient: clientSource = getClient, sdk = loadSdk } = {}) {
  /**
   * Runs one agent task: research with web search, then submit via a report tool.
   *
   *   generate({ system, messages, tools, outputSchema, reviewOutput, signal })
   *     -> { output, searchResults, meta }
   *
   * reviewOutput(output, { searchResults }) returns null to accept, or a string
   * of feedback to request ONE correction. After that, output is returned as-is
   * and the caller does final enforcement.
   *
   * Never restarts a whole run. Every API request counts toward maxTurns.
   */
  return async function generate({ system, messages, tools = [], outputSchema, reviewOutput, signal }) {
    const cfg = config.claude;
    const errors = await sdk();
    const client = await clientSource();

    const deadline = AbortSignal.timeout(cfg.runTimeoutMs);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;

    const reportTool = {
      name: outputSchema.name,
      description: outputSchema.description,
      // Not strict: the strict grammar for this schema exceeds Anthropic's compiled-grammar
      // limit (400, 2026-11-18). The full schema is sent as guidance and enforced locally
      // with Ajv, with one correction round for invalid reports.
      input_schema: outputSchema.schema,
    };

    const conversation = [...messages];
    const state = {
      turns: 0,
      continuations: 0,
      nudges: 0,
      corrections: 0,
      searches: 0,
      searchErrors: {},
      searchResults: [],
      usageByModel: {},
      servedBy: null,
      fallback: null,
      stopReasons: [],
    };

    const meta = () => buildMeta(cfg.model, state, config.claude.refusalFallback);

    while (true) {
      if (state.turns >= cfg.maxTurns) {
        throw new AppError(504, "RESEARCH_INCOMPLETE", "Research did not finish within the request budget", {
          reason: "max_turns",
          meta: meta(),
        });
      }
      state.turns += 1;

      const body = {
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        system,
        tools: [...tools, reportTool],
        // tool_choice stays "auto" (default): Sonnet 5.5 rejects forced tool choice.
        output_config: { effort: cfg.effort },
        cache_control: { type: "ephemeral" }, // auto-cache the growing prefix across turns
        messages: conversation,
      };

      let message;
      try {
        message = await send(client, body, cfg.refusalFallback, combined);
      } catch (err) {
        throw mapError(err, { errors, clientSignal: signal, deadline, meta });
      }

      record(state, message);

      switch (message.stop_reason) {
        case "refusal":
          throw new AppError(422, "REQUEST_DECLINED", "The AI model declined this request", {
            category: message.stop_details?.category ?? null,
            meta: meta(),
          });

        case "max_tokens":
          throw new AppError(502, "OUTPUT_TRUNCATED", "The AI response was cut off before the report was complete", {
            meta: meta(),
          });

        case "pause_turn":
          if (state.searches >= config.webSearch.maxTotal) {
            throw new AppError(504, "RESEARCH_INCOMPLETE", "Research did not finish within the search budget", {
              reason: "search_budget",
              meta: meta(),
            });
          }
          // Resume: send the paused assistant turn back unchanged, no extra user message.
          conversation.push({ role: "assistant", content: echoable(message.content) });
          state.continuations += 1;
          continue;

        default: {
          const reportCalls = message.content.filter((b) => b.type === "tool_use" && b.name === reportTool.name);

          if (reportCalls.length === 0) {
            if (state.nudges >= MAX_NUDGES) {
              throw new AppError(502, "NO_REPORT", "The AI finished without submitting a report", { meta: meta() });
            }
            state.nudges += 1;
            conversation.push({ role: "assistant", content: echoable(message.content) });
            conversation.push({
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    `Submit your report now by calling the ${reportTool.name} tool once. ` +
                    "Use only sources from your search results. Do not run more searches.",
                },
              ],
            });
            continue;
          }

          const [report] = reportCalls;
          let feedback = null;
          if (reviewOutput && state.corrections < MAX_CORRECTIONS) {
            try {
              feedback = await reviewOutput(report.input, { searchResults: state.searchResults });
            } catch (err) {
              // A bug in checking must not hide the run's cost behind a generic 500.
              // Server log: error class + message capped at 200 chars, never the report; the client gets a safe message.
              console.error(`[claude review_failed] ${err?.name ?? "Error"}: ${String(err?.message ?? err).slice(0, 200)}`);
              throw new AppError(502, "INVALID_AGENT_OUTPUT", "The AI report could not be checked", { meta: meta() });
            }
          }

          if (!feedback) {
            return { output: report.input, searchResults: state.searchResults, meta: meta() };
          }

          // One correction round: return the problems as a tool error.
          state.corrections += 1;
          conversation.push({ role: "assistant", content: echoable(message.content) });
          conversation.push({
            role: "user",
            content: message.content
              .filter((b) => b.type === "tool_use")
              .map((b) => ({
                type: "tool_result",
                tool_use_id: b.id,
                is_error: true,
                content:
                  b.id === report.id
                    ? `${feedback}\nFix these problems and call ${reportTool.name} again. Do not run more searches.`
                    : "Ignored: only one report submission is accepted.",
              })),
          });
          continue;
        }
      }
    }
  };
}

/** Production generate(): lazy real client, global config. */
export const generate = createClaudeService();

// ---- internals ---------------------------------------------------------------

function send(client, body, refusalFallback, signal) {
  if (refusalFallback) {
    return client.beta.messages
      .stream({ ...body, betas: [FALLBACK_BETA], fallbacks: "default" }, { signal })
      .finalMessage();
  }
  return client.messages.stream(body, { signal }).finalMessage();
}

/** Collects searches, search results/errors, usage and fallback info from one response. */
function record(state, message) {
  state.stopReasons.push(message.stop_reason);
  state.servedBy = message.model ?? state.servedBy;
  state.searches += message.usage?.server_tool_use?.web_search_requests ?? 0;

  // Tokens: usage.iterations (present with fallback) is the per-attempt billed
  // record; otherwise top-level usage belongs to message.model.
  const iterations = Array.isArray(message.usage?.iterations) ? message.usage.iterations : null;
  if (iterations && iterations.length) {
    for (const it of iterations) addUsage(state, it.model ?? message.model, it);
  } else {
    addUsage(state, message.model, message.usage ?? {});
  }

  for (const block of message.content ?? []) {
    // Includes nested results from dynamic filtering (those carry a `caller` field).
    if (block.type === "web_search_tool_result") {
      if (Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r?.type === "web_search_result" && r.url) {
            state.searchResults.push({ url: r.url, title: r.title ?? "", page_age: r.page_age ?? null });
          }
        }
      } else if (block.content?.type === "web_search_tool_result_error") {
        const code = block.content.error_code ?? "unknown";
        state.searchErrors[code] = (state.searchErrors[code] ?? 0) + 1;
      }
    }
    if (block.type === "fallback") {
      state.fallback = {
        from: block.from?.model ?? null,
        to: block.to?.model ?? null,
        category: block.trigger?.category ?? null,
      };
    }
  }
  if (!state.fallback && iterations?.some((it) => it.type === "fallback_message")) {
    state.fallback = { from: null, to: message.model, category: null }; // sticky routing
  }
}

function addUsage(state, model, u) {
  const key = model ?? "unknown";
  const t = (state.usageByModel[key] ??= {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  });
  for (const f of Object.keys(t)) t[f] += u?.[f] ?? 0;
}

/**
 * Content to send back on the next request. Normally unchanged (required for
 * encrypted search content and thinking). After a server-side fallback, the
 * documented rule is: before the final `fallback` block, drop thinking,
 * redacted_thinking, connector_text and client tool_use blocks, and any
 * server_tool_use without a matching result.
 */
export function echoable(content) {
  const lastFallback = content.map((b) => b.type).lastIndexOf("fallback");
  if (lastFallback === -1) return content;
  const resultIds = new Set(content.filter((b) => b.tool_use_id).map((b) => b.tool_use_id));
  return content.filter((b, i) => {
    if (i >= lastFallback) return true;
    if (["thinking", "redacted_thinking", "connector_text", "tool_use"].includes(b.type)) return false;
    if (b.type === "server_tool_use") return resultIds.has(b.id);
    return true;
  });
}

function buildMeta(requestedModel, state, fallbackEnabled) {
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  for (const u of Object.values(state.usageByModel)) for (const f of Object.keys(usage)) usage[f] += u[f];
  return {
    mode: "live",
    model: requestedModel,
    servedBy: state.servedBy,
    refusalFallback: { enabled: fallbackEnabled, used: Boolean(state.fallback), ...(state.fallback ?? {}) },
    turns: state.turns,
    continuations: state.continuations,
    nudges: state.nudges,
    corrections: state.corrections,
    stopReasons: state.stopReasons,
    searches: state.searches,
    searchErrors: state.searchErrors,
    searchResultsSeen: state.searchResults.length,
    usage,
    usageByModel: state.usageByModel,
    estimatedCostUsd: estimateCost(state.usageByModel, state.searches),
  };
}

/** Maps SDK errors to client-safe AppErrors. Never includes keys or raw upstream bodies. */
function mapError(err, { errors, clientSignal, deadline, meta }) {
  if (err instanceof AppError) return err;
  if (clientSignal?.aborted) return new ClientClosedError();
  if (deadline.aborted) {
    return new AppError(504, "UPSTREAM_TIMEOUT", "Research took too long and was stopped", { meta: meta() });
  }
  if (errors.APIConnectionTimeoutError && err instanceof errors.APIConnectionTimeoutError) {
    return new AppError(504, "UPSTREAM_TIMEOUT", "The AI provider did not respond in time", { meta: meta() });
  }
  if (err instanceof errors.RateLimitError) {
    const retryAfter = safeRetryAfter(err);
    return new AppError(
      503,
      "UPSTREAM_RATE_LIMITED",
      "The AI provider is rate limiting requests; try again later",
      { meta: meta() },
      retryAfter ? { "Retry-After": retryAfter } : undefined
    );
  }
  if (err instanceof errors.AuthenticationError || err instanceof errors.PermissionDeniedError) {
    logUpstream("auth", err);
    return new AppError(500, "UPSTREAM_CONFIG_ERROR", "The AI provider rejected the server's credentials");
  }
  if (err instanceof errors.BadRequestError) {
    logUpstream("bad_request", err);
    return new AppError(500, "UPSTREAM_BAD_REQUEST", "The AI provider rejected the request", { meta: meta() });
  }
  if (err instanceof errors.APIError && (err.status === 529 || (err.status ?? 0) >= 500)) {
    return new AppError(503, "UPSTREAM_UNAVAILABLE", "The AI provider is temporarily unavailable", { meta: meta() });
  }
  if (err instanceof errors.APIConnectionError) {
    return new AppError(503, "UPSTREAM_UNAVAILABLE", "Could not reach the AI provider", { meta: meta() });
  }
  return err; // unexpected: the error handler logs it and returns a generic 500
}

function safeRetryAfter(err) {
  const v = err.headers?.get?.("retry-after");
  return v && /^\d+$/.test(v) ? v : null;
}

function logUpstream(kind, err) {
  // Status, request ID, error type and Anthropic's sanitized explanation.
  // Never headers or request bodies. Logged server-side only; clients get a generic message.
  console.error(
    `[claude ${kind}] status=${err.status} request_id=${err.requestID ?? "n/a"} ` +
      `type=${err.error?.error?.type ?? "n/a"} message=${JSON.stringify(sanitizeUpstreamMessage(err.error?.error?.message))}`
  );
}

/** Removes anything key-like from an upstream error message and caps its length. */
export function sanitizeUpstreamMessage(message, secrets = [defaultConfig.claude.apiKey, defaultConfig.appApiKey]) {
  if (typeof message !== "string" || !message) return "n/a";
  let out = message;
  for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join("[REDACTED]");
  out = out
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, "$1[REDACTED]")
    .replace(/[\u0000-\u001f\u007f]/g, " ");
  return out.length > 1000 ? `${out.slice(0, 1000)}…` : out;
}
