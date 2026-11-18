/**
 * Anthropic's server-side web search tool.
 *
 * This is only a tool *definition* (plain data). Anthropic runs the searches
 * on its side; our code never makes HTTP requests to search engines.
 * Settings live here, not in the agent, so every agent that needs web
 * research gets the same limits.
 */
export function createWebSearchTool(config) {
  return {
    type: config.webSearch.toolType, // e.g. "web_search_20250305"
    name: "web_search",
    max_uses: config.webSearch.maxUses, // hard cap on searches (and cost) per request
    // Claude calls web search directly, not from code execution (no dynamic filtering).
    // The _20260209 version defaults to ["code_execution_20260120"].
    allowed_callers: ["direct"],
  };
}
