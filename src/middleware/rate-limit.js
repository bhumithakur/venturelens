import { AppError } from "../errors.js";

export const DEFAULT_MAX_TRACKED_CLIENTS = 10_000;

/**
 * In-memory fixed-window rate limiter, keyed by client IP.
 *
 * Memory is bounded: at most `maxKeys` clients are tracked. Entries are kept
 * in the Map in order of window expiry (an entry is re-inserted whenever its
 * window restarts), so:
 *   - cleanup removes expired entries from the front and stops at the first
 *     live one;
 *   - when full with no expired entries, the entry closest to expiry is evicted
 *     to make room. Under a flood of distinct IPs this can let an evicted client
 *     start a fresh window early, but memory never exceeds the cap.
 *
 * Limits are per process: with several instances, each one counts separately.
 * Behind a reverse proxy, req.ip is the proxy's address unless Express
 * "trust proxy" is configured, so all clients would share one bucket.
 */
export function createRateLimiter({
  windowMs,
  max,
  maxKeys = DEFAULT_MAX_TRACKED_CLIENTS,
  keyFn = (req) => req.ip ?? "unknown",
  now = Date.now,
}) {
  if (!Number.isSafeInteger(maxKeys) || maxKeys <= 0) {
    throw new Error("maxKeys must be a positive integer");
  }
  const hits = new Map(); // key -> { count, resetAt }, ordered by resetAt

  function removeExpired(t) {
    for (const [key, entry] of hits) {
      if (entry.resetAt > t) break; // everything after this is newer
      hits.delete(key);
    }
  }

  function limiter(req, res, next) {
    const t = now();
    removeExpired(t);

    const key = keyFn(req);
    let entry = hits.get(key);
    if (!entry) {
      if (hits.size >= maxKeys) hits.delete(hits.keys().next().value); // evict oldest
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    // (Expired entries were removed above, so an existing entry is always live.)
    entry.count += 1;

    const resetSeconds = Math.max(0, Math.ceil((entry.resetAt - t) / 1000));
    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    res.set("RateLimit-Reset", String(resetSeconds));

    if (entry.count > max) {
      res.set("Retry-After", String(resetSeconds));
      return next(new AppError(429, "RATE_LIMITED", "Too many requests, please try again later"));
    }
    next();
  }

  /** For tests and diagnostics: number of clients currently tracked. */
  limiter.trackedClients = () => hits.size;
  return limiter;
}
