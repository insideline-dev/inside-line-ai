# YUSUP PROJECT MEMORY

This file is the running project memory for Inside Line.
It should be updated after meaningful work so context accumulates inside the repo.

## Working agreement
- Keep a running record of what was changed, what was learned, current system understanding, active risks, and next-step context.
- Favor concise, durable notes over raw transcripts.

## 2026-05-05

### Current objective
- Own the `deal-screening` branch end to end and make it practical to develop, test, and validate against existing startups without re-uploading them.

### What I changed
- Cloned and ran `insideline-dev/inside-line-ai` locally with Docker Compose.
- Copied the repo root `.env` into `backend/.env` because the backend compose service reads its env from there.
- Fixed local auth email links by changing `FRONTEND_URL` from `http://localhost:3030` to `http://localhost:3000` in local env.
- Verified login with `yusufisbusy@gmail.com` and confirmed access reaches the admin dashboard.
- Implemented the first pass of deal-screening gating and related fixes on the local `deal-screening` branch.
- Rebuilt the stack from the current branch and tested on an existing approved startup instead of re-uploading a new one.

### What I learned
- Local dev stack runs at:
  - frontend: `http://localhost:3000`
  - backend: `http://localhost:8080`
- Admin login uses magic-link email flow and works in local dev after the `FRONTEND_URL` fix.
- Existing approved startup used for testing: `Path Robotics`
  - startup id: `51c16a55-70d8-4fdb-9de2-88d9a7fc0602`
- The original branch intent is that screening should act as a gate before evaluation, not a parallel sibling.
- For old startups after a restart, reusable pipeline state may be missing; in that case, the new screening action should still be useful by falling back to a full pipeline restart.

### Backend understanding from current pass
- Screening now gates evaluation in pipeline ordering.
- Founder timeline leakage and client-supplied triage snapshot issues were addressed.
- Screening rerun on an existing approved startup now falls back to a full pipeline restart when no reusable pipeline state exists.

### Frontend understanding from current pass
- Logout/login needed explicit clearing of investor-scoped UI state like thesis-axis filters.
- Investor onboarding website submission needed a pending local state so the "generating thesis" banner appears immediately on first run.
- Admin rerun UI now exposes screening as a rerun entry and supports clearer dev testing from an existing startup.

### Live validation status
- A real rerun was triggered on `Path Robotics` from the admin UI flow.
- Verified trigger path behavior and Pipeline Live progression on an existing startup.
- Confirmed one important failure mode first: screening produced a `reject` decision while evaluation still ran, which proved the original first-pass gating work was incomplete.
- Patched the pipeline so screening results are carried into runtime state and a `review`/`reject` outcome skips both evaluation and synthesis.
- Re-tested on `Path Robotics` after the patch.
- Final verified outcome on run `b1ad3add-190b-4d19-9aa2-8b17f1904679`:
  - screening completed
  - decision classification: `reject`
  - reason code: `low_overall_score`
  - startup status moved to `pending_review`
  - evaluation: `skipped`
  - synthesis: `skipped`
  - pipeline status: `completed`

### Evidence captured
- Admin dashboard screenshot after login.
- Existing startup Pipeline Live screenshot after rerun trigger.
- Pipeline Live screenshot showing the corrected gate behavior with evaluation and synthesis skipped.
- Additional login/dashboard screenshots from local validation.

### Open risks / things still to verify
- Whether `advance` deals continue cleanly into evaluation under the new gating semantics.
- Whether `review` classification should land in a distinct startup status versus the current `pending_review` handling.
- Whether screening reason codes / decision detail should be surfaced more explicitly in Pipeline Live instead of requiring API inspection.
- Any remaining controller-spec / repo-level typecheck issues not directly caused by these edits.

### Additional milestone — screening lens root-cause fix
- Found the concrete reason the screening verdict was not trustworthy: all three lenses were falling back because the shared `LensEvidenceSchema.source` field generated an invalid structured-output schema for the model/API.
- Fixed the shared schema so `source` is `optional().nullable()` in `backend/src/modules/ai/schemas/lens/lens-output.schema.ts`.
- Re-ran the targeted lens tests and they passed.
- This should let screening produce real lens outputs instead of zero-score fallback outputs, which is required before screening verdicts are trustworthy.

### Additional milestone — screening UI / phase-order fixes
- Added `screening` to the canonical frontend pipeline phase order so it renders between `research` and `evaluation` instead of being appended at the end.
- Added a reusable screening summary card to the admin startup view so users can see:
  - screening classification
  - score
  - reason codes
  - missing materials
  - lens summaries
  - downstream phase status
- Verified frontend typecheck and build after these UI changes.
- This closes the visibility gap where the gate behavior was correct but users could not easily understand why a startup was advanced, reviewed, or rejected.

### Additional milestone — screening lenses now produce meaningful output
- Rebuilt and re-ran `Path Robotics` after the shared lens schema fix.
- Latest screening decision for `Path Robotics` now returns a real `advance` outcome instead of the earlier fallback-driven `reject`.
- Current live decision snapshot:
  - classification: `advance`
  - overallScore: `79`
  - reasonCodes: none
  - lens scores:
    - market: 78 / advance
    - team: 82 / advance
    - traction: 78 / advance
- This confirms the screening lenses are no longer collapsing into the old zero-score fallback path.
- Important remaining inconsistency: the screening output contract still reports `overall.signal = review` and `missingMaterials = [team]` for the same run while the triage decision says `advance`. That likely means the contract builder and triage layer are not fully aligned yet.

### Current end-to-end verification snapshot
- We now validated both sides of the gate on a real existing startup in dev:
  1. Earlier run: screening `reject` -> evaluation skipped -> synthesis skipped.
  2. Latest run: screening `advance` -> evaluation started as expected.
- This means the core gate mechanics are behaving correctly in both directions.

### Additional milestone — screening contract alignment
- Implemented a canonical screening outcome model shared across triage and the public screening output contract.
- Added canonical next actions like `continue_evaluation`, `manual_review`, `request_materials`, and `stop`.
- Updated the output contract and UI to consume the aligned outcome/next-action shape.
- Fixed the deck-material parity issue in triage by including `pitchDeckPath` alongside `pitchDeckUrl` when computing missing materials.
- Re-ran the targeted screening contract + triage tests and they passed.

### Remaining work focus
- Clara/email notifications for relevant admins / investors / startup relationships when screening concludes
- Clara reply-to-email backfill loop for missing materials

### Additional milestone — backlog workbook extraction
- Downloaded the shared roadmap workbook into the repo-local `.claude` directory for repeatable analysis.
- Parsed the workbook structure directly from the `.xlsx` file and confirmed the relevant tabs:
  - `README`
  - `Product Map`
  - `Roadmap Summary`
  - `Backlog`
  - `A1 Deal Screening`
- Extracted the full `A1 Deal Screening` worksheet into a local JSON file for mapping work.
- Initial mapping against the `deal-screening` branch commit history shows a substantial overlap between branch work and A1 backlog story IDs.

### Additional milestone — A1 Deal Screening backlog mapping
- Mapped the A1 backlog into four buckets:
  - implemented and live-verified
  - implemented in code but not yet live-verified
  - partially implemented / inconsistent
  - not implemented yet
- Strongest completed area: screening gate semantics, verdict/output shaping, and the new screening UI surfaces.
- Biggest remaining gaps from the backlog view: canonical intake normalization, DD handoff seeding, and calibration automation.
- Important partial areas identified by the mapper:
  - Clara email/deck forwarding intake path still needs reliability work
  - screening contract alignment still has at least one live inconsistency to resolve fully
- Wrote a first-pass validation layer back into the shared workbook on the `A1 Deal Screening` sheet by adding non-destructive columns for:
  - `Validation`
  - `Notes`
  - `How To Test`
- Marked the key deal-screening story rows with implemented / partial / not implemented status and short notes based on branch work plus live validation.

### Additional milestone — screening evidence seed into DD surfaces
- Added a frontend bridge that converts screening lens evidence into DD-friendly evidence seed rows.
- Surfaced those screening evidence seeds in DD-facing views:
  - founder/admin Sources tab
  - Summary card
  - Memo tab
- Re-ran focused frontend tests and typecheck for the evidence bridge.
- This is a practical first implementation of DS-E10-F2-S1 without inventing a new backend evidence graph subsystem yet.

### Additional milestone — screening open-issues handoff into DD surfaces
- Added a frontend-derived open-issues bridge that turns screening missing materials and triage reason codes into DD-friendly follow-up items.
- Surfaced those screening open issues next to existing DD-facing content so screening concerns complement memo due-diligence questions rather than replace them.
- This advances DS-E10-F3-S1 in a practical frontend-first way, while a fuller backend-persisted graph/ledger can still come later.

### Additional milestone — backend screening handoff payload
- Extended the public `ScreeningOutputV1` contract with a backend-built `handoff` payload.
- The handoff now carries:
  - `evidenceSeeds`
  - `openIssues`
- These are built from persisted screening lens rows plus the latest triage decision, with evidence deduped and open issues following the same precedence model as the frontend helper logic.
- This is a stronger backend-facing step for DS-E10-F2-S1 / DS-E10-F3-S1 because DD consumers no longer have to invent the handoff purely in the UI.

### Additional milestone — frontend now consumes backend handoff
- Switched the DD-facing frontend surfaces to prefer the backend-provided `ScreeningOutputV1.handoff` payload instead of composing screening evidence/open issues locally first.
- Kept legacy fallback logic only for cases where the handoff is absent.
- Re-ran targeted frontend tests and typecheck for the canonical handoff consumer path.
- This closes one more consistency gap between backend screening state and frontend DD views.

### Additional milestone — backlog workbook refresh
- Refreshed the A1 Deal Screening sheet annotations in the shared workbook after the latest DS progress.
- Uploaded the updated workbook back to the original Drive file.
- Updated key rows to reflect the newest implemented / live-verified / note status changes after the latest intake, dealbreaker, calibration, and DD handoff work.

### Additional milestone — strict remainder audit after core DS work
- Reviewed the current branch against A1 Deal Screening with a stricter lens: what is truly must-have vs deferrable.
- Main conclusion: the gate/operator flow is now mostly real and usable.
- Highest-value remaining must-haves identified by the audit:
  1. replace placeholder screening lens prompts with production-ready prompts
  2. make the thesis-fit gate truthful on first screening runs (it still depends on existing match rows)
  3. if dealbreakers are meant to be authoritative, move them from client-only hints into a server-owned screening rule path
- Many other remaining items can safely defer compared with those three.

### Additional milestone — first-run thesis-fit gate backfill
- The screening processor no longer depends only on existing `startupMatch` rows for thesis-fit.
- On a first run, if no persisted thesis-fit exists, screening now attempts a narrow backfill by seeding the investor-matching path from the current synthesis result and active investor-thesis pool.
- If there are no active investor theses, or synthesis is unavailable, the gate still fails open instead of guessing.
- Re-ran focused screening processor tests and backend typecheck coverage for this path.
- This materially reduces the old correctness gap where out-of-thesis deals could slip through purely because matching rows had not yet been created.

### Additional milestone — calibration loop slice
- Added a reusable calibration snapshot / summary model for screening-vs-investor decision deltas.
- Deal decisions now persist a reusable calibration snapshot payload instead of only a raw decision row.
- Added admin-side calibration access and a manual recompute trigger.
- Surfaced calibration drift signals in the investor/admin UI and deal activity timeline.
- Re-ran targeted backend calibration tests, frontend mismatch rendering test, and backend/frontend typechecks.
- This advances the practical calibration backlog without introducing a large ML retraining system yet.

### Additional milestone — server-side dealbreakers
- Added backend-owned dealbreaker enforcement to screening triage based on active investor thesis `dealBreakers`.
- Dealbreaker matches now hard-reject before thesis-fit/lens logic and emit stable `dealbreaker:<term>` reason codes.
- Screening output handoff now surfaces those dealbreaker reason codes in a readable way for downstream consumers.
- Re-ran targeted triage/contract tests and backend/frontend typechecks for this path.

### Additional milestone — canonical screening input + dedupe first pass
- Added a shared backend normalization layer at `backend/src/modules/startup/screening-intake-normalization.ts`.
- Unified company-name trust and duplicate matching logic so multiple intake paths can reuse the same screening-oriented normalization behavior.
- Updated key intake paths to use the shared normalization / dedupe layer:
  - Clara email intake
  - portal submissions
  - scout submissions
  - startup intake helper path
- Added stronger duplicate lookup by canonicalized company name and normalized website host.
- Re-ran focused backend tests and backend typecheck for this intake layer.
- Follow-up completed: the direct founder/investor manual `StartupService.create` path is now also on the shared normalization + same-owner dedupe path.
- This means the main screening-relevant intake paths now share one dedupe/normalization approach, though cross-tenant merging remains intentionally out of scope for safety.

### Additional milestone — intake reliability hardening
- Improved the AgentMail investor inbox bridge so deck-forwarded submissions prefer the actual pitch-deck attachment as the primary artifact.
- The bridge now puts the pitch-deck storage key first in the attachment list used for confirmation, instead of relying on whatever attachment arrived first.
- Also uses the deck filename as a stronger company-name hint during intake.
- Re-ran focused AgentMail inbox bridge tests and backend typecheck.
- This is a targeted correctness fix for the important email/deck intake path, not a broad Clara/inbox redesign.

### Additional milestone — screening consistency hardening
- Hardened the screening processor so it now fails closed when triage throws: it falls back to the screening output contract’s canonical signal/score instead of leaving screening classification undefined.
- Extended the internal screening phase result shape to carry `nextAction`, keeping internal pipeline state closer to the public screening contract.
- Added a shared frontend screening-state resolver so DD/admin views prefer one canonical screening state model instead of drifting between decision/output sources.
- Re-ran targeted backend screening tests, frontend screening tests, and both backend/frontend typechecks.
- This closes one of the most important correctness gaps: screening state now stays trustworthy even under partial triage/contract failure conditions.

### Additional milestone — Clara screening follow-up first pass
- Added Clara conversation memory for screening follow-up state.
- Added Clara outbound follow-up requests for missing materials during screening review holds.
- Added reply-to-email routing so screening follow-up replies can bypass the normal founder/scout gate and be handled as a materials backfill flow.
- Added the first text-only resume path that can restart analysis from screening when the missing materials are satisfied by reply.
- Re-ran targeted Clara and pipeline notification tests and they passed.
- This gives the project a first working communication loop for screening-related missing materials.

### Additional milestone — real Clara recipient-path verification
- Verified the different-recipient email path end to end using a Gmail plus-address alias on the accessible inbox.
- Startup used: `Path Robotics`.
- Contact email temporarily set to `yusufisbusy+clara-screening-test@gmail.com` for validation.
- Fresh screening run produced a canonical `review` + `request_materials` outcome.
- Clara sent a visible new follow-up email with subject `Action Needed: Missing materials for Path Robotics` to the plus-address recipient.
- Replied in-thread with missing team details and verified the backend started the backfill/resume path.
- Backend logs confirmed restart from enrichment after the missing-info reply.
- Important caveat: the follow-up arrived with a Gmail `SPAM` label, so deliverability/reputation may still need product/ops work even though the flow is functionally correct.

### Current blocker before shutdown
- The live Clara backfill persistence mismatch is still the next thing to close fully.
- Real evidence from Yusuf's screenshot showed Clara acknowledged the reply and restarted analysis, but the startup data still did not reflect the submitted team info on a later screening run.
- A subagent implemented a parser/persistence fix and targeted tests pass, but the final live proof of `teamMembers` being written on the real Path Robotics startup still needs to be completed tomorrow.
- Clara screening follow-up, recipient-path behavior, and hold-notification semantics were otherwise validated enough to continue from that blocker.

### Additional milestone — webhook reachability investigation
- Investigated the remaining blocker for the *true* external end-to-end Clara reply proof.
- Confirmed the local backend is still running with `APP_URL=http://localhost:8080`.
- AgentMail webhooks require a publicly reachable URL, but there is no in-repo automatic webhook registration and no public local endpoint by default.
- This means the remaining real-world gap is not only app logic — it is inbound webhook reachability from AgentMail back to this machine.
- Fastest path identified: temporary public tunnel (e.g. Tailscale Funnel) or another public webhook target, then point AgentMail at `/integrations/agentmail/webhook`.
- Important nuance: internal code paths for screening follow-up, in-app warning notifications, and reply routing were all improved and tested locally; the main remaining blocker for full external proof is now infrastructure reachability.

### Next-step context
- Resume from the live Clara backfill persistence mismatch first.
- Re-run the real reply flow and confirm `teamMembers` persists on the startup row after the email reply.
- Then continue backlog mapping / progress writing for A1 Deal Screening.
- After each meaningful milestone, append here.

## 2026-05-11

### DS-E2-F1-S2 — Versioned + hot-swappable lens workers (issue #8)

**What changed and why.** The three screening lenses (`market`, `team`, `traction`) were singletons keyed by lens name only. Replacing a placeholder prompt required a code redeploy and silently invalidated historical decisions, because the persisted `startup_lens_result` row could be re-interpreted against the prompt-of-the-day. This story makes lens versions first-class:

- Each lens class carries `version: string` (currently `"1"`).
- `LensRegistryService` holds a `Map<"<key>@<version>", BaseLensAgent>` keyed pair, with `getActiveVersion(key)` reading `LENS_ACTIVE_VERSION_<KEY>` (env) and falling back to the highest registered version (numeric-aware compare).
- `run('team@2', ctx)` targets an explicit version; `run('team', ctx)` and `runAll(ctx)` always go through the active version.
- `asTools()` re-resolves the active version on every `execute()` call so a hot-swap doesn't require rebuilding the tool surface. Tool names stay `lens_team` / `lens_market` / `lens_traction` (no `@`) because the Vercel AI SDK tool-name regex doesn't allow it.
- Lens registration moved to a multi-provider DI token `LENSES_REGISTRY_TOKEN` so adding a `TeamLensV2` is a two-line edit in `lenses.module.ts` instead of changing the registry constructor.
- Prompt catalog entries gained optional `versions: Record<string, {systemPrompt, userPrompt}>` + `activeVersion`. `AiPromptService.resolve({ key, version? })` reads from `versions[version]` when supplied, else `versions[activeVersion]`, else falls back to the legacy flat `defaultSystemPrompt` / `defaultUserPrompt` pair.
- `ResolvedPrompt` gained `version: string | null`. `LensRunResult` gained `lensVersion` + `promptVersion`. The screening processor writes both onto `startup_lens_result` and aggregates `{ market, team, traction } → version` into `screening_decision.lens_versions`.
- New Drizzle migration (`drizzle/0017_icy_talos.sql`): `startup_lens_result.lens_version text not null default '1'`, `startup_lens_result.prompt_version text not null default '1'`, `screening_decision.lens_versions jsonb not null default '{}'::jsonb`. DATABASE_URL points to Neon — I generated the migration but did **not** run `bun db:push`; Yusuf needs to apply it.

**Files touched.**
- `backend/src/modules/ai/lenses/base-lens.agent.ts` (version field; LensRunResult shape; runtime threading of versions)
- `backend/src/modules/ai/lenses/lens-registry.service.ts` (full rewrite for versioned routing + DI token)
- `backend/src/modules/ai/lenses/lenses.module.ts` (multi-provider token wiring)
- `backend/src/modules/ai/lenses/{market,team,traction}.lens.ts` (explicit `version = "1"`)
- `backend/src/modules/ai/lenses/tests/lens-registry.service.spec.ts` (versioning coverage)
- `backend/src/modules/ai/services/ai-prompt-catalog.ts` (PromptCatalogEntry.versions; lens entries populated for v1)
- `backend/src/modules/ai/services/ai-prompt.service.ts` (resolve accepts version; version surfaces on ResolvedPrompt)
- `backend/src/modules/ai/processors/screening.processor.ts` (persist lens_version + prompt_version; aggregate lensVersions into triage decide call)
- `backend/src/modules/ai/screening/triage/screening-triage.service.ts` (decide() accepts lensVersions; persists into screening_decision; ScreeningDecisionSchema gains lensVersions)
- `backend/src/modules/ai/entities/lens-result.schema.ts` (new columns)
- `backend/src/modules/ai/entities/screening-decision.schema.ts` (new column + type)
- `backend/src/config/env.schema.ts` (`LENS_ACTIVE_VERSION_MARKET|_TEAM|_TRACTION`)
- `backend/src/modules/ai/tests/processors/screening.processor.spec.ts` (persistence assertion)
- `backend/src/modules/ai/tests/services/ai-prompt.service.spec.ts` (versioned resolve)
- `backend/drizzle/0017_icy_talos.sql` (generated migration — apply with `bun db:push`)

**Version-flip workflow (how a future story adds TeamLensV2 + new prompt + env flip).**
1. Write `TeamLensV2` next to `TeamLens` — same shape, `readonly version = "2" as const`.
2. Add `TeamLensV2` to the `providers` array AND the `inject` + `useFactory` arrays in `backend/src/modules/ai/lenses/lenses.module.ts`. That's the only registry-side change.
3. Add a `"2": { systemPrompt: "...", userPrompt: "..." }` entry under `AI_PROMPT_CATALOG["lens.team"].versions` (keep the v1 entry intact so historical replay still works).
4. Set `LENS_ACTIVE_VERSION_TEAM=2` in `.env` (or just bump `activeVersion: "2"` in the catalog as the code default).
5. Reload (no full redeploy required — `bun dev` hot-reload reads the env). Next `runAll()` produces `lens_version='2'` rows; tool-callers using `lens_team` route to v2 automatically.
6. Roll back: unset the env var or set it to `"1"`. Historical rows from the v2 window keep their `lens_version='2'` audit trail.

**`LENS_FALLBACK_RATIONALE_PREFIX` stays untouched** — it's an explicit downstream contract called out as a stable surface in `base-lens.agent.ts` line 18-20. The lens fallback path also threads `lensVersion`/`promptVersion` through so even synthetic fallback rows are version-tagged.

**Surprising things found.**
- The placeholder library files at `backend/src/modules/ai/prompts/library/lens/team/{system,user}.md` are dead — they're under `library/lens/` but the path builder looks for `library/global/lens/` (or `library/stages/<stage>/lens/`). The catalog defaults win for lenses today. Not my problem for this story, but worth flagging next time someone touches lens prompts: either move the placeholder files into `library/global/lens/` or delete them.
- DATABASE_URL points to a remote Neon database (not the docker-compose Postgres I expected from the issue notes). I generated the migration cleanly but did not push it — that's a manual step Yusuf must run after reviewing.
- Pre-existing baseline test fails on `dev`: 101 failures (1850 pass). My branch is identical (101 failures, 1861 pass — I added 11 new passing tests). The failures are auth/Clara/synthesis-related and unrelated to lens versioning.

### Manual verification checklist (since I can't run the stack here)
Pasted into the PR body so it's reviewable there. Short version:
1. `cd backend && bun db:push` (or `bun db:migrate`) to apply 0017_icy_talos.sql.
2. Trigger a screening rerun on Path Robotics (`51c16a55-70d8-4fdb-9de2-88d9a7fc0602`).
3. In Drizzle Studio, confirm `startup_lens_result.lens_version = '1'` (3 rows) and `screening_decision.lens_versions = {"market":"1","team":"1","traction":"1"}`.
4. Optional: write a `TeamLensV2` placeholder per the workflow above, set `LENS_ACTIVE_VERSION_TEAM=2`, rerun, confirm the team row now reads `lens_version='2'`. Flip back to `'1'`, confirm the next run reverts.
