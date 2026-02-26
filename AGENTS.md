# Inside Line — Agent & Developer Guide

## Stack

| Layer    | Tech                                                    |
| -------- | ------------------------------------------------------- |
| Frontend | React 19, Vite, TanStack Router + Query, shadcn/ui      |
| Backend  | NestJS, Drizzle ORM, PostgreSQL, BullMQ, Redis          |
| Auth     | JWT (httpOnly cookies), Google OAuth, Magic Links        |
| Package  | `bun` (never `npm` or `yarn`)                           |
| Monorepo | `frontend/` and `backend/` at repo root                 |
| Email    | Resend (transactional email)                            |
| Storage  | R2 / S3 / Backblaze (presigned URL flow)                |

---

## Critical Patterns

### API Client — Orval (MUST USE)

Frontend API calls are **auto-generated** by [Orval](https://orval.dev/) from the backend's OpenAPI spec.

```
frontend/orval.config.ts     → config
frontend/openapi.json        → spec (from backend Swagger)
frontend/src/api/generated/  → generated hooks + types (DO NOT EDIT)
frontend/src/api/client.ts   → custom fetch mutator (shared by Orval)
```

**Rules:**
1. **Never hand-write `fetch()` or `useQuery` for backend endpoints.** Use generated hooks.
2. **Never edit files inside `frontend/src/api/generated/`.** Overwritten on regeneration.
3. After adding/changing backend endpoints, regenerate: `cd frontend && bun generate:api`
4. The custom fetch mutator handles auth cookies, token refresh (401), and 429 backoff.
5. `GET /auth/me` is excluded from 401 refresh+redirect logic.

### Auth Flow

- Auth state: TanStack Query key `["auth", "user"]` via `frontend/src/lib/auth/hooks.ts`
- `useCurrentUser()` → `GET /auth/me`
- `useLogin()`, `useRegister()`, `useVerifyMagicLink()` → set user in cache + navigate
- `useSelectRole()` → `POST /auth/select-role`
- Logout uses `removeQueries` — **never `queryClient.clear()`** (causes refetch loops)
- `_protected.tsx` guards all authed routes. Redirects to `/login` if unauth, `/role-select` if `onboardingCompleted` is false.
- Rate limiting: ThrottlerGuard, 100 req/min by default

### Backend: Drizzle ORM

- Schemas in each module's `entities/` dir (e.g., `modules/startup/entities/startup.schema.ts`)
- All schemas re-exported via `backend/src/database/schema.ts`
- After schema changes: `cd backend && bun db:generate && bun db:push`
- `onConflictDoUpdate` requires `.returning()` to get results back

### Backend: Integration Services Pattern

Integration services (AgentMail, Twilio, Unipile) follow this pattern:
- Inject `ConfigService`
- `isConfigured()` guard method
- Throw `ServiceUnavailableException` if not configured

### Backend: DTOs

- All DTOs use `createZodDto` from `nestjs-zod`
- Validation is automatic via `ZodValidationPipe`

### Frontend: Routing

TanStack Router file-based routing:
- `frontend/src/routes/_protected/` — authed routes
- `frontend/src/routes/_protected/<role>/` — role-specific pages
- `routeTree.gen.ts` — auto-generated, **never edit manually**

### Frontend: State

- **Server state**: TanStack Query (all API data)
- **UI state**: Zustand stores in `frontend/src/stores/`
  - `useUIStore` — sidebar collapse, modal open/close
  - `useFilterStore` — startup list filters (search, status, stage, score range, sort)
  - `useMockAuthStore` — dev-only mock auth role switcher

### Environment

- Backend env schema: `backend/src/config/env.schema.ts` — Zod-validated `Env` type
- Frontend env: `frontend/src/env.ts` (reads `VITE_*` vars)
- `VITE_MOCK_AUTH=true` enables mock auth (role switcher, bypasses auth checks)

---

## Backend Modules

### Auth (`backend/src/auth/`) — Global Module

| File | Purpose |
|------|---------|
| `auth.service.ts` | Google OAuth, magic link, token refresh |
| `user-auth.service.ts` | Register, login, role selection |
| `profile.service.ts` | User profile CRUD |
| `auth.controller.ts` | Auth endpoints |
| `strategies/` | Passport JWT + Google OAuth strategies |
| `guards/` | `JwtAuthGuard` (app-wide default), `ThrottlerGuard` |

### AI Pipeline (`backend/src/modules/ai/`)

The core intelligence system. Multi-phase BullMQ pipeline with orchestration.

**Pipeline Phases** (in order, with dependencies):

| Phase | Queue | Timeout | Parallel With | Depends On |
|-------|-------|---------|---------------|------------|
| `extraction` | `AI_EXTRACTION` | 8m | — | — |
| `enrichment` | `AI_ENRICHMENT` | 5m | scraping | extraction |
| `scraping` | `AI_SCRAPING` | 10m | enrichment | extraction |
| `research` | `AI_RESEARCH` | 10m | — | enrichment, scraping |
| `evaluation` | `AI_EVALUATION` | 12m | — | research |
| `synthesis` | `AI_SYNTHESIS` | 8m | — | evaluation |

Max pipeline timeout: 45 minutes. Min evaluation agents required: 8/11.

**Processors** (`processors/`):

| File | Purpose |
|------|---------|
| `extraction.processor.ts` | Extract structured data from pitch deck (PDF/PPTX/OCR) |
| `enrichment.processor.ts` | Enrich via web search + Brave API |
| `scraping.processor.ts` | Scrape website + LinkedIn team profiles |
| `research.processor.ts` | Run 5 parallel research agents |
| `evaluation.processor.ts` | Run 11 parallel evaluation agents |
| `synthesis.processor.ts` | Synthesize into score + memo |
| `matching.processor.ts` | Match startup to investors |

**Research Agents** (`agents/research/`):
- `team-research.agent.ts` — Team background, LinkedIn, experience
- `market-research.agent.ts` — TAM/SAM/SOM, market dynamics
- `product-research.agent.ts` — Product differentiation, tech stack
- `news-research.agent.ts` — Recent press, sentiment
- `competitor-research.agent.ts` — Competitive landscape

**Evaluation Agents** (`agents/evaluation/`):
- `team-evaluation.agent.ts`
- `market-evaluation.agent.ts`
- `product-evaluation.agent.ts`
- `traction-evaluation.agent.ts`
- `business-model-evaluation.agent.ts`
- `gtm-evaluation.agent.ts`
- `financials-evaluation.agent.ts`
- `competitive-advantage-evaluation.agent.ts`
- `legal-evaluation.agent.ts`
- `deal-terms-evaluation.agent.ts`
- `exit-potential-evaluation.agent.ts`

**Synthesis Agent** (`agents/synthesis/synthesis.agent.ts`): Produces final score (0–100), recommendation (Pass/Consider/Decline), investor memo, founder report.

**Key Services** (`services/`):

| Service | Purpose |
|---------|---------|
| `pipeline.service.ts` | Main pipeline entry point |
| `extraction.service.ts` | PDF/PPTX/OCR text extraction |
| `pdf-text-extractor.service.ts` | PDF parsing (pdf-parse library) |
| `pptx-text-extractor.service.ts` | PowerPoint text extraction |
| `mistral-ocr.service.ts` | Mistral AI OCR for scanned decks |
| `scraping.service.ts` | Website scraping |
| `website-scraper.service.ts` | Multi-page website crawler |
| `research.service.ts` | Orchestrate research agents |
| `research-parameters.service.ts` | Dynamic research configuration |
| `evaluation.service.ts` | Orchestrate evaluation agents |
| `evaluation-agent-registry.service.ts` | Registry of all evaluation agents |
| `enrichment.service.ts` | Web enrichment pipeline |
| `linkedin-enrichment.service.ts` | LinkedIn team enrichment via Unipile |
| `synthesis.service.ts` | Final synthesis + memo generation |
| `memo-generator.service.ts` | PDF memo generation |
| `score-computation.service.ts` | Weighted score computation |
| `gap-analysis.service.ts` | Identify missing information |
| `brave-search.service.ts` | Brave Search API client |
| `gemini-research.service.ts` | Gemini API for research |
| `ai-provider.service.ts` | AI provider abstraction (OpenAI, Gemini, Mistral) |
| `ai-model-config.service.ts` | Per-phase model configuration |
| `ai-prompt.service.ts` | Prompt loading + rendering |
| `ai-prompt-runtime.service.ts` | Runtime prompt injection |
| `ai-context-config.service.ts` | Context building for prompts |
| `pipeline-state.service.ts` | Pipeline DB state management |
| `pipeline-flow-config.service.ts` | Dynamic pipeline config (stored in DB) |
| `pipeline-agent-trace.service.ts` | Execution trace logging |
| `pipeline-feedback.service.ts` | Admin feedback on pipeline results |
| `progress-tracker.service.ts` | Phase/agent progress tracking (Redis) |
| `startup-matching-pipeline.service.ts` | Investor ↔ startup matching |
| `investor-matching.service.ts` | Thesis-based matching logic |
| `location-normalizer.service.ts` | Normalize startup location data |
| `scraping-cache.service.ts` | Redis cache for scraped pages |
| `redis-fallback.service.ts` | Graceful Redis failure handling |
| `clara-email-context.service.ts` | Build email context for AI pipeline |
| `ai-debug-log.service.ts` | Pipeline debug logging |
| `ai-flow-catalog.ts` | Static catalog of flow types |
| `ai-prompt-catalog.ts` | Static catalog of prompts |

**Orchestrator** (`orchestrator/`):
- `orchestrator.module.ts` — DI wiring
- `phase-transition.service.ts` — Phase state machine transitions
- `error-recovery.service.ts` — Retry + recovery logic
- `progress-tracker.service.ts` — Redis-backed progress state
- `pipeline.config.ts` — Phase DAG config (`DEFAULT_PIPELINE_CONFIG`)

**Schemas** (`schemas/`): Zod schemas for each pipeline output (extraction, research agents, evaluation agents, synthesis, matching).

**Interfaces** (`interfaces/`):
- `phase-results.interface.ts` — All phase result types (`ExtractionResult`, `ScrapingResult`, `ResearchResult`, `EvaluationResult`, `SynthesisResult`, `EnrichmentResult`, `ClaraEmailContext`)
- `pipeline.interface.ts` — `PipelinePhase` enum, `PhaseStatus` enum
- `research-parameters.interface.ts` — `ResearchParameters` shape
- `agent.interface.ts` — Base agent interface
- `progress-callback.interface.ts` — Progress event types

### Clara (`backend/src/modules/clara/`)

AI email assistant for deal flow.

| File | Purpose |
|------|---------|
| `clara.service.ts` | Entry point, dispatch to sub-services |
| `clara-conversation.service.ts` | Manage email conversation state |
| `clara-submission.service.ts` | Process startup submissions via email |
| `clara-ai.service.ts` | AI prompt generation + completion |
| `clara-tools.service.ts` | Tool calling for Clara AI actions |

### Admin (`backend/src/modules/admin/`)

| Service | Purpose |
|---------|---------|
| `admin.controller.ts` | Admin REST endpoints |
| `analytics.service.ts` | Platform analytics + reporting |
| `user-management.service.ts` | User CRUD, role assignment |
| `queue-management.service.ts` | BullMQ queue introspection + control |
| `scoring-config.service.ts` | Scoring weights management |
| `system-config.service.ts` | Global system configuration |
| `admin-matching.service.ts` | Admin-triggered matching operations |
| `integration-health.service.ts` | Check health of all integrations |
| `bulk-data.service.ts` | Bulk import/export operations |
| `data-import.service.ts` | CSV/data import |
| `cache.service.ts` | Cache management |

### Startup (`backend/src/modules/startup/`)

| Service | Purpose |
|---------|---------|
| `startup.service.ts` | Core startup CRUD |
| `startup-intake.service.ts` | Intake form processing, pipeline trigger |
| `draft.service.ts` | Save/restore submission drafts |
| `pdf.service.ts` | Pitch deck upload + storage |
| `data-room.service.ts` | Document data room management |
| `investor-interest.service.ts` | Track investor interest signals |
| `meeting.service.ts` | Meeting scheduling |

### Investor (`backend/src/modules/investor/`)

| Service | Purpose |
|---------|---------|
| `investor.service.ts` | Investor profile CRUD |
| `thesis.service.ts` | Investment thesis management |
| `match.service.ts` | Investor ↔ startup match access |
| `deal-pipeline.service.ts` | Deal stage tracking (new/reviewing/engaged/closed/passed) |
| `portfolio.service.ts` | Portfolio company tracking |
| `messaging.service.ts` | Investor ↔ founder messaging |
| `investor-note.service.ts` | Deal notes |
| `team.service.ts` | Investor team members |
| `scoring-preferences.service.ts` | Custom scoring weights per stage |

### Scout (`backend/src/modules/scout/`)

| Service | Purpose |
|---------|---------|
| `scout.service.ts` | Scout profile CRUD |
| `submission.service.ts` | Scout startup submissions |
| `scout-metrics.service.ts` | Performance metrics |
| `commission.service.ts` | Commission tracking |

### Portal (`backend/src/modules/portal/`)

Investor-branded portal for founder submissions.

| Service | Purpose |
|---------|---------|
| `portal.service.ts` | Portal CRUD (name, slug, branding) |
| `submission.service.ts` | Portal-sourced startup submissions |

### Analysis (`backend/src/modules/analysis/`)

Post-pipeline analysis (independent of AI pipeline).

| Service/Processor | Purpose |
|---------|---------|
| `analysis.service.ts` | Analysis orchestration |
| `processors/scoring.processor.ts` | Score recomputation jobs |
| `processors/matching.processor.ts` | Matching jobs |
| `processors/pdf.processor.ts` | PDF generation jobs |
| `processors/market-analysis.processor.ts` | Market analysis jobs |

### Integrations (`backend/src/modules/integrations/`)

| Integration | Files | Purpose |
|-------------|-------|---------|
| AgentMail | `agentmail/` | AI email inbox (Clara). Webhook-driven. `AgentMailClient` from `agentmail` package |
| Twilio | `twilio/` | WhatsApp messaging, phone verification |
| Unipile | `unipile/` | LinkedIn profile scraping, team enrichment |

### Geography (`backend/src/modules/geography/`)

- `geography-taxonomy.ts` — Geographic taxonomy data + helpers
- Used for normalizing/validating location inputs

### Early Access (`backend/src/modules/early-access/`)

Waitlist + invite code management pre-launch.

### Agent (`backend/src/modules/agent/`)

Shared agent entity schema (DB table for agents/tools).

---

## Core Services

| Service | Location | Purpose |
|---------|----------|---------|
| Database | `backend/src/database/` | Drizzle ORM + PostgreSQL via `DrizzleService` |
| Queue | `backend/src/queue/` | BullMQ wrapper + `QueueService`, `TaskProcessor` |
| Storage | `backend/src/storage/` | S3/R2/Backblaze via `StorageService`, presigned URL generation |
| Email | `backend/src/email/` | Resend-powered `EmailService` (global module) |
| Notification | `backend/src/notification/` | WebSocket gateway (`NotificationGateway`), push notifications |

---

## DB Schema Entities

Schemas are in each module's `entities/` directory and re-exported from `backend/src/database/schema.ts`.

| Module | Key Tables |
|--------|-----------|
| auth | users, profiles, sessions, magic_links |
| startup | startups, startup_drafts, investor_interests, meetings, data_room_files |
| ai | pipelines, pipeline_phases, pipeline_agent_traces, pipeline_feedback, ai_prompts, pipeline_flow_configs |
| investor | investor_profiles, investment_theses, investor_matches, deal_pipeline_entries, investor_notes, portfolio_companies, investor_teams |
| scout | scout_profiles, scout_submissions, commissions |
| portal | investor_portals, portal_submissions |
| clara | clara_conversations, clara_messages |
| analysis | analysis_results |
| integrations | agentmail_webhooks, unipile_linkedin_cache |
| early_access | early_access_entries |
| notification | notifications |
| storage | storage_assets |

---

## Frontend Routes

### Role-Based Pages

**Admin** (`/admin`):
- `/admin` — Dashboard (stats, pending queue)
- `/admin/startup/:id` — Startup detail + edit + pipeline monitor
- `/admin/agents` — Agent prompt management
- `/admin/analytics` — Platform analytics
- `/admin/conversations` — Clara email conversations
- `/admin/flow` — AI pipeline flow builder (visual drag-drop)
- `/admin/integrations` — Integration health + config
- `/admin/scoring` — Scoring weights
- `/admin/scouts` — Scout management
- `/admin/users` — User management

**Investor** (`/investor`):
- `/investor` — Dashboard (matches, pipeline)
- `/investor/startup/:id` — Startup detail (investor view)
- `/investor/thesis` — Investment thesis
- `/investor/pipeline` — Deal pipeline
- `/investor/portfolio` — Portfolio
- `/investor/scoring` — Custom scoring preferences
- `/investor/portal` — Investor portal config
- `/investor/messaging` — Founder outreach
- `/investor/notes` — Deal notes
- `/investor/submit` — Submit startup for review

**Scout** (`/scout`):
- `/scout` — Dashboard (metrics, leaderboard)
- `/scout/startup/:id` — Startup detail (scout view)
- `/scout/apply` — Apply to become a scout
- `/scout/leaderboard` — Performance leaderboard
- `/scout/commissions` — Commission tracking
- `/scout/metrics` — Performance metrics
- `/scout/submit` — Submit startup

**Founder** (`/founder`):
- `/founder` — Dashboard (investor interest, submissions)
- `/founder/startup/:id` — Startup detail (founder view)
- `/founder/submit` — Startup submission form
- `/founder/data-room` — Document data room
- `/founder/investor-interest` — Investor interest tracker
- `/founder/meetings` — Meeting tracker

**Public**:
- `/` — Landing page
- `/login` — Login
- `/waitlist` — Waitlist signup
- `/apply/:slug` — Scout-linked apply page
- `/auth/callback` — OAuth callback
- `/auth/magic-link` — Magic link verification

---

## Frontend Key Files

### Types (`frontend/src/types/`)

| File | Key Types |
|------|-----------|
| `startup.ts` | `Startup`, `StartupStatus`, `FundingStage`, `StartupDraft`, `StartupFormData` |
| `evaluation.ts` | `Evaluation`, `SectionScores`, `InvestorMemo`, `FounderReport`, `Source`, `AnalysisProgress` |
| `user.ts` | `User`, `UserRole`, `Notification`, `ScoutApplication` |
| `investor.ts` | `InvestorMatch`, `InvestmentThesis`, `ScoringWeights`, `PortalSettings`, `InvestorTeamMember` |
| `admin.ts` | `AgentPrompt`, `Analytics`, `DashboardStats`, `AgentConversation`, `AdminReview` |
| `pipeline-progress.ts` | `PipelinePhaseProgress`, `PipelineAgentProgress`, `PipelineAgentTrace`, `PipelineProgressData` |

### Key Components (`frontend/src/components/`)

| Component | Purpose |
|-----------|---------|
| `layouts/RoleSidebar.tsx` | Role-specific nav sidebar |
| `NotificationCenter.tsx` | Real-time WebSocket notifications |
| `DataTable.tsx` | Generic data table |
| `SearchAndFilters.tsx` | Filter bar + store integration |
| `startup-view/AdminPipelineLivePanel.tsx` | Live pipeline execution monitor |
| `startup-view/PhaseDataInspector.tsx` | Debug: inspect per-phase extracted data |
| `pipeline/PipelineCanvas.tsx` | Visual pipeline flow builder |
| `pipeline/NodeConfigSheet.tsx` | Node prompt/config editor |
| `analysis/ScoreRing.tsx` | Circular score visualization |
| `FileUploadDropzone.tsx` | Drag-drop file upload |

### Key Libs (`frontend/src/lib/`)

| File | Purpose |
|------|---------|
| `auth/hooks.ts` | `useCurrentUser`, `useLogin`, `useLogout`, auth mutations |
| `auth/useSocket.ts` | WebSocket (Socket.IO) hook for real-time events |
| `useStartupRealtimeProgress.ts` | Real-time pipeline progress (polling + WS) |
| `pdf/report-pdf.tsx` | Generate PDF reports via `@react-pdf/renderer` |
| `score-utils.ts` | `computeWeightedScore(sectionScores, weights)` |
| `utils.ts` | `cn()` (clsx + tailwind-merge), `safeRedirect()` |
| `query-client.ts` | TanStack Query client config |

---

## Environment Variables (Key)

```bash
# Core
NODE_ENV, PORT, DATABASE_URL, REDIS_URL

# Auth
JWT_SECRET, JWT_ACCESS_EXPIRES, JWT_REFRESH_EXPIRES
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
APP_URL, FRONTEND_URL

# AI
OPENAI_API_KEY, MISTRAL_API_KEY, BRAVE_SEARCH_API_KEY

# Integrations
AGENTMAIL_API_KEY, AGENTMAIL_WEBHOOK_SECRET
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER
UNIPILE_DSN, UNIPILE_API_KEY, UNIPILE_ACCOUNT_ID

# Storage
STORAGE_PROVIDER (r2|s3|backblaze)
STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY
STORAGE_BUCKET_NAME, STORAGE_PUBLIC_URL

# Email
RESEND_API_KEY

# Feature flags
ENABLE_SWAGGER, DEV_EXPOSE_TOKENS

# Queue concurrency (per phase)
AI_QUEUE_CONCURRENCY_EXTRACTION/ENRICHMENT/SCRAPING/RESEARCH/EVALUATION/SYNTHESIS/MATCHING
```

---

## Type Checking & Lint

```bash
# Backend
cd backend && bunx tsc --noEmit
cd backend && bun lint

# Frontend
cd frontend && bunx tsc --noEmit  # (alias: bun lint:frontend)
```

Zero errors required before completion. No `any` types.

---

## File Deletion

Use `trash` only. Never `rm`, `rmdir`, or `rm -rf`.
