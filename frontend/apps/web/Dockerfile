# Production Dockerfile for AlmaMesh Web (Vite build)
# Builds the Vite web app from the bun workspace and serves via nginx
#
# Build (repo root): docker build -t almamesh/web:latest -f frontend/apps/web/Dockerfile frontend
# Run:              docker run -p 3000:80 almamesh/web:latest

# ============================================================================
# Stage 1: Build the Vite web app
# ============================================================================
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy workspace manifests for caching
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/constants/package.json packages/constants/package.json
COPY packages/hooks/package.json packages/hooks/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/store/package.json packages/store/package.json

# Install deps for the whole workspace (monorepo)
RUN bun install

# Copy the rest of the repo needed to build
COPY apps/web apps/web
COPY packages packages

# Build the web app
RUN bun run --filter @almamesh/web build

# ============================================================================
# Stage 2: Production nginx server
# ============================================================================
FROM nginx:alpine AS production

# Build-time labels
ARG BUILD_DATE
ARG GIT_SHA
ARG VERSION=1.0.0

LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.title="AlmaMesh Web" \
      org.opencontainers.image.description="AlmaMesh Vedic Astrology web app" \
      org.opencontainers.image.vendor="AlmaMesh"

WORKDIR /usr/share/nginx/html

# Copy custom nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/apps/web/dist/ ./

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
