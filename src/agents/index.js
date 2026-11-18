import { marketResearchAgent } from "./market-research/market-research.agent.js";

// Registry: add a new agent by importing it and adding one line here.
const agents = {
  [marketResearchAgent.name]: marketResearchAgent,
};

export function getAgent(name) {
  return Object.hasOwn(agents, name) ? agents[name] : undefined;
}

export function listAgents() {
  return Object.values(agents);
}
