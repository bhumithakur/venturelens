import { test } from "node:test";
import assert from "node:assert/strict";
import { createErrorHandler } from "../src/middleware/error-handler.js";
import { loadConfig } from "../src/config/env.js";
import { ValidationError } from "../src/errors.js";

const SECRET = "db password is hunter2 at /srv/internal/path";

function invoke(env, err) {
  const logged = [];
  const handler = createErrorHandler(loadConfig(env), (...args) => logged.push(args));
  const res = {
    statusCode: 0,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  handler(err, { method: "POST", originalUrl: "/x" }, res, () => {});
  return { res, logged };
}

for (const [label, env] of [
  ["NODE_ENV missing", {}],
  ["NODE_ENV empty", { NODE_ENV: "" }],
  ["NODE_ENV=production", { NODE_ENV: "production" }],
  ["NODE_ENV=staging", { NODE_ENV: "staging" }],
]) {
  test(`${label}: internal message is hidden from the client but logged`, () => {
    const { res, logged } = invoke(env, new Error(SECRET));
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error.message, "Internal server error");
    assert.ok(!JSON.stringify(res.body).includes("hunter2"));
    assert.match(res.body.error.errorId, /^[0-9a-f-]{36}$/);
    // Full detail stays server-side, tagged with the same id.
    assert.equal(logged.length, 1);
    assert.ok(logged[0][0].includes(res.body.error.errorId));
    assert.equal(logged[0][1].message, SECRET);
  });
}

test("NODE_ENV=development shows the internal message", () => {
  const { res } = invoke({ NODE_ENV: "development" }, new Error(SECRET));
  assert.equal(res.body.error.message, SECRET);
});

test("missing NODE_ENV defaults to production", () => {
  const cfg = loadConfig({});
  assert.equal(cfg.nodeEnv, "production");
  assert.equal(cfg.exposeErrorDetails, false);
});

test("deliberate AppErrors are still returned with their details", () => {
  const { res, logged } = invoke({}, new ValidationError("bad input", [{ path: "/a", message: "x" }]));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.message, "bad input");
  assert.equal(logged.length, 0);
});

test("logs method and path only, never the query string", () => {
  const logged = [];
  const handler = createErrorHandler(loadConfig({}), (...args) => logged.push(args));
  const res = { status() { return this; }, json(body) { this.body = body; return this; } };
  handler(
    new Error("boom"),
    { method: "POST", originalUrl: "/api/agents/market-research/run?api_key=SECRET123&token=abc#frag" },
    res,
    () => {}
  );
  const line = logged[0][0];
  assert.equal(line, `[unhandled error] id=${res.body.error.errorId} POST /api/agents/market-research/run`);
  assert.ok(!line.includes("SECRET123") && !line.includes("?") && !line.includes("#"));
});
