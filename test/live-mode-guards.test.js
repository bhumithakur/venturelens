import { test } from "node:test";
import assert from "node:assert/strict";

// Live mode with a FAKE key. Nothing here reaches the Claude service:
// every test either checks config or fails input validation first.
// The live research path itself is tested with a fake client in live-agent.test.js.
process.env.MOCK_MODE = "false";
process.env.ANTHROPIC_API_KEY = "sk-ant-fake-key-for-tests";

const { config, assertConfig, loadConfig } = await import("../src/config/env.js");
const { marketResearchAgent } = await import("../src/agents/market-research/market-research.agent.js");
const { isClientInitialized } = await import("../src/services/claude.service.js");

test("config is in live mode", () => {
  assert.equal(config.mockMode, false);
});

const APP_KEY = "test-app-key-0123456789abcdef0123456789";

test("startup check fails when live mode has no Anthropic API key", () => {
  assert.throws(
    () => assertConfig(loadConfig({ MOCK_MODE: "false", APP_API_KEY: APP_KEY })),
    /ANTHROPIC_API_KEY/
  );
});

test("startup check passes in mock mode without an Anthropic key", () => {
  assert.doesNotThrow(() => assertConfig(loadConfig({ MOCK_MODE: "true", APP_API_KEY: APP_KEY })));
});

test("invalid input is rejected before the Claude service is reached", async () => {
  await assert.rejects(() => marketResearchAgent.run({ nope: 1 }), { status: 400 });
  assert.equal(isClientInitialized(), false);
});
