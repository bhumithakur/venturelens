import express from "express";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import routes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

const DEFAULT_WEB_DIST = fileURLToPath(new URL("../web/dist", import.meta.url));

// Paths the SPA fallback must never answer: the API and the health check.
const isApiOrHealth = (path) => path === "/api" || path.startsWith("/api/") || path === "/health";

/**
 * Serves the production React build (if built) from the same origin as the API.
 * Without web/dist/index.html the app stays API-only, exactly as before.
 */
function serveFrontend(app, webDist) {
  const indexHtml = join(webDist, "index.html");
  if (!existsSync(indexHtml)) return false;

  // Hashed build assets never change: cache for a year. Missing files fall through to the JSON 404.
  app.use("/assets", express.static(join(webDist, "assets"), { immutable: true, maxAge: "1y", index: false }));
  // Other public files (e.g. favicon): revalidate. index.html itself is never cached.
  const noStoreIndex = (res, file) => res.set("Cache-Control", file === indexHtml ? "no-store" : "no-cache");
  app.use(express.static(webDist, { index: false, setHeaders: noStoreIndex }));

  // SPA fallback: client-side routes get index.html, which is never cached.
  app.get(/.*/, (req, res, next) => {
    if (isApiOrHealth(req.path) || extname(req.path) !== "" || !req.accepts("html")) return next();
    res.set("Cache-Control", "no-store");
    res.sendFile(indexHtml);
  });
  return true;
}

export function createApp({ webDist = DEFAULT_WEB_DIST } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use(routes);
  if (webDist) serveFrontend(app, webDist);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
