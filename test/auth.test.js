import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.MOCK_MODE = "true";
process.env.ANTHROPIC_API_KEY = "sk-ant-fake-key-for-tests";
process.env.APP_API_KEY = "test-app-key-0123456789abcdef0123456789";
process.env.RATE_LIMIT_MAX = "1000";

const { createApp } = await import("../src/app.js");
const { marketResearchAgent } = await import("../src/agents/market-research/market-research.agent.js");
const { requireApiKey } = await import("../src/middleware/auth.js");

// Count agent executions so we can prove rejected requests never reach the agent.
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

const run = (headers = {}) =>
  fetch(`${base}/api/agents/market-research/run`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ business: "handmade candle shop" }),
  });

for (const [label, headers] of [
  ["no key", {}],
  ["wrong bearer key", { authorization: "Bearer wrong-key" }],
  ["wrong x-api-key", { "x-api-key": "wrong-key" }],
  ["Anthropic key instead of app key", { authorization: `Bearer ${process.env.ANTHROPIC_API_KEY}` }],
  ["non-bearer scheme", { authorization: `Basic ${process.env.APP_API_KEY}` }],
]) {
  test(`run endpoint rejects ${label} with 401 and does not run the agent`, async () => {
    const before = runs;
    const res = await run(headers);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "UNAUTHORIZED");
    assert.ok(res.headers.get("www-authenticate"));
    assert.equal(runs, before);
  });
}

test("run endpoint accepts a valid Bearer key", async () => {
  const res = await run({ authorization: `Bearer ${process.env.APP_API_KEY}` });
  assert.equal(res.status, 200);
});

test("run endpoint accepts a valid X-API-Key header", async () => {
  const res = await run({ "x-api-key": process.env.APP_API_KEY });
  assert.equal(res.status, 200);
});

test("public endpoints do not require the key", async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/agents`)).status, 200);
});

test("middleware fails closed when no key is configured", () => {
  let error;
  requireApiKey("")({ get: () => "Bearer anything" }, { set() {} }, (err) => (error = err));
  assert.equal(error.status, 503);
});
