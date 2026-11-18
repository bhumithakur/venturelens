import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

/**
 * Dev-only proxy: the browser calls /api/* on the Vite server, which forwards to
 * Express and attaches APP_API_KEY here, in Node. The key is read from the repo's
 * root .env ONLY in this file; it is never put in import.meta.env, `define`, or
 * any VITE_ variable, so it cannot end up in the browser bundle.
 */
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BACKEND = "http://localhost:3000";
const PLACEHOLDER = "replace-with-a-long-random-string";

export default defineConfig(({ mode }) => {
  // Prefix "" loads all vars into this Node process only. envDir stays web/ (default),
  // so the client never sees the root .env.
  const rootEnv = loadEnv(mode, ROOT, "");
  const appKey = (rootEnv.APP_API_KEY ?? "").trim();
  const keyOk = appKey.length > 0 && appKey !== PLACEHOLDER;

  if (!keyOk) {
    console.warn("[venturelens] APP_API_KEY missing or placeholder in ../.env: /api requests will return 503.");
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // Fail safely: never forward /api without the key.
        name: "venturelens-require-app-key",
        configureServer(server) {
          if (keyOk) return;
          server.middlewares.use("/api", (_req, res) => {
            res.statusCode = 503;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: { code: "PROXY_NOT_CONFIGURED", message: "Dev proxy has no APP_API_KEY configured." } }));
          });
        },
      },
    ],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: "react-vendor", test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
              { name: "charts", test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|es-toolkit|@reduxjs|redux|reselect|immer)[\\/]/ },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        // Read-only reuse of the backend report schema (single source of truth for validation).
        "@backend-schema": `${ROOT}src/agents/market-research/market-research.schema.js`,
      },
    },
    server: {
      port: 5173,
      // Dev server may read only these backend paths (schema + its Ajv helper). Vite's default
      // fs.deny (.env, .env.*, *.pem, *.crt, .git) still applies.
      fs: {
        allow: [
          fileURLToPath(new URL(".", import.meta.url)),
          `${ROOT}src/agents/market-research`,
          `${ROOT}src/utils`,
          `${ROOT}node_modules`,
        ],
      },
      proxy: {
        "/health": { target: BACKEND, changeOrigin: true },
        "/api": {
          target: BACKEND,
          changeOrigin: true,
          ...(keyOk ? { headers: { authorization: `Bearer ${appKey}` } } : {}),
        },
      },
    },
  };
});
