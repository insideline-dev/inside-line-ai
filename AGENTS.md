# Inside Line — Agent & Developer Guide

## Stack

| Layer    | Tech                                                    |
| -------- | ------------------------------------------------------- |
| Frontend | React 19, Vite, TanStack Router + Query, shadcn/ui     |
| Backend  | NestJS, Drizzle ORM, PostgreSQL, BullMQ, Redis          |
| Auth     | JWT (httpOnly cookies), Google OAuth, Magic Links        |
| Package  | `bun` (never `npm`)                                     |
| Monorepo | `frontend/` and `backend/` at repo root                 |

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
1. **Never hand-write `fetch()` or `useQuery` for backend endpoints.** Use the generated hooks (e.g., `useAdminControllerGetStats`, `useStartupControllerFindAll`).
2. **Never edit files inside `frontend/src/api/generated/`.** They are overwritten on regeneration.
3. After adding/changing backend endpoints, regenerate: `cd frontend && bun run orval`
4. The custom fetch mutator in `frontend/src/api/client.ts` handles auth cookies, token refresh, and 401 redirects automatically.
5. `GET /auth/me` is excluded from the 401 refresh+redirect logic (it's a session check, not an authed call).

### Auth Flow

- Auth state lives in TanStack Query (`["auth", "user"]` key), managed by hooks in `frontend/src/lib/auth/hooks.ts`.
- `useCurrentUser()` → `GET /auth/me` (session check)
- `useLogin()`, `useRegister()`, `useVerifyMagicLink()` → set user in query cache + navigate
- `useSelectRole()` → `POST /auth/select-role` (onboarding)
- Logout clears the auth query with `removeQueries` — **never use `queryClient.clear()`** (causes refetch loops on login page).
- `_protected.tsx` layout route guards all authed pages. Redirects to `/login` if unauthenticated, `/role-select` if `onboardingCompleted` is false.

### Backend: Drizzle ORM

- Schema files live in each module's `entities/` dir (e.g., `backend/src/auth/entities/auth.schema.ts`).
- All schemas re-exported via `backend/src/database/schema.ts`.
- After schema changes: `cd backend && bunx drizzle-kit generate && bunx drizzle-kit push`

### Backend: Modules

Each feature is a NestJS module under `backend/src/modules/<name>/` with:
- `<name>.controller.ts` — routes
- `<name>.module.ts` — DI wiring
- `entities/` — Drizzle schema
- `dto/` — Zod DTOs via `nestjs-zod`
- `tests/` — test files

Auth module is at `backend/src/auth/` (not under `modules/`).

### Frontend: Routes

TanStack Router file-based routing:
- `frontend/src/routes/_protected/` — authed routes (guarded by `_protected.tsx`)
- `frontend/src/routes/_protected/<role>/` — role-specific pages
- Route tree auto-generated in `routeTree.gen.ts` — don't edit manually.

### Frontend: Components

- UI primitives: `frontend/src/components/ui/` (shadcn — don't edit)
- Feature components: `frontend/src/components/`
- Layout: `frontend/src/components/layouts/RoleSidebar.tsx` — sidebar nav per role

### Environment

- Backend env schema: `backend/src/config/env.schema.ts`
- Frontend env: `frontend/src/env.ts` (reads `VITE_*` vars)
- `VITE_MOCK_AUTH=true` enables mock auth mode (role switcher visible, auth checks bypassed)
- `VITE_MOCK_AUTH=false` (default) uses real auth

## Type Checking & Lint

```bash
# Backend
cd backend && bunx tsc --noEmit

# Frontend
cd frontend && bunx tsc --noEmit
```

Zero errors required before completion. No `any` types.

## File Deletion

Use `trash` only. Never `rm`, `rmdir`, or `rm -rf`.
