import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// MOCK_MODE=true (default) + LIVE_RESEARCH_ENABLED=true: mock unless a request explicitly asks for live.
process.env.NODE_ENV = "test";
process.env.MOCK_MODE = "true";
process.env.LIVE_RESEARCH_ENABLED = "true";
process.env.ANTHROPIC_API_KEY = "sk-ant-fake-key-for-tests";
process.env.APP_API_KEY = "test-app-key-0123456789abcdef0123456789";
process.env.RATE_LIMIT_MAX = "1000";
process.env.LIVE_RATE_LIMIT_MAX = "1000";

const { createApp } = await import("../src/app.js");
const { useClientForTesting } = await import("../src/services/claude.service.js");
const { buildMockReport } = await import("../src/agents/market-research/market-research.mock.js");
const { createFakeClient, blockNetwork, message, searchBlocks, reportCall } = await import("./helpers/fake-anthropic.js");

const URLS = ["market-report", "forecast", "trends", "subscriptions", "exampleco", "segments", "costs"].map((p) => `https://example.com/mock/${p}`);
let server, base, restore;
before(async () => {
  restore = blockNetwork();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); restore(); });

const post = (query = "", init = {}) =>
  fetch(`${base}/api/agents/market-research/run${query}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.APP_API_KEY}` },
    body: JSON.stringify({ business: "Rang Rivaaz, a clothing rental business", region: "Aligarh, India" }),
    ...init,
  });

test("health advertises live availability while mock stays the default", async () => {
  const b = await (await fetch(`${base}/health`)).json();
  assert.equal(b.mockMode, true);
  assert.equal(b.liveResearchAvailable, true);
});

test("no mode -> mock, and the Claude client is never touched", async () => {
  const fake = createFakeClient([]);
  useClientForTesting(fake);
  const b = await (await post()).json();
  assert.equal(b.mock, true);
  assert.equal(b.meta.mode, "mock");
  assert.equal(fake.calls.length, 0);
});

test("?mode=live -> live research via the (fake) client; response marked live", async () => {
  const fake = createFakeClient([message({ content: [...searchBlocks(URLS), reportCall(buildMockReport({ business: "x" }))], searches: 1 })]);
  useClientForTesting(fake);
  const res = await post("?mode=live");
  const b = await res.json();
  assert.equal(res.status, 200);
  assert.equal(b.mock, false);
  assert.equal(b.meta.mode, "live");
  assert.equal(fake.calls.length, 1);
  assert.ok(b.meta.usage && b.meta.estimatedCostUsd, "usage and cost reported");
});

test("live failure is reported, never replaced with mock data", async () => {
  useClientForTesting(createFakeClient([message({ stop_reason: "refusal", stop_details: { type: "refusal", category: null } })]));
  const res = await post("?mode=live");
  assert.equal(res.status, 422);
  const b = await res.json();
  assert.equal(b.error.code, "REQUEST_DECLINED");
  assert.equal(b.report, undefined);
});

test("invalid mode is rejected before any work", async () => {
  const fake = createFakeClient([]);
  useClientForTesting(fake);
  const res = await post("?mode=turbo");
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "INVALID_MODE");
  assert.equal(fake.calls.length, 0);
});

test("identical live research cannot run twice at once (409), and is not retried", async () => {
  const fake = createFakeClient([{ hang: true }]);
  useClientForTesting(fake);
  const controller = new AbortController();
  const first = post("?mode=live", { signal: controller.signal }).catch(() => null);
  await new Promise((r) => setTimeout(r, 50));
  const second = await post("?mode=live");
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error.code, "RESEARCH_IN_PROGRESS");
  controller.abort();
  await first;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fake.calls.length, 1, "only the first request reached Claude");
});
