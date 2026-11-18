import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.MOCK_MODE = "true";
process.env.LIVE_RESEARCH_ENABLED = "false";
process.env.ANTHROPIC_API_KEY = "";
process.env.APP_API_KEY = "test-app-key-0123456789abcdef0123456789";
process.env.RATE_LIMIT_MAX = "1000";

const { createApp } = await import("../src/app.js");

// A fake build so the tests don't depend on web/dist existing.
const dist = mkdtempSync(join(tmpdir(), "vl-dist-"));
mkdirSync(join(dist, "assets"));
writeFileSync(join(dist, "index.html"), "<!doctype html><title>VentureLens</title><div id=root></div>");
writeFileSync(join(dist, "assets", "index-abc123.js"), "console.log('app')");
writeFileSync(join(dist, "favicon.svg"), "<svg/>");

const listen = async (app) => {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
};

let withWeb, apiOnly;
before(async () => {
  withWeb = await listen(createApp({ webDist: dist }));
  apiOnly = await listen(createApp({ webDist: join(dist, "does-not-exist") }));
});
after(() => {
  withWeb.server.close();
  apiOnly.server.close();
  rmSync(dist, { recursive: true, force: true });
});

const get = (base, path, accept = "text/html") => fetch(base + path, { headers: { accept } });

test("GET / serves index.html, never cached", async () => {
  const res = await get(withWeb.base, "/");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(await res.text(), /<title>VentureLens<\/title>/);
});

test("a direct request for /index.html is not cached either", async () => {
  const res = await get(withWeb.base, "/index.html");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("client-side routes fall back to index.html", async () => {
  for (const path of ["/businesses/abc/research", "/history", "/research/xyz", "/businesses/new"]) {
    const res = await get(withWeb.base, path);
    assert.equal(res.status, 200, path);
    assert.match(await res.text(), /<div id=root>/, path);
  }
});

test("hashed assets are served with a long immutable cache", async () => {
  const res = await get(withWeb.base, "/assets/index-abc123.js", "*/*");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /javascript/);
  assert.match(res.headers.get("cache-control"), /max-age=31536000/);
  assert.match(res.headers.get("cache-control"), /immutable/);
});

test("missing assets return 404, never index.html", async () => {
  const res = await get(withWeb.base, "/assets/missing-999.js", "*/*");
  assert.equal(res.status, 404);
  assert.doesNotMatch(await res.text(), /<div id=root>/);
  const other = await get(withWeb.base, "/missing.png", "*/*");
  assert.equal(other.status, 404);
  assert.equal((await other.json()).error.code, "NOT_FOUND");
});

test("other public files are served and revalidated", async () => {
  const res = await get(withWeb.base, "/favicon.svg", "*/*");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-cache");
});

test("API and health routes are never intercepted by the SPA fallback", async () => {
  const health = await get(withWeb.base, "/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");

  const agents = await get(withWeb.base, "/api/agents");
  assert.equal((await agents.json()).agents[0].name, "market-research");

  for (const path of ["/api", "/api/nope", "/api/agents/nope/extra"]) {
    const res = await get(withWeb.base, path); // even with Accept: text/html
    assert.equal(res.status, 404, path);
    assert.equal((await res.json()).error.code, "NOT_FOUND", path);
  }
});

test("authentication and JSON errors are unchanged", async () => {
  const unauth = await fetch(`${withWeb.base}/api/agents/market-research/run`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ business: "candle shop" }),
  });
  assert.equal(unauth.status, 401);
  const bad = await fetch(`${withWeb.base}/api/agents/market-research/run`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.APP_API_KEY}` }, body: "{not json",
  });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, "INVALID_JSON");
});

test("non-HTML requests to unknown paths get the JSON 404", async () => {
  const res = await get(withWeb.base, "/some/route", "application/json");
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, "NOT_FOUND");
});

test("without a frontend build the app stays API-only", async () => {
  const root = await get(apiOnly.base, "/");
  assert.equal(root.status, 404);
  assert.equal((await root.json()).error.code, "NOT_FOUND");
  assert.equal((await get(apiOnly.base, "/health")).status, 200);
  assert.equal((await get(apiOnly.base, "/history")).status, 404);
});
