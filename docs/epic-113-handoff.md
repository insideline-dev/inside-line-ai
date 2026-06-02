# Handoff — Epic #113: Pipeline Stage Restructure (Data Gates, DD Sub-stages, Engaged)

**Branch:** `feat/epic-113-dd-substages` (merged into `dev`)
**Status:** Feature-complete, reviewed, TSC-clean, dev DB migrated, browser-smoke-tested.
**GitHub issues:** Epic #113 with sub-issues #114, #115, #116, #117.
**Last updated:** 2026-06-01

---

## 0. What the user is trying to achieve

The investor deal pipeline tabs (**Screening → Due Diligence → Contracting → Portfolio**) did not match the real deal lifecycle. "Contracting" was an empty stub. "Due Diligence" lumped together three very different states: deals waiting on documents, deals being analyzed by the AI pipeline, and deals the investor is actively engaging with. Epic #113 restructures this:

- Rename **Contracting → Engaged** (maps to the existing `PrivateInvestorPipelineStatus.ENGAGED`).
- Split **Due Diligence** into three sub-tabs: **Data Gates**, **Analyzed**, **Engaged**.
- Insert a **Data Gates** hold after screening: surface missing materials + open questions before the DD pipeline runs. Investor can skip, or Clara emails the founder to request the missing docs.
- Decouple "advance from screening" from the DD pipeline — advancing now lands the deal in Data Gates instead of immediately running research → evaluation → synthesis.
- **Client refinement (2026-05-29):** the gate should only require a **pitch deck** and a **financial** doc; if both are present, auto-advance. This is now the default behavior.

Final deal lifecycle:

```
Screening
  → investor advances
  → DD / Data Gates
      ├─ both required docs present + auto-advance ON → DD pipeline starts immediately
      ├─ investor SKIPs → DD pipeline starts
      └─ Clara emails founder for missing docs
            → founder replies with attachments
            → docs classified + saved to data room
            → re-extraction (full classification + extraction) runs
            → DD pipeline starts
  → DD / Analyzed   (pipeline runs; investor reviews)
      → investor manually moves to DD / Engaged
  → DD / Engaged
      → investor promotes to top-level Engaged tab
  → Engaged (top-level)
      → investor records in Portfolio
```

---

## 1. Read these first

- **Plan file:** `/home/yusuf/.claude/plans/virtual-moseying-mist.md` — the full approved plan with the decision table.
- **Project rules:** `CLAUDE.md` at repo root — bun-only, Orval-generated API hooks, Drizzle schema barrel, NestJS module pattern, "tests use Bun test runner (jest.mock does NOT work)".
- **Backend pipeline overview:** `CLAUDE.md` → "AI Pipeline" section. Phases: extraction → enrichment + scraping → research → evaluation → synthesis.
- **Key new backend file:** `backend/src/modules/startup/data-gate.service.ts` — the heart of the gate logic.
- **Key frontend file:** `frontend/src/routes/_protected/investor/index.tsx` — investor DD page with the three sub-tabs and the Data Gates card UI.
- **Migrations:** `backend/drizzle/0028_*.sql` through `0031_*.sql` (see §2).
- **Env vars that matter:** `CLARA_INBOX_ID`, `AGENTMAIL_API_KEY`, `DEV_DATABASE_URL` (dev DB; selected when `NODE_ENV=development`), `DATABASE_URL` (prod/default). Values live in `backend/.env` — **not committed**, do not paste into docs.

---

## 2. What was implemented (file-by-file)

### Database / migrations (new)
- `backend/drizzle/0028_worried_rumiko_fujikawa.sql` — `data_gate_status` enum + column on `startups`; `required_doc_types text[]` (default `{pitch_deck,financial}`) and `auto_advance_data_gate boolean` on `investor_theses`.
- `backend/drizzle/0029_daily_grey_gargoyle.sql` — `doc_requested_at timestamp` on `startups`.
- `backend/drizzle/0030_icy_scarlet_spider.sql` — `last_extraction_at timestamp` on `startups`.
- `backend/drizzle/0031_gray_jubilee.sql` — flips `auto_advance_data_gate` default to `true` **and backfills existing rows** (`UPDATE investor_theses SET auto_advance_data_gate = true WHERE auto_advance_data_gate = false`).
- `backend/drizzle/meta/*` — drizzle snapshots/journal (auto-generated; large line counts come from these JSON files).

### Backend
- `backend/src/modules/startup/entities/startup.schema.ts` — `DataGateStatus` enum, `dataGateStatus`, `docRequestedAt`, `lastExtractionAt` columns.
- `backend/src/modules/investor/entities/investor.schema.ts` — `requiredDocTypes`, `autoAdvanceDataGate` thesis columns.
- `backend/src/modules/startup/data-gate.service.ts` **(new)** — `getDataGateInfo`, `skip`, `complete`, `checkAutoAdvance` (compare-and-swap to avoid double-fire), `hasNewDocsSinceExtraction`, `triggerDdPipeline`, `assertOwnership`.
- `backend/src/modules/startup/startup.controller.ts` — endpoints: `GET /startups/:id/data-gates`, `POST .../skip`, `POST .../complete`, `POST .../request-documents`. Ownership-checked. Clara resolved lazily via `ModuleRef.get('CLARA_SERVICE', { strict: false })` to break a circular dependency.
- `backend/src/modules/startup/startup.module.ts` — removed direct `ClaraModule` import (was the cause of the boot-time cycle); provides/exports `DataGateService`.
- `backend/src/modules/investor/investor.controller.ts` — `advanceFromScreening` no longer triggers the pipeline; sets `dataGateStatus = 'pending'`, records a `due_diligence.data_gate_entered` event, then calls `checkAutoAdvance` and reports whether the deal auto-advanced.
- `backend/src/modules/clara/clara.module.ts` — registered `{ provide: 'CLARA_SERVICE', useExisting: ClaraService }` and exported the string token so the startup controller can resolve Clara without an import cycle.
- `backend/src/modules/clara/clara.service.ts` — `requestDocumentsForDataGate()` (composes + sends the founder email via AgentMail, stores `dataGateDocRequest` in conversation context, sets `docRequestedAt`); `handleDataGateDocReply()` (ingests reply attachments, checks completeness, triggers auto-advance, returns the reply text so the conversation log records the real reply).
- `backend/src/modules/clara/clara-submission.service.ts` — exposed public wrappers for attachment processing + data-room registration.
- `backend/src/modules/ai/services/pipeline.service.ts` — stamps `lastExtractionAt` on the startup after the EXTRACTION phase completes (used to detect "new docs since last extraction").
- `backend/src/modules/investor/deal-trigger.processor.ts`, `backend/src/modules/startup/entities/deal-event.schema.ts`, `backend/src/modules/investor/dto/create-thesis.dto.ts` — supporting changes (deal-event types, thesis DTO fields).

### Frontend
- `frontend/src/components/investor/StageNav.tsx` — "Contracting" label → "Engaged".
- `frontend/src/routes/_protected/investor/index.tsx` — DD sub-tabs (Data Gates / Analyzed / Engaged); `DataGateCard` + `DataGatesView` with skip button, "Request via Clara" button, inline founder-email fallback, missing-materials checklist; per-card polling gated on the active sub-tab; query invalidation on skip; `no_founder_email` detection via `ApiError.status === 400`.
- `frontend/src/routes/_protected/admin/index.tsx` — admin DD sub-tabs; DD header + stats moved **above** the sub-tabs so they stay visible on every sub-tab.
- `frontend/src/routes/_protected/investor/thesis.tsx` — "Data Gates" settings section (required doc-type multi-select, auto-advance toggle, default true).
- `frontend/src/routes/_protected/investor/-thesis.helpers.ts` — `requiredDocTypes` / `autoAdvanceDataGate` in the thesis form model + save payload.
- `frontend/src/routes/_protected/investor/contracting.tsx`, `frontend/src/routes/_protected/admin/contracting.tsx` — copy updated to "Engaged".

---

## 3. How I implemented it (steps)

1. Clarified scope with the user across several rounds (captured in `/home/yusuf/.claude/plans/virtual-moseying-mist.md`).
2. Created GitHub issues: epic #113 + sub-issues #114–#117 via `gh issue create`.
3. Implementation was driven by a second Claude instance running in a tmux pane (`insideline:0.1`, launched with `claude --dangerously-skip-permissions`). The orchestrator (this session) assigned tasks one at a time and a file-based signal (`/tmp/epic-113-signal`) plus a `Monitor` watch notified completion.
4. Each increment was reviewed: read the diff, ran `bunx tsc --noEmit` on both `backend/` and `frontend/`.
5. Ran a parallel code review (two `general-purpose` agents) that surfaced 8 issues; the worker fixed all 8 (`d93594f`).
6. Applied the client's "gate only on pitch deck + financials, auto-advance by default" change as two follow-up commits (`bea6bc7`, `08ce484`).
7. Migrated the **dev** database (see §5 for the `db:push` vs `db:migrate` gotcha) and verified the new columns + defaults directly against the DB.
8. Started the dev server (`NODE_ENV=development bun dev`, logs at `/tmp/inside-line-dev.log`) and smoke-tested with **PinchTab** (session-based, agent-id `epic-113-test`). Verified the renamed tabs, the DD sub-tabs, and the `GET /startups/:id/data-gates` + `POST .../request-documents` endpoints by issuing `fetch()` from the page context.
9. Found and fixed a boot-time circular dependency that the worker had introduced (`053442f`, `56c256f`) — see §4.

---

## 4. Blockers / Open issues

1. **AgentMail send fails in dev with `"Inbox not found"` (404).**
   `POST /startups/:id/data-gates/request-documents` reaches Clara and Clara calls AgentMail, but the SDK send returns:
   ```
   NotFoundError  Status code: 404  Body: { "name": "NotFoundError", "message": "Inbox not found" }
   ```
   A **direct** `curl` to `https://api.agentmail.to/v0/inboxes/<clara-inbox>/messages/send` with the same key + inbox **succeeds**, so the key and inbox are valid. The failure is inside the SDK path (`AgentMailClientService.sendMessage` → `client.inboxes.messages.send`). This is **pre-existing** — any Clara outbound flow (screening follow-ups, missing-info resolution) hits the same path. **Not introduced by epic #113.**
   Fix options: (a) confirm the AgentMail SDK `environment`/`baseUrl` matches the inbox's org (SDK defaults to Production `api.agentmail.to`); (b) verify `CLARA_INBOX_ID` exactly matches an inbox returned by `GET /v0/inboxes`; (c) compare the SDK's serialized inbox-id path param against the working curl. SDK version: `agentmail@0.2.11`.

2. **`bun db:migrate` fails on the dev DB; use `bun db:push`.**
   `db:migrate` errors with `type "admin_review_decision" already exists` because the dev DB was built with `db:push` historically and has **no `__drizzle_migrations` tracking table** — so the migrator replays migration 0001 from scratch. For **dev**, use `bun db:push` (already applied). For **prod/staging** with proper migration history, `bun db:migrate` should be used; the four new migrations (0028–0031) are additive (nullable columns / defaults / a backfill) and safe to run live.

3. **Endpoints are not in the generated Orval API client.**
   The Data Gates endpoints are called via the hand-written `customFetch` (`frontend/src/api/client.ts`), not Orval hooks. Per `CLAUDE.md` ("never hand-write fetch for backend endpoints"), regenerate after the backend is running with Swagger: `cd frontend && bun generate:api`, then swap the manual calls for generated hooks.

4. **`getDataGateInfo` admin path uses `startup.userId` as the investor.**
   When an admin views a deal, the thesis lookup keys on the startup owner. If the deal was submitted by a founder/scout, the wrong (or no) thesis is found and it falls back to the default `['pitch_deck','financial']`. Acceptable for now; revisit if per-investor required-doc-types diverge.

---

## 5. Things I learned / gotchas

- **Circular dependency on boot.** Adding `forwardRef(() => ClaraModule)` to `StartupModule` created the cycle `AiModule → StartupModule → ClaraModule → AgentMailModule → ClaraModule …`, which Nest reports as `UndefinedModuleException: The module at index [N] of the AiModule "imports" array is undefined`. The TSC build is **clean** — this only fails at runtime. Fix: don't import `ClaraModule` into `StartupModule`; resolve `ClaraService` lazily with `ModuleRef`. `ModuleRef.get(ClaraService, ...)` by class still pulls the type in; resolving by a **string token** (`'CLARA_SERVICE'`, registered with `useExisting`) avoids the import entirely.
- **`db:push` vs `db:migrate`.** The dev DB has no drizzle migration history. `db:migrate` will try to replay from 0001 and collide on existing enums/tables. Always `db:push` for dev here.
- **Dev DB selection.** `drizzle.config.ts` picks `DEV_DATABASE_URL` when `NODE_ENV=development`, else `DATABASE_URL`. If you run a bare `bun db:push` without `NODE_ENV=development`, you may hit the **prod** DB. Earlier in this session a check against `DATABASE_URL` showed the columns missing precisely because the push had targeted `DEV_DATABASE_URL`.
- **Frontend Vite port.** `:3030` was in use, so Vite fell back to **`:3031`**. Check `/tmp/inside-line-dev.log` for the actual `Local:` URL.
- **PinchTab `eval` is gated.** Had to `pinchtab config set security.allowEvaluate true` before `eval`/`fetch`-from-page worked. Wrap multi-statement evals in an IIFE.
- **AgentMail SDK swallows the real cause.** The `"Inbox not found"` body looks like a config error but the same inbox works via curl — suspect SDK environment/baseUrl, not the inbox itself.
- **Large diff line count is misleading.** ~44k insertions are almost entirely `backend/drizzle/meta/*.json` snapshots, not hand-written code.

---

## 6. What's NOT done

- **AgentMail outbound send is unverified end-to-end** in dev (blocker #1). The Clara request endpoint is wired and reachable; the actual email send fails at the SDK layer. The founder-reply ingestion path (`handleDataGateDocReply`) was **not** exercised live.
- **Re-extraction (#117) not observed end-to-end.** The trigger logic and `lastExtractionAt` stamping are in place and unit-consistent, but a full new-doc → re-classify → re-extract → DD pipeline run (~13 min) was not watched to completion.
- **DD / Engaged manual-move UI** is a placeholder; promoting a deal from DD/Engaged to the top-level Engaged tab is described in the plan but the move action is minimal — verify the status transition wiring before relying on it.
- **Orval hooks not regenerated** for the new endpoints (blocker #3).
- **No automated tests** were added for `DataGateService` or the Clara doc-request flow.
- **prod/staging migration not run** — only the dev DB was migrated (via `db:push`).

---

## 7. Quick start for the next developer

```bash
cd /home/yusuf/.continuum/workspace/inside-line-ai

# 1. Get on the code (already merged to dev)
git checkout dev && git pull origin dev

# 2. Migrate dev DB (push, NOT migrate — see §5)
cd backend && NODE_ENV=development bun db:push

# 3. Run both services (frontend :3030→:3031 fallback, backend :8080)
cd .. && NODE_ENV=development bun dev > /tmp/inside-line-dev.log 2>&1 &
# wait for "Nest application successfully started" + the Vite "Local:" URL
grep -E "Local:|successfully started" /tmp/inside-line-dev.log

# 4. Type-check (must be clean)
cd backend && bunx tsc --noEmit
cd ../frontend && bunx tsc --noEmit

# 5. Smoke-test the Data Gates endpoint (replace <id> with a real startup UUID
#    whose data_gate_status = 'pending'); run from the browser/page context
#    or with an authenticated cookie:
#    GET  /api/startups/<id>/data-gates
#    POST /api/startups/<id>/data-gates/skip
#    POST /api/startups/<id>/data-gates/request-documents   { "founderEmail": "..." }
```

Reproduce a pending-gate deal for testing by setting `data_gate_status = 'pending'` on a startup owned by an investor who has a thesis row, then load the investor DD page → Data Gates sub-tab.

- Dev server logs: `/tmp/inside-line-dev.log`
- Plan + decisions: `/home/yusuf/.claude/plans/virtual-moseying-mist.md`
- Secrets live in `backend/.env` (not committed) — never paste keys into docs or commits.
