# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This

Inside Line is a venture capital / startup deal-flow platform. Roles: **admin**, **investor**, **scout**, **founder**. It has a multi-phase AI pipeline (extraction → enrichment → scraping → research → evaluation → synthesis) that processes startup pitch decks and produces investment memos + scores. Clara is an AI email assistant for deal flow via AgentMail.

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
- **Auth** lives outside modules at `backend/src/auth/` — JWT httpOnly cookies, Google OAuth, magic links. `JwtAuthGuard` is app-wide default. Mark public routes with `@Public()`.
- **Core services** at root of `backend/src/`: `database/`, `config/`, `queue/`, `storage/`, `email/`, `notification/`
- **Schema barrel**: `backend/src/database/schema.ts` re-exports all entity schemas. After schema changes: `bun db:generate && bun db:push`
- **Env validation**: `backend/src/config/env.schema.ts` (Zod). All env vars typed via `Env` type
- **AI Pipeline** (`modules/ai/`): multi-phase BullMQ pipeline. Phases with dependencies:
  - `extraction` (8m) → `enrichment` (5m, parallel with `scraping`) + `scraping` (10m) → `research` (10m) → `evaluation` (12m, 11 agents) → `synthesis` (8m)
  - Has `orchestrator/`, `processors/`, `agents/`, `services/`, `prompts/`, `schemas/`, `interfaces/`
- **Clara** (`modules/clara/`): AI email assistant — `clara-ai`, `clara-conversation`, `clara-submission`, `clara-tools` services
- **Integrations** (`modules/integrations/`): `agentmail/` (email/Clara), `twilio/` (WhatsApp), `unipile/` (LinkedIn enrichment)
- **Analysis** (`modules/analysis/`): post-pipeline analysis with BullMQ processors for scoring, matching, PDF generation, market analysis
- **Notifications**: WebSocket gateway at `notification/notification.gateway.ts` + Socket.IO on frontend
- Swagger available at `/docs` when `ENABLE_SWAGGER=true`

#### AI Pipeline Agents

**Research agents** (run in parallel during research phase):
`team-research`, `market-research`, `product-research`, `competitor-research`, `news-research`

**Evaluation agents** (run in parallel during evaluation phase, min 8/11 required):
`team`, `market`, `product`, `traction`, `business-model`, `gtm`, `financials`, `competitive-advantage`, `legal`, `deal-terms`, `exit-potential`

Each agent has a corresponding Zod schema in `modules/ai/schemas/`.

#### Integration Services Pattern

All integration services (AgentMail, Twilio, Unipile) follow the same pattern:
- Inject `ConfigService`
- `isConfigured()` method checks required keys
- Throw `ServiceUnavailableException` if not configured

#### DTOs

All DTOs use `createZodDto()` from `nestjs-zod`. Validation is automatic via `ZodValidationPipe`.

### Frontend (React 19 + Vite + TanStack Router + TanStack Query + shadcn/ui)

- Entry: `frontend/src/main.tsx`
- **Routing**: TanStack Router file-based. `routeTree.gen.ts` is auto-generated (don't edit). Routes in `frontend/src/routes/`
- **Auth guard**: `_protected.tsx` layout route — redirects to `/login` or `/role-select`
- **Role routes**: `routes/_protected/admin/`, `investor/`, `scout/`, `founder/`
- **API layer**: Orval-generated hooks in `frontend/src/api/generated/` (DO NOT EDIT). Custom fetch mutator in `frontend/src/api/client.ts` handles auth, token refresh, 401 retry, 429 backoff
- **State**: TanStack Query for server state, Zustand stores in `frontend/src/stores/` for UI state
  - `useUIStore` — sidebar, modals
  - `useFilterStore` — startup list filters (search, status, stage, score, sort)
  - `useMockAuthStore` — dev-only mock auth
- **Auth state**: TanStack Query key `["auth", "user"]`, hooks in `frontend/src/lib/auth/hooks.ts`
- **Real-time**: WebSocket via `frontend/src/lib/auth/useSocket.ts` (Socket.IO). Pipeline progress via `useStartupRealtimeProgress.ts` (polling + WS)
- **Path alias**: `@/` → `frontend/src/`
- **Styling**: Tailwind CSS v4, shadcn/ui primitives in `components/ui/` (don't edit)
- **Vite proxy**: `/api` → `http://localhost:8080` in dev
- **PDF export**: `@react-pdf/renderer` in `frontend/src/lib/pdf/`
- **Scoring**: `frontend/src/lib/score-utils.ts` — `computeWeightedScore(sectionScores, weights)`

#### Key Frontend Components

- `components/startup-view/` — modular per-role startup detail tabs
- `components/pipeline/` — visual AI pipeline flow builder (drag-drop canvas)
- `components/analysis/` — score rings, status badges, breakdown charts
- `components/layouts/RoleSidebar.tsx` — role-specific nav

#### Key Frontend Types

- `types/startup.ts` — `Startup`, `StartupStatus`, `FundingStage`
- `types/evaluation.ts` — `Evaluation`, `SectionScores`, `InvestorMemo`, `FounderReport`, `Source`
- `types/pipeline-progress.ts` — `PipelinePhaseProgress`, `PipelineAgentProgress`, `PipelineAgentTrace`
- `types/investor.ts` — `InvestorMatch`, `InvestmentThesis`, `ScoringWeights`
- `types/admin.ts` — `AgentPrompt`, `Analytics`, `AgentConversation`

## Critical Rules

- **Never hand-write fetch/useQuery for backend endpoints** — use Orval-generated hooks
- **Never edit** `frontend/src/api/generated/` or `routeTree.gen.ts`
- **Never use `queryClient.clear()`** — causes refetch loops. Use `removeQueries` for logout
- **Never use `rm`** — use `trash` for file deletion
- **No `any` types** — zero TS errors required
- **bun only** — never npm/yarn
- **Tests use Bun test runner** — `jest.mock()` does NOT work. Use NestJS `TestingModule` with manual mocks
- After backend endpoint changes → `cd frontend && bun generate:api`
- After schema changes → `cd backend && bun db:generate && bun db:push`
- `VITE_MOCK_AUTH=true` enables mock auth mode (dev only, bypasses real auth)
