import { createWebSearchTool } from "./web-research.tool.js";

// Registry of tool factories, keyed by the name agents use to request them.
const toolFactories = {
  web_search: createWebSearchTool,
};

/** Turns a list of tool names into the tool definitions sent to Claude. */
export function resolveTools(names, config) {
  return names.map((name) => {
    const factory = toolFactories[name];
    if (!factory) throw new Error(`Unknown tool "${name}"`);
    return factory(config);
  });
}
