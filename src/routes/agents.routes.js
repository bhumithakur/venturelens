import { Router } from "express";
import { getAgent, listAgents } from "../agents/index.js";
import { AppError, NotFoundError } from "../errors.js";
import { config, resolveResearchMode } from "../config/env.js";
import { requireApiKey } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rate-limit.js";

const router = Router();

// Rate limit runs BEFORE auth so key-guessing attempts are throttled too.
const runRateLimit = createRateLimiter(config.rateLimit);
const runAuth = requireApiKey(config.appApiKey);
const liveRateLimit = createRateLimiter(config.liveRateLimit);

// Resolves ?mode=mock|live before any work; live runs get an extra (hourly) cap.
function researchMode(req, res, next) {
  try {
    req.researchMode = resolveResearchMode(config, req.query.mode);
  } catch (e) {
    return next(new AppError(e.status, e.code, e.message));
  }
  if (req.researchMode === "live") return liveRateLimit(req, res, next);
  next();
}

// GET /api/agents
router.get("/", (req, res) => {
  res.json({ agents: listAgents().map(({ name, description }) => ({ name, description })) });
});

// POST /api/agents/:agentName/run   (body = the agent's input)
router.post("/:agentName/run", runRateLimit, runAuth, researchMode, async (req, res) => {
  const agent = getAgent(req.params.agentName);
  if (!agent) throw new NotFoundError(`Unknown agent "${req.params.agentName}"`);

  // If the client disconnects, abort the run so no further API calls are made.
  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on("close", onClose);
  try {
    // Input validation happens inside agent.run(), before any Claude call.
    const result = await agent.run(req.body, { signal: controller.signal, mode: req.researchMode });
    res.json(result);
  } finally {
    res.off("close", onClose);
  }
});

export default router;
