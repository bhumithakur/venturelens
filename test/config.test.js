import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadConfig, assertConfig, APP_API_KEY_PLACEHOLDER } from "../src/config/env.js";

const KEY = "test-app-key-0123456789abcdef0123456789";

test("default model and web search tool", () => {
  const cfg = loadConfig({});
  assert.equal(cfg.claude.model, "claude-sonnet-5-5");
  assert.equal(cfg.webSearch.toolType, "web_search_20260209");
});

test("startup fails without APP_API_KEY, even in mock mode", () => {
  assert.throws(() => assertConfig(loadConfig({ MOCK_MODE: "true" })), /APP_API_KEY is not set/);
});

test("startup fails with the .env.example placeholder", () => {
  assert.throws(
    () => assertConfig(loadConfig({ APP_API_KEY: APP_API_KEY_PLACEHOLDER })),
    /placeholder/
  );
});

test("startup fails with a short APP_API_KEY", () => {
  assert.throws(() => assertConfig(loadConfig({ APP_API_KEY: "short" })), /at least 32/);
});

test("startup fails if APP_API_KEY equals ANTHROPIC_API_KEY", () => {
  assert.throws(
    () => assertConfig(loadConfig({ MOCK_MODE: "false", APP_API_KEY: KEY, ANTHROPIC_API_KEY: KEY })),
    /must not be the same/
  );
});

test("startup passes with a proper APP_API_KEY in mock mode", () => {
  assert.doesNotThrow(() => assertConfig(loadConfig({ APP_API_KEY: KEY })));
});

test(".env.example documents APP_API_KEY with the placeholder and current defaults", () => {
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(example, new RegExp(`^APP_API_KEY=${APP_API_KEY_PLACEHOLDER}$`, "m"));
  assert.match(example, /^RATE_LIMIT_MAX=\d+$/m);
  assert.match(example, /^RATE_LIMIT_WINDOW_MS=\d+$/m);
  assert.match(example, /^CLAUDE_MODEL=claude-sonnet-5-5$/m);
  assert.match(example, /^WEB_SEARCH_TOOL_TYPE=web_search_20260209$/m);
  assert.doesNotMatch(example, /sk-ant-[A-Za-z0-9]/, "no real-looking Anthropic key");
});

for (const bad of ["10abc", "3000.9", "-5", "0", "+5", "1e3", "0x10", "abc", " ", "1 000", "99999999999999999999"]) {
  test(`integer settings reject ${JSON.stringify(bad)}`, () => {
    for (const name of ["PORT", "RATE_LIMIT_MAX", "RATE_LIMIT_WINDOW_MS", "CLAUDE_MAX_TOKENS"]) {
      assert.throws(() => loadConfig({ [name]: bad }), new RegExp(`${name} must be a positive integer`));
    }
  });
}

test("integer settings accept plain digits and surrounding whitespace", () => {
  assert.equal(loadConfig({ PORT: "8080" }).port, 8080);
  assert.equal(loadConfig({ RATE_LIMIT_MAX: " 25 " }).rateLimit.max, 25);
  assert.equal(loadConfig({ PORT: "" }).port, 3000, "empty falls back to the default");
});

test("live-mode defaults match the approved limits", () => {
  const c = loadConfig({});
  assert.equal(c.mockMode, true, "mock mode stays the default");
  assert.equal(c.claude.model, "claude-sonnet-5-5");
  assert.equal(c.claude.effort, "medium");
  assert.equal(c.claude.maxTokens, 16000);
  assert.equal(c.claude.maxTurns, 5);
  assert.equal(c.claude.runTimeoutMs, 180000);
  assert.equal(c.claude.refusalFallback, false);
  assert.equal(c.webSearch.maxUses, 2);
  assert.equal(c.webSearch.maxTotal, 4);
});

test("CLAUDE_EFFORT accepts only documented levels", () => {
  assert.equal(loadConfig({ CLAUDE_EFFORT: "HIGH" }).claude.effort, "high");
  assert.throws(() => loadConfig({ CLAUDE_EFFORT: "extreme" }), /CLAUDE_EFFORT must be one of/);
});

test(".env.example documents the live settings", () => {
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  for (const line of [
    "MOCK_MODE=true", "CLAUDE_EFFORT=medium", "CLAUDE_MAX_TOKENS=16000", "CLAUDE_MAX_TURNS=5",
    "CLAUDE_RUN_TIMEOUT_MS=180000", "CLAUDE_REFUSAL_FALLBACK=false", "WEB_SEARCH_MAX_USES=2", "WEB_SEARCH_MAX_TOTAL=4",
  ]) {
    assert.match(example, new RegExp(`^${line}$`, "m"), line);
  }
});

test("CLAUDE_MAX_RETRIES defaults to 0 (no automatic retries), accepts other values, rejects invalid ones", () => {
  assert.equal(loadConfig({}).claude.maxRetries, 0);
  assert.equal(loadConfig({ CLAUDE_MAX_RETRIES: "2" }).claude.maxRetries, 2);
  assert.equal(loadConfig({ CLAUDE_MAX_RETRIES: "0" }).claude.maxRetries, 0);
  for (const bad of ["-1", "1.5", "abc"]) {
    assert.throws(() => loadConfig({ CLAUDE_MAX_RETRIES: bad }), /CLAUDE_MAX_RETRIES must be a non-negative integer/);
  }
});
