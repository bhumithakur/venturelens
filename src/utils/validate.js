import Ajv from "ajv";

// One shared instance. Strict mode catches typos in our schemas early.
const ajv = new Ajv({ allErrors: true, strict: true });

/**
 * Compiles a JSON Schema into a validator function.
 * The returned function gives { valid, errors } where errors is a flat,
 * human-readable list: [{ path, message }].
 */
export function createValidator(schema) {
  const validate = ajv.compile(schema);
  return (data) => {
    const valid = validate(data);
    const errors = valid
      ? []
      : (validate.errors ?? []).map((e) => ({
          path: e.instancePath || "(root)",
          message:
            e.keyword === "additionalProperties"
              ? `unknown property "${e.params.additionalProperty}"`
              : e.message,
        }));
    return { valid, errors };
  };
}
