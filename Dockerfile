# syntax=docker/dockerfile:1
# VentureLens: Express API + production React build, served from one origin.

# ---- 1. Backend production dependencies (also needed by the web build: Ajv) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---- 2. Frontend build ----
# The web build imports the backend report schema (src/agents/market-research, src/utils + ajv).
FROM node:24-alpine AS web
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci --ignore-scripts
COPY web ./web
RUN npm --prefix web run build

# ---- 3. Runtime ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    MOCK_MODE=true \
    LIVE_RESEARCH_ENABLED=false
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --from=web --chown=node:node /app/web/dist ./web/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1
CMD ["node", "src/server.js"]
