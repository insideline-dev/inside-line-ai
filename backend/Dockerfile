# ---------- deps: full install for build stage ----------
FROM oven/bun:1.2.5-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------- builder: compile TypeScript to dist/ ----------
FROM oven/bun:1.2.5-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# ---------- prod-deps: production-only install (no devDependencies) ----------
# Also strips dead weight from node_modules:
#  - glibc native binaries (@napi-rs/canvas-linux-arm64-gnu) — Alpine uses musl
#  - duplicate nested @napi-rs/canvas inside pdfjs-dist
#  - pdfjs-dist/legacy (ES5 build, unused since we target modern Node)
#  - pdfjs-dist/types (TypeScript type defs, unused at runtime)
#  - bcrypt prebuilds for non-linux-arm64 platforms
FROM oven/bun:1.2.5-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production && \
    # Remove all glibc native binaries — Alpine uses musl, gnu variants are dead weight
    find node_modules -type d -name "*-gnu*" -prune -exec rm -rf {} + && \
    # Remove duplicate nested @napi-rs/canvas copies (pdfjs-dist nests its own)
    rm -rf node_modules/pdfjs-dist/node_modules/@napi-rs && \
    # Remove unused pdfjs-dist legacy ES5 build and TypeScript definitions
    rm -rf node_modules/pdfjs-dist/legacy node_modules/pdfjs-dist/types && \
    # Remove bcrypt prebuilds for platforms we never target
    rm -rf node_modules/bcrypt/prebuilds/win32-* \
           node_modules/bcrypt/prebuilds/darwin-* && \
    # Clean bun install cache
    rm -rf ~/.bun/install/cache /tmp/*

# ---------- runner: minimal runtime image ----------
FROM oven/bun:1.2.5-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

ENV NODE_ENV=production

COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/src/modules/ai/prompts/library ./src/modules/ai/prompts/library
COPY --chown=nestjs:nodejs package.json ./

RUN mkdir -p /app/logs && chown nestjs:nodejs /app/logs

USER nestjs
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["bun", "run", "start:prod"]
