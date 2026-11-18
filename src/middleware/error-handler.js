import { randomUUID } from "node:crypto";
import { AppError, ClientClosedError } from "../errors.js";
import { config } from "../config/env.js";

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` },
  });
}

/** The request path without query string or fragment. */
function pathOnly(req) {
  const url = req.originalUrl ?? req.url ?? "";
  return url.split(/[?#]/, 1)[0];
}

/**
 * Builds the error handler. Unexpected errors are always logged in full
 * server-side, tagged with an errorId the client also receives. The internal
 * message is only sent to the client when cfg.exposeErrorDetails is true
 * (NODE_ENV explicitly "development" or "test").
 */
export function createErrorHandler(cfg = config, log = console.error) {
  // Express recognises error handlers by their 4-argument signature.
  // eslint-disable-next-line no-unused-vars
  return function errorHandler(err, req, res, next) {
    // Client is gone (disconnect aborted the run): nothing to send.
    if (err instanceof ClientClosedError || res.destroyed) {
      return;
    }
    if (err instanceof AppError) {
      if (err.headers) res.set(err.headers);
      return res.status(err.status).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
    }

    // Malformed JSON or oversized body (raised by express.json).
    if (err?.type === "entity.parse.failed") {
      return res
        .status(400)
        .json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
    }
    if (err?.type === "entity.too.large") {
      return res
        .status(413)
        .json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } });
    }

    const errorId = randomUUID();
    // Path only: query strings can carry secrets, so they are never logged.
    log(`[unhandled error] id=${errorId} ${req.method} ${pathOnly(req)}`, err);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: cfg.exposeErrorDetails ? String(err?.message ?? err) : "Internal server error",
        errorId,
      },
    });
  };
}

export const errorHandler = createErrorHandler();
