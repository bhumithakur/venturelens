import { config, assertConfig } from "./config/env.js";
import { createApp } from "./app.js";

assertConfig(config);

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`VentureLens backend listening on http://localhost:${config.port}`);
  if (config.mockMode) {
    console.log("MOCK_MODE is ON: no Anthropic API calls will be made.");
  } else {
    console.log(`LIVE MODE: Claude (${config.claude.model}) + web search. API credits will be used.`);
  }
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
