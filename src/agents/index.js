import { marketResearchAgent } from "./market-research/market-research.agent.js";
import { growthPlanAgent } from "./growth-plan/growth-plan.agent.js";

// Registry: add a new agent by importing it and adding one line here.
const agents = {
  [marketResearchAgent.name]: marketResearchAgent,
  [growthPlanAgent.name]: growthPlanAgent,
};

export function getAgent(name) {
  return Object.hasOwn(agents, name) ? agents[name] : undefined;
}

export function listAgents() {
  return Object.values(agents);
}
