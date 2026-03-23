# ──────────────────────────────────────
# Stage 1: Build the client (Vite)
# ──────────────────────────────────────
FROM node:20-alpine AS build-client

WORKDIR /app

# Copy shared (needed by client imports)
COPY shared/ ./shared/

# Install client deps and build
COPY client/package*.json ./client/
WORKDIR /app/client
RUN npm ci
COPY client/ .
RUN npm run build

# ──────────────────────────────────────
# Stage 2: Production server
# ──────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy shared (needed at runtime by tsx)
COPY shared/ ./shared/

# Install server deps (including tsx for running TS directly)
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci

# Copy server source
COPY server/src/ ./src/
COPY server/tsconfig.json ./tsconfig.json

# Copy built client
COPY --from=build-client /app/client/dist /app/client/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Run with tsx so we don't need a separate tsc build step
CMD ["npx", "tsx", "src/index.ts"]
