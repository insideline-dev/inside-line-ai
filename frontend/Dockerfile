FROM oven/bun:1.2.5-alpine AS builder
WORKDIR /app

# Same-origin `/api` is proxied to `backend:8080` by nginx.conf — avoids relying on
# external API hostnames/DNS when frontend and API share docker-compose.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run generate-routes && bun run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
