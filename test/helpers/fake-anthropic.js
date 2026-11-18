/**
 * Scripted stand-in for the Anthropic client. No network.
 * Each script step is a message object, an Error to throw, a function(body) -> step,
 * or { hang: true } (never resolves until the request's AbortSignal fires).
 */
import * as sdk from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-5-5";

export function createFakeClient(script) {
  const steps = [...script];
  const calls = [];

  function stream(endpoint) {
    return (body, options = {}) => {
      const call = { endpoint, body: structuredClone(body), hasSignal: Boolean(options.signal), aborted: false };
      calls.push(call);
      return {
        finalMessage: async () => {
          if (steps.length === 0) throw new Error("Fake client: no scripted response left");
          let step = steps.shift();
          if (typeof step === "function") step = step(body);
          if (step instanceof Error) throw step;
          if (step?.hang) {
            return new Promise((_, reject) => {
              const abort = () => {
                call.aborted = true;
                reject(new sdk.APIUserAbortError());
              };
              if (options.signal?.aborted) return abort();
              options.signal?.addEventListener("abort", abort, { once: true });
            });
          }
          return structuredClone(step);
        },
      };
    };
  }

  return {
    calls,
    remaining: () => steps.length,
    messages: { stream: stream("messages") },
    beta: { messages: { stream: stream("beta.messages") } },
  };
}

/** Makes every non-local network call fail the test (local test servers are allowed). */
export function blockNetwork() {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url?.url ?? url);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(href)) return original(url, init);
    throw new Error(`Network call attempted in an offline test: ${href}`);
  };
  return () => (globalThis.fetch = original);
}

// ---- response builders -------------------------------------------------------

let n = 0;
const id = (p) => `${p}_${++n}`;

export function usage(extra = {}) {
  return { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 0 }, ...extra };
}

export function searchBlocks(urls, { caller } = {}) {
  const sid = id("srvtoolu");
  return [
    { type: "server_tool_use", id: sid, name: "web_search", input: { query: "q" }, ...(caller ? { caller } : {}) },
    {
      type: "web_search_tool_result",
      tool_use_id: sid,
      ...(caller ? { caller } : {}),
      content: urls.map((url) => ({ type: "web_search_result", url, title: `Title of ${url}`, encrypted_content: "enc", page_age: null })),
    },
  ];
}

export function searchError(code) {
  const sid = id("srvtoolu");
  return [
    { type: "server_tool_use", id: sid, name: "web_search", input: { query: "q" } },
    { type: "web_search_tool_result", tool_use_id: sid, content: { type: "web_search_tool_result_error", error_code: code } },
  ];
}

export function reportCall(report) {
  return { type: "tool_use", id: id("toolu"), name: "submit_research_report", input: report };
}

export function message({ stop_reason = "tool_use", content = [], searches = 0, model = MODEL, usage: u = {}, stop_details = null } = {}) {
  return {
    id: id("msg"),
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason,
    stop_details,
    usage: usage({ server_tool_use: { web_search_requests: searches }, ...u }),
  };
}

export { sdk };
