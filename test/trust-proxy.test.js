import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// Production-like: one trusted proxy hop (Caddy). Small limit to observe buckets.
process.env.MOCK_MODE = "true";
process.env.LIVE_RESEARCH_ENABLED = "false";
process.env.APP_API_KEY = "test-app-key-0123456789abcdef0123456789";
process.env.TRUST_PROXY_HOPS = "1";
process.env.RATE_LIMIT_MAX = "2";

const { createApp } = await import("../src/app.js");
const { loadConfig } = await import("../src/config/env.js");

let server, base;
before(async () => {
  server = createApp({ webDist: null }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// What Caddy sends: X-Forwarded-For whose LAST entry is the real client IP it saw.
const run = (xff) =>
  fetch(`${base}/api/agents/market-research/run`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.APP_API_KEY}`, ...(xff ? { "x-forwarded-for": xff } : {}) },
    body: JSON.stringify({ business: "candle shop" }),
  }).then((r) => r.status);

test("trust proxy is exactly one hop", () => {
  assert.equal(createApp({ webDist: null }).get("trust proxy"), 1);
});

test("different forwarded client IPs are rate-limited separately", async () => {
  assert.deepEqual([await run("203.0.113.10"), await run("203.0.113.10"), await run("203.0.113.10")], [200, 200, 429]);
  assert.equal(await run("203.0.113.20"), 200, "another visitor has their own bucket");
});

test("a forged X-Forwarded-For entry cannot bypass the limit", async () => {
  // Client 203.0.113.30 sends a fake header; Caddy appends the real IP on the right.
  assert.equal(await run("10.9.9.1, 203.0.113.30"), 200);
  assert.equal(await run("10.9.9.2, 203.0.113.30"), 200);
  assert.equal(await run("10.9.9.3, 203.0.113.30"), 429, "rotating the forged value does not create a new bucket");
  assert.equal(await run("203.0.113.40, 203.0.113.30"), 429, "claiming another visitor's IP does not help either");
});

test("proxy-hop default: 1 only when NODE_ENV=production, otherwise 0; validated", () => {
  assert.equal(loadConfig({ NODE_ENV: "production" }).trustProxyHops, 1);
  assert.equal(loadConfig({ NODE_ENV: "development" }).trustProxyHops, 0);
  assert.equal(loadConfig({}).trustProxyHops, 0, "unset NODE_ENV does not trust the header");
  assert.equal(loadConfig({ NODE_ENV: "production", TRUST_PROXY_HOPS: "0" }).trustProxyHops, 0);
  assert.throws(() => loadConfig({ TRUST_PROXY_HOPS: "-1" }), /TRUST_PROXY_HOPS/);
});
