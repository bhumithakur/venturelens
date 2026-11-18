import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// Live mode end to end over HTTP, with a FAKE Anthropic client and the network blocked.
process.env.NODE_ENV = "test";
process.env.MOCK_MODE = "false";
process.env.ANTHROPIC_API_KEY = "sk-ant-fake-key-for-tests";
process.env.APP_API_KEY = "test-app-key-0123456789abcdef0123456789";
process.env.RATE_LIMIT_MAX = "1000";
process.env.LIVE_RATE_LIMIT_MAX = "1000"; // this file sends many (fake) live runs; the cap has its own test

const { createApp } = await import("../src/app.js");
const { useClientForTesting } = await import("../src/services/claude.service.js");
const { buildMockReport } = await import("../src/agents/market-research/market-research.mock.js");
const { createFakeClient, blockNetwork, message, searchBlocks, reportCall } = await import("./helpers/fake-anthropic.js");

const URLS = [
  "https://example.com/mock/market-report", "https://example.com/mock/forecast", "https://example.com/mock/trends",
  "https://example.com/mock/subscriptions", "https://example.com/mock/exampleco", "https://example.com/mock/segments",
  "https://example.com/mock/costs",
];

let server, base, restoreFetch;
before(async () => {
  restoreFetch = blockNetwork();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  restoreFetch();
});

const post = (body, init = {}) =>
  fetch(`${base}/api/agents/market-research/run`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.APP_API_KEY}` },
    body: JSON.stringify(body),
    ...init,
  });

test("live run returns a sourced report with cost metadata", async () => {
  const fake = createFakeClient([
    message({ content: [...searchBlocks(URLS), reportCall(buildMockReport({ business: "candle shop" }))], searches: 2 }),
  ]);
  useClientForTesting(fake);
  const res = await post({ business: "handmade candle shop", region: "India" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mock, false);
  assert.equal(body.meta.mode, "live");
  assert.equal(body.meta.model, "claude-sonnet-5-5");
  assert.equal(body.meta.searches, 2);
  assert.ok(body.meta.usage.input_tokens > 0);
  assert.equal(typeof body.meta.estimatedCostUsd.total, "number");
  assert.deepEqual(body.meta.sourceCheck, { allowlistSize: URLS.length, removedSources: 0, droppedFindings: 0, downgradedFindings: 0, listingDowngrades: 0 });
  // The user's input is escaped inside the prompt.
  assert.match(fake.calls[0].body.messages[0].content, /<region>India<\/region>/);
});

test("invented source -> one correction round -> still invented -> removed, finding moved to gaps", async () => {
  const bad = buildMockReport({ business: "candle shop" });
  bad.trends[0].sources = [{ url: "https://invented.example/fake-stat", title: "Fake" }];
  const fake = createFakeClient([
    message({ content: [...searchBlocks(URLS), reportCall(bad)], searches: 1 }),
    message({ content: [reportCall(bad)] }), // ignores the correction
  ]);
  useClientForTesting(fake);
  const body = await (await post({ business: "candle shop" })).json();

  assert.equal(fake.calls.length, 2, "exactly one correction request");
  const correction = fake.calls[1].body.messages.at(-1).content[0];
  assert.equal(correction.is_error, true);
  assert.match(correction.content, /invented\.example/);

  assert.equal(body.meta.corrections, 1);
  assert.equal(body.meta.sourceCheck.droppedFindings, 1);
  assert.ok(!JSON.stringify(body.report).includes("invented.example"));
  assert.ok(body.report.research_gaps.some((g) => g.includes("trends")));
});

test("refusal maps to 422 over HTTP", async () => {
  useClientForTesting(createFakeClient([
    message({ stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null } }),
  ]));
  const res = await post({ business: "candle shop" });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error.code, "REQUEST_DECLINED");
});

test("client disconnect aborts the in-flight Claude request", async () => {
  const fake = createFakeClient([{ hang: true }]);
  useClientForTesting(fake);
  const controller = new AbortController();
  const pending = post({ business: "candle shop" }, { signal: controller.signal }).catch((e) => e);
  await new Promise((r) => setTimeout(r, 50));
  controller.abort();
  await pending;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].aborted, true);
});

test("auth and rate limiting still guard the live endpoint", async () => {
  const fake = createFakeClient([]);
  useClientForTesting(fake);
  const res = await post({ business: "candle shop" }, { headers: { "content-type": "application/json" } });
  assert.equal(res.status, 401);
  assert.equal(fake.calls.length, 0, "no Claude request without a valid key");
});

test("invalid input in live mode never reaches Claude", async () => {
  const fake = createFakeClient([]);
  useClientForTesting(fake);
  const res = await post({ business: "x" });
  assert.equal(res.status, 400);
  assert.equal(fake.calls.length, 0);
});

// Regression for the live failure "(... ?? []).forEach is not a function": a malformed
// finding section from Claude must go through the correction round, never crash.
const MALFORMED = {
  "JSON string": (r) => ({ ...r, trends: JSON.stringify(r.trends) }),
  object: (r) => ({ ...r, trends: { first: r.trends[0] } }),
};

for (const [label, malform] of Object.entries(MALFORMED)) {
  test(`malformed (${label}) section -> one correction round -> valid report succeeds`, async () => {
    const good = buildMockReport({ business: "candle shop" });
    const fake = createFakeClient([
      message({ content: [...searchBlocks(URLS), reportCall(malform(good))], searches: 1 }),
      message({ content: [reportCall(good)] }),
    ]);
    useClientForTesting(fake);
    const res = await post({ business: "candle shop" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(fake.calls.length, 2, "exactly one correction request");
    assert.equal(body.meta.corrections, 1);
    const correction = fake.calls[1].body.messages.at(-1).content[0];
    assert.equal(correction.is_error, true);
    assert.match(correction.content, /Schema: \/trends must be array/);
    assert.ok(!/Source not found/.test(correction.content), "source checks skipped for a schema-invalid report");
    assert.ok(Array.isArray(body.report.trends));
  });

  test(`malformed (${label}) section twice -> 502 INVALID_AGENT_OUTPUT with usage and cost`, async () => {
    const bad = malform(buildMockReport({ business: "candle shop" }));
    const fake = createFakeClient([
      message({ content: [...searchBlocks(URLS), reportCall(bad)], searches: 1, usage: { input_tokens: 4000, output_tokens: 700 } }),
      message({ content: [reportCall(bad)], usage: { input_tokens: 4500, output_tokens: 650 } }),
    ]);
    useClientForTesting(fake);
    const res = await post({ business: "candle shop" });
    assert.equal(res.status, 502);
    const { error } = await res.json();
    assert.equal(error.code, "INVALID_AGENT_OUTPUT");
    assert.equal(fake.calls.length, 2, "no further retries");
    assert.equal(error.details.meta.usage.input_tokens, 8500);
    assert.equal(error.details.meta.usage.output_tokens, 1350);
    assert.equal(error.details.meta.searches, 1);
    assert.ok(error.details.meta.estimatedCostUsd.total > 0);
  });
}
