import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.MOCK_MODE = "true";
process.env.LIVE_RESEARCH_ENABLED = "true";
process.env.ANTHROPIC_API_KEY = "sk-ant-fake-key-for-tests";
process.env.APP_API_KEY = "test-app-key-0123456789abcdef0123456789";
process.env.RATE_LIMIT_MAX = "1000";
process.env.LIVE_RATE_LIMIT_MAX = "1";

const { createApp } = await import("../src/app.js");
const { useClientForTesting } = await import("../src/services/claude.service.js");
const { createFakeClient, blockNetwork, message } = await import("./helpers/fake-anthropic.js");

let server, base, restore;
before(async () => {
  restore = blockNetwork();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); restore(); });

const post = (q) => fetch(`${base}/api/agents/market-research/run${q}`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${process.env.APP_API_KEY}` },
  body: JSON.stringify({ business: "candle shop" }),
});

test("live runs have their own cap; mock runs are unaffected", async () => {
  const fake = createFakeClient([message({ stop_reason: "max_tokens" }), message({ stop_reason: "max_tokens" })]);
  useClientForTesting(fake);
  assert.equal((await post("?mode=live")).status, 502, "first live run reaches Claude (fake max_tokens)");
  const capped = await post("?mode=live");
  assert.equal(capped.status, 429);
  assert.equal(fake.calls.length, 1, "capped live run never reached Claude");
  assert.equal((await post("?mode=mock")).status, 200, "mock still works");
});
