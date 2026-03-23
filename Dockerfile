# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy shared
COPY shared/ ./shared/

# Build client
COPY client/package*.json ./client/
WORKDIR /app/client
RUN npm ci
COPY client/ .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy shared
COPY shared/ ./shared/

# Install server deps
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --production

# Copy server source
COPY server/ .

# Copy built client
COPY --from=build /app/client/dist /app/client/dist

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
