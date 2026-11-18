import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "../errors.js";

const sha256 = (value) => createHash("sha256").update(value).digest();

/** Reads the key from "Authorization: Bearer <key>" or "X-API-Key: <key>". */
function extractKey(req) {
  const auth = req.get("authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    return match ? match[1].trim() : "";
  }
  return (req.get("x-api-key") ?? "").trim();
}

/**
 * Requires the client to present APP_API_KEY. This is the key OUR clients use
 * to call VentureLens; it is never the Anthropic key.
 *
 * Fails closed: if no key is configured, every request is rejected.
 * Comparison hashes both values first so timingSafeEqual gets equal lengths
 * and the check does not leak the key length or prefix through timing.
 */
export function requireApiKey(expectedKey) {
  const expectedHash = expectedKey ? sha256(expectedKey) : null;

  return function apiKeyAuth(req, res, next) {
    if (!expectedHash) {
      return next(new AppError(503, "AUTH_NOT_CONFIGURED", "API authentication is not configured"));
    }
    const provided = extractKey(req);
    if (!provided || !timingSafeEqual(sha256(provided), expectedHash)) {
      res.set("WWW-Authenticate", 'Bearer realm="venturelens"');
      return next(new AppError(401, "UNAUTHORIZED", "Missing or invalid API key"));
    }
    next();
  };
}
