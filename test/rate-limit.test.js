import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.MOCK_MODE = "true";
process.env.APP_API_KEY = "test-app-key-0123456789abcdef0123456789";
process.env.RATE_LIMIT_MAX = "2";
process.env.RATE_LIMIT_WINDOW_MS = "60000";

const { createApp } = await import("../src/app.js");
const { marketResearchAgent } = await import("../src/agents/market-research/market-research.agent.js");
const { createRateLimiter } = await import("../src/middleware/rate-limit.js");
const { loadConfig } = await import("../src/config/env.js");

let runs = 0;
const realRun = marketResearchAgent.run;
marketResearchAgent.run = async (input) => {
  runs += 1;
  return realRun.call(marketResearchAgent, input);
};

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  marketResearchAgent.run = realRun;
  server.close();
});

const run = () =>
  fetch(`${base}/api/agents/market-research/run`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.APP_API_KEY}` },
    body: JSON.stringify({ business: "handmade candle shop" }),
  });

test("requests over the limit get 429 and never execute the agent", async () => {
  const first = await run();
  const second = await run();
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.headers.get("ratelimit-remaining"), "0");
  assert.equal(runs, 2);

  const third = await run();
  assert.equal(third.status, 429);
  assert.equal((await third.json()).error.code, "RATE_LIMITED");
  assert.ok(Number(third.headers.get("retry-after")) > 0);
  assert.equal(runs, 2, "agent must not run once the limit is exceeded");
});

test("health endpoint is not rate limited", async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
});

test("limits come from config", () => {
  const cfg = loadConfig({ RATE_LIMIT_MAX: "5", RATE_LIMIT_WINDOW_MS: "1000" });
  assert.deepEqual({ ...cfg.rateLimit }, { windowMs: 1000, max: 5 });
  assert.deepEqual({ ...loadConfig({}).rateLimit }, { windowMs: 60000, max: 10 });
  assert.throws(() => loadConfig({ RATE_LIMIT_MAX: "0" }), /RATE_LIMIT_MAX/);
  assert.throws(() => loadConfig({ RATE_LIMIT_WINDOW_MS: "abc" }), /RATE_LIMIT_WINDOW_MS/);
});

test("limiter resets after the window and tracks clients separately", () => {
  let t = 0;
  const limit = createRateLimiter({ windowMs: 1000, max: 1, keyFn: (req) => req.ip, now: () => t });
  const res = { set() {} };
  const call = (ip) => {
    let err;
    limit({ ip }, res, (e) => (err = e));
    return err?.status ?? 200;
  };
  assert.equal(call("a"), 200);
  assert.equal(call("a"), 429);
  assert.equal(call("b"), 200, "a different client has its own bucket");
  t = 1000;
  assert.equal(call("a"), 200, "window expired, client a may call again");
});

function makeLimiter(opts) {
  let t = 0;
  const limit = createRateLimiter({ windowMs: 1000, max: 1, keyFn: (req) => req.ip, now: () => t, ...opts });
  const call = (ip) => {
    let err;
    limit({ ip }, { set() {} }, (e) => (err = e));
    return err?.status ?? 200;
  };
  return { limit, call, advance: (ms) => (t += ms) };
}

test("tracked clients never exceed maxKeys under a flood of distinct IPs", () => {
  const { limit, call } = makeLimiter({ maxKeys: 100 });
  for (let i = 0; i < 5000; i++) call(`10.0.${i >> 8}.${i & 255}`);
  assert.equal(limit.trackedClients(), 100);
});

test("when full, the oldest client is evicted and recent clients keep their counts", () => {
  const { limit, call, advance } = makeLimiter({ maxKeys: 2 });
  call("a");
  advance(10);
  call("b");
  advance(10);
  call("c"); // evicts "a", the oldest
  assert.equal(limit.trackedClients(), 2);
  assert.equal(call("b"), 429, "b is still tracked and still limited");
  assert.equal(call("c"), 429, "c is still tracked and still limited");
});

test("expired clients are cleaned up without waiting for the cap", () => {
  const { limit, call, advance } = makeLimiter({ maxKeys: 100 });
  for (let i = 0; i < 50; i++) call(`ip${i}`);
  assert.equal(limit.trackedClients(), 50);
  advance(1000);
  call("new");
  assert.equal(limit.trackedClients(), 1);
});

test("invalid maxKeys is rejected", () => {
  for (const maxKeys of [0, -1, 1.5]) {
    assert.throws(() => createRateLimiter({ windowMs: 1000, max: 1, maxKeys }), /maxKeys/);
  }
});
