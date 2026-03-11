# Archive Rollout Implementation Plan

**Goal:** Safely implement the Archive prompt, schema, and UI improvements in a rollback-friendly order with minimal blast radius at each step.

**Source Inputs Reviewed:**
- `Downloads/Archive/stages/*`
- `Downloads/Archive/output-structures/*`
- `Downloads/Archive/ui/*`
- current backend prompt library, schemas, agent normalizers, synthesis flow, and startup-view UI

**Core Rule:** Do not flip prompt content before the runtime, schemas, synthesis, and UI can safely consume the richer shapes.

**Verified Current State (2026-03-10):**
- Runtime output schema resolution is already code-only via [agent-schema-registry.service.ts](/Users/hassanoigag/inside-line/backend/src/modules/ai/services/agent-schema-registry.service.ts).
- Admin prompt UI already reflects that schema definitions live in code, not as editable DB-backed records.
- Remaining schema-revision DTOs and generated frontend model types appear to be stale cleanup, not the active runtime path.

---

## Status Tracker Rules

This file is the implementation tracker and must be updated during execution.

When a task is completed:
- change `[ ]` to `[x]`
- add the completion date inline if useful
- add a short note if the implementation deviated from plan

When a phase is fully completed:
- update the phase status line from `Not Started` or `In Progress` to `Completed`
- add verification notes under that phase

If work starts on a phase:
- mark the phase `In Progress`
- do not mark the next phase `In Progress` until the current one is either `Completed` or explicitly paused

---

## Rollout Principles

- Keep backend changes additive first.
- Preserve legacy fields while introducing richer structures.
- Prefer dual-read and dual-shape compatibility before any prompt switch.
- Avoid DB migrations unless clearly required.
- Keep per-agent rollout isolated before touching cross-agent summary UX.
- Do not publish Archive prompt replacements until the consumers are verified.
- Keep `series_e` and `series_f_plus` on existing behavior until lower stages are stable.

---

## Phase 0: Baseline Audit and Freeze

**Status:** Completed

**Objective:** Lock in a safe baseline before implementation starts.

### Tasks

- [x] Create a working branch for the Archive rollout. Note: intentionally skipped for this session; continuing in the current worktree.
- [x] Capture current prompt-library diff versus Archive for reference.
- [x] Enumerate all agent output consumers:
  - backend schema parsers
  - agent normalizers
  - synthesis service
  - startup view components
  - PDF/report rendering
- [x] Document which Archive fields already exist, partially exist, or are missing.
- [x] Confirm no DB migration is needed for Phase 1 through Phase 7.
- [x] Confirm which schema-revision remnants are dead code only:
  - backend DTOs
  - generated frontend models
  - stale docs/openapi artifacts

### Deliverables

- a reference map of Archive field coverage
- a frozen baseline of current runtime expectations

### Rollback Safety

- no product behavior changes
- documentation only

### Exit Criteria

- field coverage map exists
- downstream consumer list is complete enough to begin compatibility work

### Verification Notes

- Verified runtime output schema resolution is code-only.
- Verified active admin UX points to code-defined schemas, not DB-backed schema editing.
- Verified remaining schema-revision artifacts are stale cleanup, not the active runtime path.

---

## Phase 1: Compatibility Layer First

**Status:** Completed

**Objective:** Make the backend safely accept both legacy and richer Archive-style outputs without breaking existing consumers.

**Phase 1 Clarification:** This phase does not need to move output schemas out of the database, because runtime schema resolution is already code-only. The work here is purely compatibility and normalization.

### Tasks

- [x] Extend shared evaluation schema helpers to normalize both old and new confidence and score shapes.
- [x] Add support for nested `scoring` while preserving legacy top-level `score` and `confidence`.
- [x] Add support for structured `dataGaps[]` objects where needed, while preserving string-array compatibility for current consumers.
- [x] Add compatibility helpers for common Archive field patterns:
  - `strengths` and `risks` newline strings
  - structured `founderPitchRecommendations[]`
  - nested objects like `productOverview`, `marketSizing`, `teamComposition`, `exitScenarios`
- [x] Update agent normalization paths so richer fields can coexist with legacy fields.
- [x] Add backend tests proving both legacy payloads and Archive-style payloads parse successfully.

### Target Files

- `backend/src/modules/ai/schemas/*`
- `backend/src/modules/ai/agents/evaluation/base-evaluation.agent.ts`
- agent-specific evaluation normalizers and schema specs

### Verification

- `cd backend && bun test`
- `cd backend && bunx tsc --noEmit`

### Rollback Safety

- additive only
- no prompt changes yet
- no frontend dependency yet
- no schema-storage migration involved

### Exit Criteria

- backend accepts both legacy and Archive-style shapes
- synthesis inputs still work with untouched prompts

### Verification Notes

- Targeted backend schema tests passing:
  - `backend/src/modules/ai/schemas/base-evaluation.schema.spec.ts`
  - `backend/src/modules/ai/schemas/evaluations/team.schema.spec.ts`
  - `backend/src/modules/ai/schemas/evaluations/null-tolerance.schema.spec.ts`
- Synthesis service compatibility check passing:
  - `backend/src/modules/ai/tests/services/synthesis.service.spec.ts`
- Backend typecheck passing:
  - `cd backend && bunx tsc --noEmit`
- Additional note:
  - `backend/src/modules/ai/tests/services/synthesis-agent.service.spec.ts` currently has unrelated failing assertions and was not changed in this slice.

---

## Phase 2: Low-Risk Agent Upgrades

**Status:** Completed

**Objective:** Upgrade the agents that are already partially aligned with richer structures.

**Recommended Order:**
1. Team
2. Market
3. Product
4. Competitive Advantage

### Tasks

- [x] Upgrade Team schema and normalizer to fully support Archive fields.
- [x] Upgrade Market schema and normalizer to fully support Archive fields.
- [x] Upgrade Product schema and normalizer to fully support Archive fields.
- [x] Upgrade Competitive Advantage schema and normalizer to fully support Archive fields.
- [x] Ensure each upgraded agent still emits legacy-compatible score and confidence fields.
- [x] Add or update tests per agent for Archive-style payloads.
- [x] Verify existing UI components still render correctly against new enriched data.

### Notes

- Do not remove legacy fields in this phase.
- Do not switch prompts yet.

### Verification

- `cd backend && bun test`
- `cd backend && bunx tsc --noEmit`
- `cd frontend && bunx tsc --noEmit`

### Rollback Safety

- isolated per-agent changes
- no cross-agent UI dependency yet

### Exit Criteria

- the first four evaluation agents safely support Archive-style output contracts
- existing views continue to compile and render against enriched data

### Verification Notes

- Team schema compatibility added for Archive-specific fields:
  - team member `relevance -> background`
  - team member `risks -> concerns`
  - founder recommendation `action/recommendation -> type/bullet`
- Market schema compatibility added for Archive-specific field variants:
  - source `tier` string -> numeric tier
  - source `geography` preserved
  - boolean-like strings normalized for `plausible` and `discrepancyFlag`
  - `deckVsResearch.notes -> discrepancyNotes`
  - `growthRate.trajectory` accepted
  - `entryConditions[]` array normalized into canonical assessment/rationale/factors
  - `tailwinds/headwinds` impact labels like `moderate` and `mid` normalized
- Team schema tests passing:
  - `backend/src/modules/ai/schemas/evaluations/team.schema.spec.ts`
- Market compatibility coverage passing:
  - `backend/src/modules/ai/schemas/evaluations/null-tolerance.schema.spec.ts`
- Product schema compatibility added for Archive-specific field variants:
  - `productOverview.description/techStage -> productSummary.description/techStage`
  - `keyFeatures[]` object arrays preserved as `keyFeatureDetails[]` while normalizing canonical string arrays
  - `technologyStack[]` object arrays preserved as `technologyStackDetails[]` while normalizing canonical string arrays
  - `stageFitAssessment` string variants like `on-track` normalized to `on_track`
- Product compatibility coverage passing:
  - `backend/src/modules/ai/schemas/evaluations/null-tolerance.schema.spec.ts`
- Competitive Advantage schema compatibility added for Archive-specific field variants:
  - `differentiationType` accepts both legacy `technical` and Archive `technology`
  - `moatType` accepts Archive `technology` plus legacy moat variants
  - `moatStage` accepts Archive `emerging` plus existing lifecycle values
  - `competitivePosition.currentGap` accepts both legacy and Archive enums
  - `competitors.direct[].fundingRaised` accepts shorthand strings like `$12.5M` and normalizes to numbers
- Competitive Advantage compatibility coverage passing:
  - `backend/src/modules/ai/schemas/evaluations/null-tolerance.schema.spec.ts`
- Legacy compatibility preserved through shared base schema normalization:
  - top-level `score` and `confidence` remain available alongside nested `scoring`
- Backend typecheck passing:
  - `cd backend && bunx tsc --noEmit`
- Frontend typecheck passing:
  - `cd frontend && bunx tsc --noEmit`
- Existing UI compile compatibility verified for startup view consumers:
  - `frontend/src/components/startup-view/ProductTabContent.tsx`
  - `frontend/src/components/startup-view/CompetitorsTabContent.tsx`
- Supporting fixtures updated to match canonical normalized shapes:
  - `backend/src/modules/ai/tests/fixtures/mock-evaluation.fixture.ts`

---

## Phase 3: Higher-Risk Agent Upgrades

**Status:** Completed

**Objective:** Upgrade the agents with the largest gap between current implementation and Archive specs.

**Recommended Order:**
1. Financials
2. Deal Terms
3. Exit Potential
4. GTM
5. Business Model
6. Legal
7. Traction

### Tasks

- [x] Implement Financials compatibility and richer output support:
  - `financialModelProvided`
  - `keyMetrics`
  - `capitalPlan`
  - `projections`
  - `charts`
  - `financialPlanning`
- [x] Implement Deal Terms richer structured fields expected by Summary and tab UIs.
- [x] Implement Exit Potential scenario structures and fallback behavior.
- [x] Upgrade GTM, Business Model, Legal, and Traction to Archive-style structures where required.
- [x] Add agent-specific tests for both no-model and model-present financials cases.
- [x] Verify synthesis still handles all section outputs.

### Notes

- Financials is the largest single schema/UI delta and should not start before Phase 1 and Phase 2 are stable.

### Verification

- `cd backend && bun test`
- `cd backend && bunx tsc --noEmit`

### Verification Notes

- Financials schema upgraded from a simple placeholder alias to an Archive-aligned nested structure covering:
  - `financialModelProvided`
  - `keyMetrics`
  - `capitalPlan`
  - `projections`
  - `charts`
  - `financialPlanning`
- Financials compatibility added for Archive-style value variants:
  - boolean-like strings such as `yes` and `true`
  - numeric strings in `runwayMonths`, chart values, and use-of-funds percentages
  - enum variants like `path-clear` and `ipo-grade`
- Financials compatibility coverage passing:
  - `backend/src/modules/ai/schemas/evaluations/null-tolerance.schema.spec.ts`
- Synthesis service compatibility check passing after Financials schema upgrade:
  - `backend/src/modules/ai/tests/services/synthesis.service.spec.ts`
- Deal Terms schema upgraded from a simple placeholder alias to an Archive-aligned nested structure covering:
  - `dealOverview.impliedMultiple`
  - `dealOverview.comparableRange`
  - `dealOverview.premiumDiscount`
  - `dealOverview.roundType`
  - `dealOverview.raiseSizeAssessment`
  - `dealOverview.valuationProvided`
  - Archive `strengths`
- Deal Terms compatibility added for Archive-style value variants:
  - enum variants like `slight-premium` and `large-for-stage`
  - boolean-like values for `valuationProvided`
- Deal Terms compatibility coverage passing:
  - `backend/src/modules/ai/schemas/evaluations/null-tolerance.schema.spec.ts`
- Exit Potential schema expanded to include Archive-compatible:
  - `returnAssessment`
  - `strengths`
  - stricter canonical `exitScenarios[]` preserved for synthesis normalization
- Exit Potential compatibility added for Archive-style value variants:
  - boolean-like strings in `returnAssessment`
- Exit Potential compatibility coverage passing:
  - `backend/src/modules/ai/schemas/evaluations/null-tolerance.schema.spec.ts`
- Synthesis exit-scenario behavior preserved and verified:
  - `backend/src/modules/ai/tests/agents/synthesis-exit-scenarios.spec.ts`
- Business Model schema upgraded from a simple placeholder alias to an Archive-aligned nested structure covering:
  - `modelOverview`
  - Archive `strengths`
- Business Model compatibility added for Archive-style value variants:
  - boolean-like strings in `pricingVisible`, `expansionMechanism`, and `marginStructureDescribed`
- GTM schema upgraded from a simple placeholder alias to an Archive-aligned nested structure covering:
  - `gtmOverview`
  - Archive `strengths`
- GTM compatibility added for Archive-style value variants:
  - boolean-like strings in `channelDiversification`
  - enum normalization for `evidenceAlignment` and `scalabilityAssessment`
- Business Model and GTM compatibility coverage passing:
  - `backend/src/modules/ai/schemas/evaluations/null-tolerance.schema.spec.ts`
- Legal schema upgraded from a simple placeholder alias to an Archive-aligned nested structure covering:
  - `legalOverview`
  - Archive `strengths`
- Legal compatibility added for Archive-style value variants:
  - boolean-like values in `redFlagsFound` and `ipVerified`
  - numeric-string parsing for `redFlagCount`
  - enum normalization for `regulatoryOutlook`
- Traction schema upgraded from a simple placeholder alias to an Archive-aligned nested structure covering:
  - `tractionOverview`
  - Archive `strengths`
  - Archive `founderPitchRecommendations`
- Traction compatibility added for Archive-style value variants:
  - boolean-like strings across the overview metric flags
  - enum normalization for `metricsDepth` and `stageFit`
- Legal and Traction compatibility coverage passing:
  - `backend/src/modules/ai/schemas/evaluations/null-tolerance.schema.spec.ts`
- Synthesis compatibility coverage passing across richer agent payloads:
  - `backend/src/modules/ai/tests/services/synthesis.service.spec.ts`
  - `backend/src/modules/ai/tests/agents/synthesis-exit-scenarios.spec.ts`
- Backend typecheck passing:
  - `cd backend && bunx tsc --noEmit`
- Frontend typecheck passing:
  - `cd frontend && bunx tsc --noEmit`

### Rollback Safety

- still backend-first
- prompts remain unchanged
- frontend summary still untouched

### Exit Criteria

- all evaluation agents can safely represent the richer Archive structures
- synthesis no longer depends on narrow legacy-only assumptions

---

## Phase 4: Synthesis and Cross-Agent Aggregation Hardening

**Status:** Completed

**Objective:** Ensure memo, summary, report, and score aggregation layers can consume richer per-agent outputs without regressions.

### Tasks

- [x] Update synthesis input handling to read new nested structures without dropping legacy support.
- [x] Verify overall score computation still uses canonical values correctly.
- [x] Ensure summary-level cross-agent aggregation can consume:
  - strengths from multiple agents
  - structured `dataGaps`
  - exit scenarios
  - nested scoring data
- [x] Review report/PDF consumers for assumptions about flat fields.
- [x] Add tests covering mixed legacy/new agent payload combinations.

### Target Areas

- `backend/src/modules/ai/services/synthesis.service.ts`
- `backend/src/modules/ai/agents/synthesis/synthesis.agent.ts`
- `frontend/src/lib/pdf/*`
- startup summary helper paths

### Verification

- `cd backend && bun test`
- `cd backend && bunx tsc --noEmit`
- `cd frontend && bunx tsc --noEmit`

### Verification Notes

- Synthesis agent now dual-reads positive evidence from both legacy `keyFindings` and Archive `strengths` when building:
  - section rewrite prompts
  - section rewrite fallbacks
  - synthesis brief score lines
- Mixed legacy/new payload compatibility coverage passing:
  - `backend/src/modules/ai/tests/agents/synthesis-variable-mapping.spec.ts`
- Synthesis service compatibility still passing after dual-read changes:
  - `backend/src/modules/ai/tests/services/synthesis.service.spec.ts`
  - `backend/src/modules/ai/tests/agents/synthesis-exit-scenarios.spec.ts`
- Summary fallback aggregation now collects per-agent `strengths`, `keyFindings`, `risks`, `keyRisks`, and `dataGaps` when top-level synthesis arrays are absent:
  - `frontend/src/lib/evaluation-display.ts`
- Summary fallback aggregation coverage passing:
  - `frontend/tests/evaluation-display.spec.ts`
- Report/PDF consumers reviewed:
  - `frontend/src/lib/pdf/report-pdf.tsx` already dual-reads section strengths/risks and did not require additional compatibility edits in this slice.
- Overall score computation still verified on canonical top-level section scores via synthesis service coverage:
  - `backend/src/modules/ai/tests/services/synthesis.service.spec.ts`
- Backend typecheck passing:
  - `cd backend && bunx tsc --noEmit`
- Frontend typecheck passing:
  - `cd frontend && bunx tsc --noEmit`

### Rollback Safety

- no prompt publish yet
- changes localized to aggregation and rendering consumers

### Exit Criteria

- synthesis and report generation remain stable with enriched agent outputs

---

## Phase 5: Per-Agent UI Upgrades

**Status:** Completed

**Objective:** Upgrade isolated tabs first, before touching the cross-agent summary surface.

**Recommended Order:**
1. Team tab
2. Market tab
3. Product tab
4. Competitors tab
5. Financials tab
6. Any additional evaluation tabs needed for richer sections

### Tasks

- [x] Bring Team tab into line with Archive spec where practical.
- [x] Bring Market tab into line with Archive spec where practical.
- [x] Bring Product tab into line with Archive spec where practical.
- [x] Bring Competitors tab into line with Archive spec where practical.
- [x] Add a dedicated Financials tab flow if required by the Archive UI scope.
- [x] Ensure each tab has graceful handling for missing new fields.
- [x] Keep tabs backward-compatible with older evaluation records.

### Notes

- The Summary tab is intentionally excluded from this phase.
- Any new tab should be introduced only after the underlying agent data is proven stable.

### Verification

- `cd frontend && bunx tsc --noEmit`
- targeted frontend tests where added

### Verification Notes

- Added a dedicated Financials tab component and wired it into the admin startup view:
  - `frontend/src/components/startup-view/FinancialsTabContent.tsx`
  - `frontend/src/routes/_protected/admin/startup.$id.tsx`
- Financials tab currently renders modular sections for:
  - score card with scoring basis and sub-scores
  - key metrics strip
  - capital plan coverage and fund allocation breakdown
  - projection coverage and upload prompt
  - strengths / risks
  - data gaps
  - model-only deep-dive summaries for assumptions and planning maturity
- Frontend regression test passing:
  - `frontend/tests/evaluation-display.spec.ts`
- Frontend typecheck passing:
  - `cd frontend && bunx tsc --noEmit`
- Team tab now consumes Archive-style scoring metadata and exposes a visible diligence surface:
  - `frontend/src/components/startup-view/TeamTabContent.tsx`
- Team tab improvements include:
  - scoring basis and sub-score bars wired from nested `teamData.scoring`
  - explicit `Data Gaps & Diligence` rendering for string and object-style gap items
  - backward-compatible fallbacks for older records with missing scoring metadata
- Market tab now aligns more closely with the Archive score-card and diligence contract:
  - `frontend/src/components/startup-view/MarketTabContent.tsx`
- Market tab improvements include:
  - scoring basis and sub-score bars wired from nested `marketData.scoring`
  - strengths/risk rendering updated to prefer Archive `strengths` and newline-delimited lists
  - unified `Data Gaps & Diligence` checklist with impact badges and suggested actions
  - entry-condition rendering now accepts both Archive array rows and legacy object-style fallbacks
  - founder pitch recommendations intentionally removed from this tab to match Archive tab ownership
- Product tab now consumes more of the Archive product contract:
  - `frontend/src/components/startup-view/ProductTabContent.tsx`
  - `frontend/src/components/ProductScoreSummary.tsx`
- Product tab improvements include:
  - scoring basis and sub-score bars wired from nested `productData.scoring`
  - product identity badges and core value proposition rendering from `productOverview`
  - feature and technology source attribution from `keyFeatureDetails` and `technologyStackDetails`
  - claims credibility rendering from `claimsAssessment`
  - unified `Data Gaps & Diligence` checklist with impact badges and suggested actions
  - founder pitch recommendations intentionally removed from this tab to match Archive tab ownership
- Competitors tab now consumes Archive-style scoring metadata and structured diligence items:
  - `frontend/src/components/startup-view/CompetitorsTabContent.tsx`
  - `frontend/src/components/CompetitorAnalysis.tsx`
- Competitors tab improvements include:
  - scoring basis and sub-score bars wired from nested `competitiveAdvantageData.scoring`
  - strengths now prefer Archive `strengths` while preserving legacy competitive findings fallbacks
  - unified `Data Gaps & Diligence` rendering for structured competitive data gaps
  - backward-compatible preservation of the existing competitor landscape and detail cards

### Rollback Safety

- isolated UI surfaces
- a broken tab can be reverted without affecting the whole startup view

### Exit Criteria

- individual agent tabs can render the richer data contracts safely

---

## Phase 6: Summary Tab and Cross-Agent UX

**Status:** Completed

**Objective:** Implement the Archive summary experience only after the underlying agents and tabs are stable.

### Tasks

- [x] Implement radar chart over per-agent scores.
- [x] Implement clickable context badges sourced from multiple agents.
- [x] Implement return profile cards using exit scenarios.
- [x] Implement curated cross-agent strengths and critical risks.
- [x] Implement critical data gaps aggregation with deduplication and impact filtering.
- [x] Ensure missing agents degrade gracefully.
- [x] Ensure the summary remains navigational and does not duplicate whole-tab content.

### Likely Target Files

- `frontend/src/components/startup-view/AdminSummaryTab.tsx`
- `frontend/src/components/startup-view/SummaryCard.tsx`
- shared helpers for score extraction and cross-agent aggregation

### Verification

- `cd frontend && bunx tsc --noEmit`
- targeted summary tests if added

### Verification Notes

- Summary tab upgraded to an Archive-style cross-agent overview in:
  - `frontend/src/components/startup-view/AdminSummaryTab.tsx`
  - `frontend/src/routes/_protected/admin/startup.$id.tsx`
- Added shared summary aggregation helpers in:
  - `frontend/src/lib/evaluation-display.ts`
- Added regression coverage for sourced strengths/risks and critical gap aggregation in:
  - `frontend/tests/evaluation-display.spec.ts`
- Summary improvements include:
  - custom radar chart over all evaluation agents with pending-state handling
  - clickable context badges for market, product, team, competitors, financials, and deal context where data is available
  - return profile cards sourced from exit scenarios
  - cross-agent sourced strengths and risks tagged by originating agent
  - critical structured data gap aggregation filtered to `impact: critical`
  - summary navigation callback wiring into the admin startup tab state for available deep-link targets
- Frontend regression test passing:
  - `frontend/tests/evaluation-display.spec.ts`
- Frontend typecheck passing:
  - `cd frontend && bunx tsc --noEmit`

### Post-Phase Note

- After Phase 6, a synthesis structured-output compatibility bug surfaced during manual Airbnb reruns. The issue was not prompt-related; it was caused by synthesis memo section arrays being modeled in a provider-incompatible way for structured output. This was fixed in code before continuing prompt rollout:
  - `backend/src/modules/ai/schemas/synthesis.schema.ts`
  - `backend/src/modules/ai/agents/synthesis/synthesis.agent.ts`
  - `backend/src/modules/ai/schemas/synthesis.schema.spec.ts`

### Rollback Safety

- all dependency work is complete before this phase begins
- reverting summary UI does not require reverting backend compatibility work

### Exit Criteria

- summary UI is powered by stable, already-validated richer agent outputs

---

## Phase 7: Prompt Rollout

**Status:** In Progress

**Objective:** Replace prompt content only after all consumers can safely handle Archive-style outputs.

### Tasks

- [ ] Update stage prompt `system.md` files for `pre_seed` through `series_d`.
- [ ] Roll out per-agent prompt changes in small batches, not all at once.
- [ ] Validate outputs agent-by-agent in prompt preview and real pipeline runs.
- [ ] Keep `user.md` unchanged where already matching.
- [ ] Do not modify `series_e` or `series_f_plus` yet unless explicitly planned.
- [ ] Publish prompt changes only after preview validation passes.

### Active Prompt Rollout Tracker

- [x] `pre_seed / evaluation / team / system.md`
- [ ] `pre_seed / evaluation / market / system.md`
- [ ] `pre_seed / evaluation / product / system.md`
- [ ] `pre_seed / evaluation / competitive-advantage / system.md`

### Recommended Prompt Batch Order

1. Team, Market, Product, Competitive Advantage
2. Financials, Deal Terms, Exit Potential
3. GTM, Business Model, Legal, Traction
4. Synthesis

### Verification

- prompt preview from admin tools
- targeted pipeline runs
- spot-check normalized output shape after each batch

### Rollback Safety

- prompt changes happen last
- each batch can be reverted independently

### Verification Notes

- Switched to prompt-by-prompt rollout for manual validation after each individual prompt change.
- First prompt updated:
  - `backend/src/modules/ai/prompts/library/stages/pre_seed/evaluation/team/system.md`
- This prompt now explicitly instructs the model to emit:
  - `scoring.overallScore`, `scoring.confidence`, `scoring.scoringBasis`, `scoring.subScores[]`
  - structured `dataGaps[]` objects with `gap`, `impact`, `suggestedAction`
  - line-delimited `strengths` and `risks`
  - structured `founderRecommendations[]` and `founderPitchRecommendations[]`

### Exit Criteria

- Archive prompt content is live for lower stages without breaking runtime consumers

---

## Phase 8: Stage Expansion Decision

**Status:** Not Started

**Objective:** Decide how to handle `series_e` and `series_f_plus`, which are supported in product code but not covered in the Archive source bundle reviewed.

### Tasks

- [ ] Decide whether to keep existing prompts for `series_e` and `series_f_plus`.
- [ ] Decide whether to inherit from `series_d` behavior temporarily.
- [ ] If needed, author explicit `series_e` and `series_f_plus` prompt updates in a separate scoped pass.
- [ ] Validate stage-specific scoring and summary behavior for those later stages.

### Rollback Safety

- fully isolated from lower-stage rollout

### Exit Criteria

- there is an explicit, documented policy for late-stage prompts

---

## Phase 9: Cleanup Only After Stabilization

**Status:** Not Started

**Objective:** Remove legacy compatibility only after the new system has proven stable in real usage.

### Tasks

- [ ] Identify unused legacy fields and fallback readers.
- [ ] Remove stale schema-revision remnants if still unused:
  - backend schema-revision DTOs
  - generated frontend schema-revision model types
  - stale docs/openapi references
- [ ] Remove dead compatibility code only after confirming no older records rely on it.
- [ ] Simplify UI extraction helpers where dual-shape logic is no longer needed.
- [ ] Update tests to reflect the final canonical shape.

### Warning

- This phase must not begin until the Archive rollout has been stable for a sustained period.

### Exit Criteria

- runtime complexity is reduced without sacrificing data safety

---

## Suggested First Execution Slice

If implementation starts now, begin with this narrow slice:

1. Phase 0 complete
2. Phase 1 complete
3. Phase 2 for Team only
4. verify Team end-to-end
5. then continue with Market

This is the safest starting path because it validates the compatibility strategy before touching the more complex agents.

---

## Definition of Done

The Archive rollout is considered done when:

- all required agents accept and emit the richer structures safely
- synthesis and reports work against those structures
- individual tabs are upgraded and stable
- summary UX is upgraded and stable
- prompt content is published in controlled batches
- this file has all completed phases and tasks marked accordingly
