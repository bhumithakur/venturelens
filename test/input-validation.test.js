import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInput } from "../src/agents/market-research/market-research.input.js";
import { ValidationError } from "../src/errors.js";

test("accepts minimal valid input", () => {
  assert.deepEqual(parseInput({ business: "handmade candle shop" }), { business: "handmade candle shop" });
});

test("trims strings and drops blank optional fields", () => {
  const out = parseInput({ business: "  candle shop  ", industry: "   ", region: " India " });
  assert.deepEqual(out, { business: "candle shop", region: "India" });
});

for (const [label, body] of [
  ["null body", null],
  ["array body", []],
  ["string body", "hello"],
  ["missing business", { industry: "retail" }],
  ["blank business", { business: "   " }],
  ["too-short business", { business: "ab" }],
  ["non-string business", { business: 42 }],
  ["unknown field", { business: "candle shop", hack: true }],
  ["oversized notes", { business: "candle shop", notes: "x".repeat(2001) }],
]) {
  test(`rejects ${label}`, () => {
    assert.throws(() => parseInput(body), ValidationError);
  });
}

test("validation error carries field-level details", () => {
  try {
    parseInput({ business: "candle shop", hack: true });
    assert.fail("should have thrown");
  } catch (err) {
    assert.equal(err.status, 400);
    assert.match(err.details[0].message, /hack/);
  }
});
