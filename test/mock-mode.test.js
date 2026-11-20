import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// Configure BEFORE importing app code (config is read at import time).
process.env.MOCK_MODE = "true";
process.env.ANTHROPIC_API_KEY = ""; // prove no Anthropic key is needed
process.env.LIVE_RESEARCH_ENABLED = "false"; // pin: don't inherit a developer's local .env
process.env.APP_API_KEY = "test-app-key-0123456789abcdef0123456789";
process.env.RATE_LIMIT_MAX = "1000"; // keep the limiter out of the way here

const { createApp } = await import("../src/app.js");
const { isClientInitialized } = await import("../src/services/claude.service.js");

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (path, body, raw = false) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.APP_API_KEY}` },
    body: raw ? body : JSON.stringify(body),
  });

test("GET /health reports mock mode and the registered agent", async () => {
  const body = await (await fetch(`${base}/health`)).json();
  assert.equal(body.status, "ok");
  assert.equal(body.mockMode, true);
  assert.deepEqual(body.agents, ["market-research", "growth-plan"]);
});

test("POST run returns a schema-valid mock report", async () => {
  const res = await post("/api/agents/market-research/run", { business: "handmade candle shop", region: "India" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mock, true);
  assert.equal(body.agent, "market-research");
  assert.equal(body.input.region, "India");
  assert.ok(body.report.market_size.length > 0);
  assert.equal(body.meta.mode, "mock");
});

test("invalid input returns 400 with details", async () => {
  const res = await post("/api/agents/market-research/run", { industry: "retail" });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.ok(body.error.details.length > 0);
});

test("malformed JSON returns 400", async () => {
  const res = await post("/api/agents/market-research/run", "{not json", true);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "INVALID_JSON");
});

test("unknown agent returns 404", async () => {
  const res = await post("/api/agents/nope/run", { business: "candle shop" });
  assert.equal(res.status, 404);
});

test("mock mode never initialised the Anthropic client", () => {
  assert.equal(isClientInitialized(), false);
});

test("default server: live research unavailable; ?mode=live is refused, never served as mock", async () => {
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.liveResearchAvailable, false);
  const res = await post("/api/agents/market-research/run?mode=live", { business: "handmade candle shop" });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, "LIVE_RESEARCH_DISABLED");
  assert.equal(body.report, undefined);
  assert.equal(isClientInitialized(), false);
});
