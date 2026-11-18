import { createValidator } from "../../utils/validate.js";
import { ValidationError } from "../../errors.js";

export const inputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["business"],
  properties: {
    business: {
      type: "string",
      minLength: 3,
      maxLength: 500,
      description: "What the business is or does, e.g. 'online store selling handmade candles'.",
    },
    industry: { type: "string", maxLength: 200, description: "Optional industry or niche." },
    region: { type: "string", maxLength: 200, description: "Optional target geography." },
    notes: { type: "string", maxLength: 2000, description: "Optional extra context or questions." },
  },
};

const validate = createValidator(inputSchema);

/**
 * Validates and normalises raw request input. Runs BEFORE any Claude call.
 * Trims strings, drops empty optional fields, rejects unknown fields.
 * Throws ValidationError (HTTP 400) on failure; returns clean input on success.
 */
export function parseInput(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Request body must be a JSON object", [
      { path: "(root)", message: "expected an object like { \"business\": \"...\" }" },
    ]);
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = typeof value === "string" ? value.trim() : value;
    // Optional fields left blank are treated as absent; "business" stays so it fails minLength.
    if (v === "" && key !== "business") continue;
    cleaned[key] = v;
  }

  const { valid, errors } = validate(cleaned);
  if (!valid) throw new ValidationError("Invalid input for market-research agent", errors);
  return cleaned;
}
