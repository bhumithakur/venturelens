# venturelens

Backend for **VentureLens**, an AI-powered business intelligence and growth co-pilot built on Claude.

**Current scope:** Express API + one agent (Market Research). No database, auth, orchestration or GoDaddy integration yet.

## Requirements

- Node.js 20 or later
- An Anthropic API key (only for live mode)

## Quick start

```bash
npm install
cp .env.example .env     # MOCK_MODE=true by default
# Set APP_API_KEY in .env (the server will not start with the placeholder):
#   openssl rand -hex 32
npm run dev              # http://localhost:3000
```

Try it:

```bash
curl http://localhost:3000/health

curl -X POST http://localhost:3000/api/agents/market-research/run \
  -H "content-type: application/json" \
  -H "authorization: Bearer $APP_API_KEY" \
  -d '{"business": "online store selling handmade candles", "region": "India"}'
```

## Mock mode vs live mode

| | `MOCK_MODE=true` (default) | `MOCK_MODE=false` |
|---|---|---|
| Anthropic API | never contacted, SDK not even loaded | called, **uses credits** |
| `ANTHROPIC_API_KEY` | not needed | required (server refuses to start without it) |
| Output | schema-valid fixture, labelled `"mock": true` | real researched report |

The Anthropic client is created lazily on the first live call, never at import or startup.

### Choosing mock or live per request

`MOCK_MODE` is the default for requests that don't choose a mode. To allow live research from the app while keeping mock as the default, set `LIVE_RESEARCH_ENABLED=true` (requires `ANTHROPIC_API_KEY`). A request then chooses with `?mode=mock` or `?mode=live` on `POST /api/agents/:agentName/run`.

- An explicit `?mode=live` on a server without live research enabled returns `403 LIVE_RESEARCH_DISABLED`. It is never served from mock data, and the response's `mock` field always reflects the mode actually used.
- Live runs have an extra per-IP cap (`LIVE_RATE_LIMIT_MAX` per `LIVE_RATE_LIMIT_WINDOW_MS`, default 5 per hour), and the same live research cannot run twice at once (`409 RESEARCH_IN_PROGRESS`).
- Failed Anthropic requests are not retried automatically (`CLAUDE_MAX_RETRIES=0`).
- `GET /health` reports `liveResearchAvailable`.

### How a live run works

1. One streamed request to Claude (`claude-sonnet-5-5`, effort `medium`) with two tools: Anthropic's server-side `web_search` (`web_search_20260209`) and our `submit_research_report` tool. The report tool is not strict (its strict grammar exceeds Anthropic's size limit): the complete report schema is sent to Claude, and every submitted report is validated locally with Ajv against that full schema, with one correction round if it is invalid.
2. `pause_turn` responses are continued by sending the paused turn back, until `WEB_SEARCH_MAX_TOTAL` searches have been used.
3. If Claude finishes without submitting a report, it gets one reminder.
4. The report is checked against the schema, and every source URL must appear in the run's actual search results. Problems are sent back once for correction.
5. After that: unsupported sources are removed, findings left with no source move to `research_gaps`, and a finding that lost sources can no longer be `verified`. A URL appearing in search results never upgrades a claim.

Limits: `CLAUDE_MAX_TURNS` requests per run, `CLAUDE_RUN_TIMEOUT_MS` per run, `WEB_SEARCH_MAX_USES` searches per request. A failed run is never restarted automatically. If the client disconnects, the run is aborted.

`meta` in the response records turns, searches, search errors, token usage per model, the model that answered, refusal-fallback use, source-check results and an estimated cost in USD.

| Live error | HTTP |
|---|---|
| Model declined (`REQUEST_DECLINED`) | 422 |
| Output cut off (`OUTPUT_TRUNCATED`), no report (`NO_REPORT`), invalid report (`INVALID_AGENT_OUTPUT`) | 502 |
| Upstream rate limit / overload (`UPSTREAM_RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`) | 503 |
| Turn/search budget or deadline reached (`RESEARCH_INCOMPLETE`, `UPSTREAM_TIMEOUT`) | 504 |

## API

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Status, mode, registered agents |
| GET | `/api/agents` | List agents |
| POST | `/api/agents/:agentName/run` | Run an agent. The body is the agent's input. **Requires `APP_API_KEY`; rate limited** |

### Authentication

`POST /api/agents/:agentName/run` needs `APP_API_KEY`, sent as `Authorization: Bearer <key>` or `X-API-Key: <key>`. Without it you get `401`. This is VentureLens's own client key and is separate from `ANTHROPIC_API_KEY`. The server refuses to start if `APP_API_KEY` is missing, shorter than 32 characters, still the `.env.example` placeholder, or the same as `ANTHROPIC_API_KEY`.

### Rate limiting

The run endpoint allows `RATE_LIMIT_MAX` requests (default 10) per client IP per `RATE_LIMIT_WINDOW_MS` (default 60000). Requests over the limit get `429` with a `Retry-After` header, and the agent is not run. Limits are in memory and per process.

### Errors

Unexpected errors return `500` with a generic message and an `errorId`; the full error is logged server-side under that id. Internal messages are returned to clients only when `NODE_ENV` is exactly `development` or `test`. A missing `NODE_ENV` is treated as production.

### Market Research input

```json
{
  "business": "required, 3-500 chars",
  "industry": "optional",
  "region": "optional",
  "notes": "optional, up to 2000 chars"
}
```

Unknown fields are rejected. Input is validated **before** any Claude call; errors come back as `400` with field-level details.

### Output

Every item in `market_size`, `trends`, `competitors`, `target_segments`, `risks` and `opportunities` is a *finding* with:

- `claim` and `evidence`
- `sources[]` (`url` + `title`, at least one)
- `verification`: `verified | partially_verified | unverified | conflicting`
- `confidence`: `high | medium | low`

The report also has `summary`, `research_gaps` and `overall_confidence`.

## Project structure

```
src/
  server.js                 starts the HTTP server
  app.js                    builds the Express app
  errors.js                 AppError and friends
  config/env.js             env loading and validation
  routes/                   /health, /api/agents
  middleware/               error handling, API key auth, rate limiting
  services/claude.service.js   the only file that uses the Anthropic SDK (research loop)
  services/pricing.js          price table for cost estimates
  agents/
    index.js                agent registry
    market-research/
      *.instructions.js     system prompt + user message builder
      *.schema.js           output JSON Schema (+ validator)
      *.input.js            input schema + validation
      *.mock.js             mock-mode fixture
      *.sources.js          source URL checks against real search results
      *.agent.js            the agent (plain object)
  tools/                    shared tool definitions (web search)
  utils/validate.js         Ajv helper
test/                       node:test suites
```

## Adding an agent

1. Create `src/agents/<name>/` with instructions, schema, input and agent files.
2. Export a plain object `{ name, description, run(input) }`.
3. Add one line to `src/agents/index.js`.

## Scripts

- `npm run dev`: start with file watching
- `npm start`: start
- `npm test`: run tests (no network, no API calls; live mode uses a fake client)
- `scripts/live-smoke.js`: ONE real, low-budget research run. Spends API credits; never run by `npm test`. See the script header.

## Deployment (Docker on a VPS)

`Dockerfile` builds the React app and runs Express as the non-root `node` user, serving the frontend and API from one origin on port 3000. `docker-compose.yml` runs it behind Caddy, which terminates HTTPS and is the only service with public ports.

**Production defaults are enforced in `docker-compose.yml`:** `NODE_ENV=production`, `MOCK_MODE=true`, `LIVE_RESEARCH_ENABLED=false`. Paid live research is off and cannot be enabled from the env file.

### 1. Server prerequisites
- Docker Engine with the Compose plugin (v2.24 or later).
- Firewall: allow inbound **80/tcp**, **443/tcp** and **443/udp**. Nothing else needs to be public (the app's port 3000 is not published).

### 2. DNS
Create an **A record** (and AAAA if the VPS has IPv6) for your domain, e.g. `app.example.com`, pointing at the VPS's public IP. Caddy obtains the HTTPS certificate automatically once DNS resolves to the server.

### 3. Environment file (on the server only, never committed)
```bash
cp .env.example .env.production
```
Set at least:

| Variable | Required | Notes |
|---|---|---|
| `DOMAIN` | yes | Public hostname, e.g. `app.example.com` |
| `APP_API_KEY` | yes | `openssl rand -hex 32`. Used by Express and attached to `/api` requests by Caddy; never sent to browsers |
| `ANTHROPIC_API_KEY` | no | Leave **empty** while live research is disabled |

`.env.production` is git-ignored and excluded from the Docker build context. Another path can be used with `VL_ENV_FILE=/path/to/file`.

### 4. Start
```bash
docker compose up -d --build
docker compose ps            # app should be "healthy"
docker compose logs -f caddy # watch certificate issuance
```
Update after pulling new code: `docker compose up -d --build`. Stop: `docker compose down`.

### Notes
- Caddy adds `Authorization: Bearer $APP_API_KEY` to `/api` requests, so the research endpoint is usable by anyone who can open the site. Keep live research disabled unless an access control is added.
- With `NODE_ENV=production` (enforced by Compose), Express trusts exactly one proxy hop (Caddy), so rate limits apply per real visitor IP. Override with `TRUST_PROXY_HOPS` only if the number of proxies in front changes.
