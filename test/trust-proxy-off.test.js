import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// No proxy in front (development / direct): X-Forwarded-For must be ignored entirely.
process.env.MOCK_MODE = "true";
process.env.LIVE_RESEARCH_ENABLED = "false";
process.env.APP_API_KEY = "test-app-key-0123456789abcdef0123456789";
process.env.TRUST_PROXY_HOPS = "0";
process.env.RATE_LIMIT_MAX = "2";

const { createApp } = await import("../src/app.js");

let server, base;
before(async () => {
  server = createApp({ webDist: null }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test("without a trusted proxy, a forged X-Forwarded-For cannot create new buckets", async () => {
  const run = (ip) => fetch(`${base}/api/agents/market-research/run`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.APP_API_KEY}`, "x-forwarded-for": ip },
    body: JSON.stringify({ business: "candle shop" }),
  }).then((r) => r.status);
  assert.equal(createApp({ webDist: null }).get("trust proxy"), false);
  assert.deepEqual([await run("198.51.100.1"), await run("198.51.100.2"), await run("198.51.100.3")], [200, 200, 429]);
});
