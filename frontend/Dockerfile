# Stage 1: Build
FROM oven/bun:1.3.1 AS builder

WORKDIR /app

# Copy base files
COPY package.json bun.lock tsconfig.json ./

# Copy workspaces
COPY web ./web
COPY shared ./shared

# Install jq for JSON manipulation
RUN apt-get update && apt-get install -y jq && rm -rf /var/lib/apt/lists/*

# Modify root package.json to only include web and shared workspaces and remove postinstall
RUN jq '.workspaces = ["./web", "./shared"] | del(.scripts.postinstall)' package.json > package.json.tmp && mv package.json.tmp package.json

# Modify web package.json to remove server dependency
RUN jq 'del(.dependencies.server)' web/package.json > web/package.json.tmp && mv web/package.json.tmp web/package.json

# Modify shared package.json to remove server dependency
RUN jq 'del(.dependencies.server)' shared/package.json > shared/package.json.tmp && mv shared/package.json.tmp shared/package.json

# Install dependencies
RUN bun install

# Build shared first
RUN cd shared && bun run build

# Build the web app (skip type checking to avoid version mismatches from modified deps)
RUN cd web && bun run generate-routes && bunx vite build

# Stage 2: Serve with Nginx
FROM nginx:stable-alpine

# Copy nginx config
COPY --from=builder /app/web/nginx.conf /etc/nginx/nginx.conf

# Copy built artifacts
COPY --from=builder /app/web/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
