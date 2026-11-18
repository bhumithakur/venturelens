import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config/env.js";
import { createClaudeService, echoable } from "../src/services/claude.service.js";
import { resolveTools } from "../src/tools/index.js";
import { reportSchema } from "../src/agents/market-research/market-research.schema.js";
import { buildMockReport } from "../src/agents/market-research/market-research.mock.js";
import { ClientClosedError } from "../src/errors.js";
import {
  createFakeClient,
  blockNetwork,
  message,
  searchBlocks,
  searchError,
  reportCall,
  sdk,
  MODEL,
} from "./helpers/fake-anthropic.js";

let restoreFetch;
before(() => (restoreFetch = blockNetwork()));
after(() => restoreFetch());

const URLS = [
  "https://example.com/mock/market-report",
  "https://example.com/mock/forecast",
  "https://example.com/mock/trends",
  "https://example.com/mock/subscriptions",
  "https://example.com/mock/exampleco",
  "https://example.com/mock/segments",
  "https://example.com/mock/costs",
];
const REPORT = buildMockReport({ business: "candle shop" });

function setup(script, env = {}) {
  const config = loadConfig({ MOCK_MODE: "false", ANTHROPIC_API_KEY: "sk-ant-fake", ...env });
  const fake = createFakeClient(script);
  const generate = createClaudeService({ config, getClient: async () => fake });
  const run = (opts = {}) =>
    generate({
      system: "system prompt",
      messages: [{ role: "user", content: "research this" }],
      tools: resolveTools(["web_search"], config),
      outputSchema: { name: "submit_research_report", description: "Submit.", schema: reportSchema },
      ...opts,
    });
  return { fake, run, config };
}

const searchAndReport = () =>
  message({ content: [...searchBlocks(URLS), reportCall(REPORT)], searches: 1 });

// ---- request shape -----------------------------------------------------------

test("sends the verified request shape", async () => {
  const { fake, run } = setup([searchAndReport()]);
  await run();
  const [call] = fake.calls;
  const b = call.body;
  assert.equal(call.endpoint, "messages", "no beta endpoint unless refusal fallback is on");
  assert.equal(call.hasSignal, true);
  assert.equal(b.model, "claude-sonnet-5-5");
  assert.equal(b.max_tokens, 16000);
  assert.deepEqual(b.output_config, { effort: "medium" });
  assert.equal(b.tool_choice, undefined, "Sonnet 5.5 rejects forced tool_choice");
  assert.equal(b.thinking, undefined, "adaptive thinking is the default; never disabled");
  assert.deepEqual(b.cache_control, { type: "ephemeral" });
  assert.deepEqual(b.tools[0], { type: "web_search_20260209", name: "web_search", max_uses: 2, allowed_callers: ["direct"] });
  assert.equal(b.tools.some((t) => t.type?.startsWith("code_execution")), false, "no separate code execution tool");

  const reportTool = b.tools[1];
  assert.equal(reportTool.name, "submit_research_report");
  assert.equal(reportTool.strict, undefined, "strict grammar exceeded Anthropic's size limit; validated locally instead");
  assert.deepEqual(reportTool.input_schema, reportSchema, "complete report schema is sent unchanged");
});

// ---- happy path, usage and cost ---------------------------------------------

test("returns the report with usage, searches and estimated cost", async () => {
  const { run } = setup([
    message({
      content: [...searchBlocks(URLS), reportCall(REPORT)],
      searches: 2,
      usage: { input_tokens: 10000, output_tokens: 5000, cache_read_input_tokens: 2000 },
    }),
  ]);
  const { output, searchResults, meta } = await run();
  assert.deepEqual(output, REPORT);
  assert.equal(searchResults.length, URLS.length);
  assert.equal(meta.searches, 2);
  assert.equal(meta.servedBy, MODEL);
  assert.deepEqual(meta.usage, { input_tokens: 10000, output_tokens: 5000, cache_creation_input_tokens: 0, cache_read_input_tokens: 2000 });
  // 10000*2 + 5000*10 + 2000*0.10 per MTok = 0.0702; + 2 searches * $0.01 = 0.0902
  assert.equal(meta.estimatedCostUsd.tokens, 0.0702);
  assert.equal(meta.estimatedCostUsd.searches, 0.02);
  assert.equal(meta.estimatedCostUsd.total, 0.0902);
  assert.equal(meta.estimatedCostUsd.complete, true);
});

// ---- pause_turn ---------------------------------------------------------------

test("pause_turn is continued by re-sending the paused turn unchanged", async () => {
  const paused = message({ stop_reason: "pause_turn", content: searchBlocks(URLS.slice(0, 3)), searches: 1 });
  const { fake, run } = setup([paused, message({ content: [...searchBlocks(URLS.slice(3)), reportCall(REPORT)], searches: 1 })]);
  const { searchResults, meta } = await run();

  const second = fake.calls[1].body.messages;
  assert.equal(second.length, 2, "no extra 'continue' user message");
  assert.equal(second[1].role, "assistant");
  assert.deepEqual(second[1].content, paused.content, "paused content incl. encrypted_content sent back unchanged");
  assert.equal(searchResults.length, URLS.length, "results from both requests collected");
  assert.equal(meta.continuations, 1);
  assert.equal(meta.searches, 2);
});

test("stops (no continuation) once the run's search budget is used", async () => {
  const { fake, run } = setup([
    message({ stop_reason: "pause_turn", content: searchBlocks(URLS), searches: 4 }),
    searchAndReport(),
  ]);
  await assert.rejects(run, (e) => e.status === 504 && e.code === "RESEARCH_INCOMPLETE" && e.details.reason === "search_budget");
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.remaining(), 1, "no further request was made");
});

test("stops at CLAUDE_MAX_TURNS", async () => {
  const pause = () => message({ stop_reason: "pause_turn", content: searchBlocks([URLS[0]]), searches: 0 });
  const { fake, run } = setup([pause(), pause(), pause(), pause(), pause(), searchAndReport()]);
  await assert.rejects(run, (e) => e.status === 504 && e.details.reason === "max_turns");
  assert.equal(fake.calls.length, 5);
});

// ---- refusal, max_tokens ----------------------------------------------------

test("refusal returns 422 with the category and is not retried", async () => {
  const { fake, run } = setup([
    message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms", explanation: "x" } }),
    searchAndReport(),
  ]);
  await assert.rejects(run, (e) => e.status === 422 && e.code === "REQUEST_DECLINED" && e.details.category === "general_harms");
  assert.equal(fake.calls.length, 1);
});

test("max_tokens returns 502 OUTPUT_TRUNCATED and is not retried", async () => {
  const { fake, run } = setup([message({ stop_reason: "max_tokens", content: searchBlocks(URLS) }), searchAndReport()]);
  await assert.rejects(run, (e) => e.status === 502 && e.code === "OUTPUT_TRUNCATED");
  assert.equal(fake.calls.length, 1);
});

// ---- missing report, correction round ---------------------------------------

test("one reminder when Claude ends without the report", async () => {
  const { fake, run } = setup([
    message({ stop_reason: "end_turn", content: [...searchBlocks(URLS), { type: "text", text: "Here is my report..." }], searches: 1 }),
    message({ content: [reportCall(REPORT)] }),
  ]);
  const { meta } = await run();
  const msgs = fake.calls[1].body.messages;
  assert.equal(msgs.at(-1).role, "user");
  assert.match(msgs.at(-1).content[0].text, /submit_research_report/);
  assert.equal(meta.nudges, 1);
});

test("a second missing report fails with 502 NO_REPORT", async () => {
  const text = () => message({ stop_reason: "end_turn", content: [{ type: "text", text: "no tool" }] });
  const { run } = setup([text(), text(), searchAndReport()]);
  await assert.rejects(run, (e) => e.status === 502 && e.code === "NO_REPORT");
});

test("one correction round via a tool_result error, then the output is returned as-is", async () => {
  const first = message({ content: [...searchBlocks(URLS), reportCall(REPORT)], searches: 1 });
  const second = message({ content: [reportCall(REPORT)] });
  const { fake, run } = setup([first, second]);
  let reviews = 0;
  const { meta } = await run({
    reviewOutput: () => {
      reviews += 1;
      return "Source not found in your search results: https://made-up.example/x";
    },
  });
  assert.equal(reviews, 1, "review only runs before the single correction");
  assert.equal(meta.corrections, 1);
  const last = fake.calls[1].body.messages.at(-1);
  assert.equal(last.role, "user");
  assert.equal(last.content[0].type, "tool_result");
  assert.equal(last.content[0].tool_use_id, first.content.at(-1).id);
  assert.equal(last.content[0].is_error, true);
  assert.match(last.content[0].content, /made-up\.example/);
});

// ---- search results and errors ---------------------------------------------

test("search errors are counted, not thrown", async () => {
  const { meta } = await setup([
    message({ content: [...searchError("too_many_requests"), ...searchError("max_uses_exceeded"), ...searchBlocks(URLS), reportCall(REPORT)], searches: 1 }),
  ]).run();
  assert.deepEqual(meta.searchErrors, { too_many_requests: 1, max_uses_exceeded: 1 });
});

test("results from dynamic filtering (blocks with a caller field) are collected", async () => {
  const { searchResults } = await setup([
    message({ content: [...searchBlocks(URLS, { caller: { type: "code_execution_20260120", tool_id: "srvtoolu_x" } }), reportCall(REPORT)], searches: 1 }),
  ]).run();
  assert.equal(searchResults.length, URLS.length);
});

// ---- refusal fallback ---------------------------------------------------------

test("refusal fallback is off by default and uses the beta endpoint when enabled", async () => {
  const fallbackMsg = message({
    model: "claude-opus-5-5",
    content: [
      { type: "fallback", from: { model: MODEL }, to: { model: "claude-opus-5-5" }, trigger: { type: "refusal", category: "cyber" } },
      ...searchBlocks(URLS),
      reportCall(REPORT),
    ],
    searches: 1,
    usage: {
      iterations: [
        { type: "message", model: MODEL, input_tokens: 500, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        { type: "fallback_message", model: "claude-opus-5-5", input_tokens: 800, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      ],
    },
  });
  const { fake, run } = setup([fallbackMsg], { CLAUDE_REFUSAL_FALLBACK: "true" });
  const { meta } = await run();
  const call = fake.calls[0];
  assert.equal(call.endpoint, "beta.messages");
  assert.deepEqual(call.body.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(call.body.fallbacks, "default");
  assert.equal(meta.refusalFallback.used, true);
  assert.equal(meta.refusalFallback.category, "cyber");
  assert.equal(meta.servedBy, "claude-opus-5-5");
  assert.deepEqual(Object.keys(meta.usageByModel).sort(), ["claude-opus-5-5", MODEL].sort());
  assert.equal(meta.estimatedCostUsd.complete, false, "fallback model has no price in our table");

  assert.equal(loadConfig({}).claude.refusalFallback, false, "disabled by default");
});

test("echoable() drops pre-fallback thinking, client tool_use and unpaired server_tool_use", () => {
  const content = [
    { type: "thinking", thinking: "", signature: "s" },
    { type: "server_tool_use", id: "a", name: "web_search", input: {} },
    { type: "web_search_tool_result", tool_use_id: "a", content: [] },
    { type: "server_tool_use", id: "b", name: "web_search", input: {} },
    { type: "tool_use", id: "c", name: "submit_research_report", input: {} },
    { type: "text", text: "kept" },
    { type: "fallback", from: { model: "x" }, to: { model: "y" }, trigger: { type: "refusal", category: null } },
    { type: "thinking", thinking: "", signature: "t" },
  ];
  assert.deepEqual(echoable(content).map((b) => b.type + (b.id ? `:${b.id}` : "")), [
    "server_tool_use:a",
    "web_search_tool_result",
    "text",
    "fallback",
    "thinking",
  ]);
  const plain = [{ type: "thinking" }, { type: "text" }];
  assert.equal(echoable(plain), plain, "unchanged when there was no fallback");
});

// ---- upstream errors, timeouts, abort ---------------------------------------

const apiError = (status, headers = {}) =>
  sdk.APIError.generate(status, { type: "error", error: { type: "x", message: "upstream detail" } }, "upstream detail", new Headers(headers));

test("429 becomes 503 with Retry-After", async () => {
  const { run } = setup([apiError(429, { "retry-after": "30" })]);
  await assert.rejects(run, (e) => e.status === 503 && e.code === "UPSTREAM_RATE_LIMITED" && e.headers["Retry-After"] === "30");
});

test("529 overloaded becomes 503", async () => {
  const { run } = setup([apiError(529)]);
  await assert.rejects(run, (e) => e.status === 503 && e.code === "UPSTREAM_UNAVAILABLE");
});

test("401 becomes a generic 500 without upstream detail or key", async () => {
  const { run } = setup([apiError(401)]);
  await assert.rejects(run, (e) => {
    assert.equal(e.status, 500);
    assert.equal(e.code, "UPSTREAM_CONFIG_ERROR");
    assert.ok(!JSON.stringify({ m: e.message, d: e.details }).includes("sk-ant-fake"));
    assert.ok(!e.message.includes("upstream detail"));
    return true;
  });
});

test("400 from the API becomes a generic 500", async () => {
  const { run } = setup([apiError(400)]);
  await assert.rejects(run, (e) => e.status === 500 && e.code === "UPSTREAM_BAD_REQUEST");
});

test("run deadline aborts the in-flight request with 504", async () => {
  const { fake, run } = setup([{ hang: true }], { CLAUDE_RUN_TIMEOUT_MS: "50" });
  await assert.rejects(run, (e) => e.status === 504 && e.code === "UPSTREAM_TIMEOUT");
  assert.equal(fake.calls[0].aborted, true);
});

test("client abort stops the request and is not retried", async () => {
  const { fake, run } = setup([{ hang: true }, searchAndReport()]);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(() => run({ signal: controller.signal }), ClientClosedError);
  assert.equal(fake.calls[0].aborted, true);
  assert.equal(fake.remaining(), 1, "no new request after the abort");
});

test("a failed run is never restarted", async () => {
  const { fake, run } = setup([apiError(500), searchAndReport(), searchAndReport()]);
  await assert.rejects(run, (e) => e.status === 503);
  assert.equal(fake.calls.length, 1);
});

test("400 logs Anthropic's explanation, sanitized, server-side only", async () => {
  const { sanitizeUpstreamMessage } = await import("../src/services/claude.service.js");
  const err = sdk.APIError.generate(
    400,
    { type: "error", error: { type: "invalid_request_error", message: "tools.1: bad schema near sk-ant-api03-SECRETVALUE123 for key MYAPPKEY12345678" } },
    "x",
    new Headers({ "request-id": "req_test" })
  );
  const logged = [];
  const original = console.error;
  console.error = (...a) => logged.push(a.join(" "));
  try {
    const { run } = setup([err]);
    await assert.rejects(run, (e) => {
      assert.equal(e.code, "UPSTREAM_BAD_REQUEST");
      assert.ok(!JSON.stringify({ m: e.message, d: e.details }).includes("bad schema"), "explanation not sent to clients");
      return true;
    });
  } finally {
    console.error = original;
  }
  assert.match(logged[0], /request_id=req_test type=invalid_request_error message="tools\.1: bad schema/);
  assert.ok(!logged[0].includes("SECRETVALUE123"));
  assert.equal(sanitizeUpstreamMessage("key MYAPPKEY12345678 here", ["MYAPPKEY12345678"]), "key [REDACTED] here");
  assert.equal(sanitizeUpstreamMessage("x".repeat(1500)).length, 1001);
  assert.equal(sanitizeUpstreamMessage(undefined), "n/a");
});

test("an unexpected error in the review step returns 502 with usage and cost, not a generic 500", async () => {
  const { run } = setup([message({ content: [...searchBlocks(URLS), reportCall(REPORT)], searches: 1, usage: { input_tokens: 5000, output_tokens: 900 } })]);
  const logged = [];
  const original = console.error;
  console.error = (...a) => logged.push(a.join(" "));
  try {
    await assert.rejects(
      () => run({ reviewOutput: () => { throw new TypeError("boom internal detail"); } }),
      (e) => {
        assert.equal(e.status, 502);
        assert.equal(e.code, "INVALID_AGENT_OUTPUT");
        assert.ok(!e.message.includes("boom"), "internal error not exposed to the client");
        assert.equal(e.details.meta.usage.input_tokens, 5000);
        assert.equal(e.details.meta.searches, 1);
        assert.ok(e.details.meta.estimatedCostUsd.total > 0);
        return true;
      }
    );
  } finally {
    console.error = original;
  }
  assert.match(logged[0], /review_failed\] TypeError/);
});
