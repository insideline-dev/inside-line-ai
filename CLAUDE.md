# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This

Inside Line is a venture capital / startup deal-flow platform. Roles: **admin**, **investor**, **scout**, **founder**. It has an AI pipeline that extracts, researches, evaluates, and synthesizes startup data. Clara is an AI email assistant for deal flow.

## Commands

```bash
# Dev (both services, frontend :3030, backend :8080)
bun dev

# Dev (individual)
bun dev:backend        # NestJS watch mode
bun dev:frontend       # Vite on :3030

# Build
bun build              # both
bun build:backend      # nest build
bun build:frontend     # tsc + vite build

# Type check
cd backend && bunx tsc --noEmit
cd frontend && bunx tsc --noEmit

# Lint
cd backend && bun lint  # eslint --fix
bun lint:frontend       # tsc --noEmit on frontend

# Backend tests
cd backend && bun test              # all
cd backend && bun test --watch      # watch mode
cd backend && bun test src/modules/ai/tests/extraction.spec.ts  # single file

# Database (from backend/)
bun db:generate         # drizzle-kit generate migration
bun db:push             # push schema to DB (dev shortcut)
bun db:migrate          # run migrations
bun db:studio           # Drizzle Studio GUI
bun db:seed:templates   # seed evaluation templates

# API client regeneration (from frontend/, backend must be running with swagger)
bun generate:api        # curl swagger → openapi.json → orval

# Docker
bun docker:up / docker:down / docker:build / docker:logs
```

## Architecture

**Monorepo**: `frontend/` + `backend/` at root. Package manager is **bun** (never npm/yarn).

### Backend (NestJS + Drizzle + PostgreSQL + BullMQ + Redis)

- Entry: `backend/src/main.ts` → `AppModule` in `app.module.ts`
- **Modules pattern**: each feature at `backend/src/modules/<name>/` with `controller`, `module`, `service`, `entities/` (Drizzle schema), `dto/` (Zod via nestjs-zod), `tests/`
- **Auth** lives outside modules at `backend/src/auth/` — JWT httpOnly cookies, Google OAuth, magic links
- **Core services** at root of `backend/src/`: `database/`, `config/`, `queue/`, `storage/`, `email/`, `notification/`
- **Schema barrel**: `backend/src/database/schema.ts` re-exports all entity schemas. After schema changes: `bun db:generate && bun db:push`
- **Env validation**: `backend/src/config/env.schema.ts` (Zod). All env vars typed via `Env` type
- **AI Pipeline** (`modules/ai/`): multi-phase BullMQ pipeline — extraction → scraping → research → evaluation → synthesis. Has `orchestrator/`, `processors/`, `agents/`, `services/`, `prompts/`
- **Clara** (`modules/clara/`): AI email assistant — conversation, submission, and AI services
- **Integrations**: `modules/integrations/` — Twilio (WhatsApp), AgentMail (email), Unipile (LinkedIn)
- **Notifications**: WebSocket gateway at `notification/notification.gateway.ts`
- Swagger available at `/docs` when `ENABLE_SWAGGER=true`

### Frontend (React 19 + Vite + TanStack Router + TanStack Query + shadcn/ui)

- Entry: `frontend/src/main.tsx`
- **Routing**: TanStack Router file-based. `routeTree.gen.ts` is auto-generated (don't edit). Routes in `frontend/src/routes/`
- **Auth guard**: `_protected.tsx` layout route — redirects to `/login` or `/role-select`
- **Role routes**: `routes/_protected/admin/`, `investor/`, `scout/`, `founder/`
- **API layer**: Orval-generated hooks in `frontend/src/api/generated/` (DO NOT EDIT). Custom fetch mutator in `frontend/src/api/client.ts` handles auth, token refresh, 401 retry
- **State**: TanStack Query for server state, Zustand stores in `frontend/src/stores/` for UI state
- **Auth state**: TanStack Query key `["auth", "user"]`, hooks in `frontend/src/lib/auth/hooks.ts`
- **Path alias**: `@/` → `frontend/src/`
- **Styling**: Tailwind CSS v4, shadcn/ui primitives in `components/ui/` (don't edit)
- **Vite proxy**: `/api` → `http://localhost:8080` in dev

## Critical Rules

- **Never hand-write fetch/useQuery for backend endpoints** — use Orval-generated hooks
- **Never edit** `frontend/src/api/generated/` or `routeTree.gen.ts`
- **Never use `queryClient.clear()`** — causes refetch loops. Use `removeQueries` for logout
- **Never use `rm`** — use `trash` for file deletion
- **No `any` types** — zero TS errors required
- **bun only** — never npm/yarn
- After backend endpoint changes → `cd frontend && bun generate:api`
- After schema changes → `cd backend && bun db:generate && bun db:push`
