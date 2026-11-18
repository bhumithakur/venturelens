import { Router } from "express";
import { config } from "../config/env.js";
import { listAgents } from "../agents/index.js";
import agentRoutes from "./agents.routes.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mockMode: config.mockMode, // default mode for requests that do not choose one
    liveResearchAvailable: config.liveResearchEnabled,
    agents: listAgents().map((a) => a.name),
  });
});

router.use("/api/agents", agentRoutes);

export default router;
