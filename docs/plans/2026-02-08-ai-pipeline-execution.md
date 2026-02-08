# AI Pipeline Execution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a production-ready AI pipeline for startup analysis that is deterministic under test, resilient under partial failures, and aligned with `backend/docs/ai-pipeline/*.md`.

**Architecture:** Keep the existing NestJS AI module and dedicated BullMQ queues, implement each phase as isolated services + processors + schemas + tests, and enforce parallel execution for research/evaluation agents with degraded-mode handling. Persist final outputs to `startup_evaluations` and transient state to Redis.

**Tech Stack:** NestJS, BullMQ, Redis, Drizzle ORM, AI SDK v6 (`@ai-sdk/google`, `@ai-sdk/openai`), Mistral OCR SDK, Bun test.

---

### Task 1: Phase 3 PDF Extraction (Hybrid: pdf-parse + Mistral OCR)

**Files:**
- Create: `backend/src/modules/ai/extraction/pdf-text-extractor.service.ts`
- Create: `backend/src/modules/ai/extraction/mistral-ocr.service.ts`
- Create: `backend/src/modules/ai/extraction/field-extractor.service.ts`
- Create: `backend/src/modules/ai/extraction/extraction.module.ts`
- Modify: `backend/src/modules/ai/services/extraction.service.ts`
- Test: `backend/src/modules/ai/tests/services/extraction.service.spec.ts`

**Step 1: Write failing extraction tests**
- Add tests for text-PDF fast path, OCR fallback path, and field extraction validation.

**Step 2: Run extraction tests to confirm failure**
- Run: `cd backend && bun test src/modules/ai/tests/services/extraction.service.spec.ts`

**Step 3: Implement minimal extraction services**
- Add deterministic content-check heuristic, OCR wrapper, schema-validated field extraction.

**Step 4: Re-run extraction tests**
- Expect: extraction tests pass.

**Step 5: Run regression checks**
- Run: `cd backend && bunx tsc --noEmit && bun test`

### Task 2: Phase 4 Web + LinkedIn Scraping

**Files:**
- Create: `backend/src/modules/ai/scraping/website-scraper.service.ts`
- Create: `backend/src/modules/ai/scraping/linkedin-enrichment.service.ts`
- Create: `backend/src/modules/ai/scraping/scraping-cache.service.ts`
- Create: `backend/src/modules/ai/scraping/scraping.module.ts`
- Modify: `backend/src/modules/ai/services/scraping.service.ts`
- Test: `backend/src/modules/ai/tests/services/scraping.service.spec.ts`

**Step 1: Write failing tests for cache-hit/miss and partial LinkedIn failures**
- Cover deep scrape limits, source extraction, and graceful degradation.

**Step 2: Run scraping tests to verify red state**
- Run: `cd backend && bun test src/modules/ai/tests/services/scraping.service.spec.ts`

**Step 3: Implement scraper, enrichment, and cache layers**
- Enforce page caps, batch processing, and Redis TTL behavior.

**Step 4: Run scraping tests**
- Expect: pass.

**Step 5: Run regression checks**
- Run: `cd backend && bunx tsc --noEmit && bun test`

### Task 3: Phase 7 Synthesis + Scoring + Matching

**Files:**
- Create: `backend/src/modules/ai/synthesis/score-computation.service.ts`
- Create: `backend/src/modules/ai/synthesis/investor-matching.service.ts`
- Create: `backend/src/modules/ai/synthesis/location-normalizer.service.ts`
- Create: `backend/src/modules/ai/synthesis/memo-generator.service.ts`
- Modify: `backend/src/modules/ai/services/synthesis.service.ts`
- Test: `backend/src/modules/ai/tests/services/score-computation.service.spec.ts`
- Test: `backend/src/modules/ai/tests/services/synthesis.service.spec.ts`

**Step 1: Write failing deterministic score-computation tests**
- Validate normalization, weighted score, percentile math.

**Step 2: Run tests (red)**
- Run: `cd backend && bun test src/modules/ai/tests/services/score-computation.service.spec.ts`

**Step 3: Implement score service first**
- Pure math implementation using `stage_scoring_weights`.

**Step 4: Write/implement matching + normalizer tests**
- Include cache hit/miss and first-filter correctness.

**Step 5: Integrate synthesis orchestration and run full regression**
- Run: `cd backend && bunx tsc --noEmit && bun test`

### Task 4: Phase 8 Orchestration Hardening

**Files:**
- Create: `backend/src/modules/ai/orchestrator/pipeline.config.ts`
- Create: `backend/src/modules/ai/orchestrator/progress-tracker.service.ts`
- Create: `backend/src/modules/ai/orchestrator/error-recovery.service.ts`
- Create: `backend/src/modules/ai/orchestrator/phase-transition.service.ts`
- Modify: `backend/src/modules/ai/services/pipeline.service.ts`
- Test: `backend/src/modules/ai/tests/services/pipeline.service.spec.ts`
- Test: `backend/src/modules/ai/tests/services/progress-tracker.service.spec.ts`

**Step 1: Add failing tests for dependency transitions and cancel/retry**
- Include extraction-failed/scraping-success degraded path.

**Step 2: Implement config-driven transitions**
- No hardcoded sequencing.

**Step 3: Implement timeout/retry/dead-letter behavior**
- Deterministic backoff and diagnostics.

**Step 4: Validate progress persistence + websocket emission**
- Assert `analysisProgress` structure updates.

**Step 5: Run full quality gate**
- Run: `cd backend && bunx tsc --noEmit && bun test`

### Task 5: Production Readiness Gate

**Files:**
- Modify: `backend/.env.example`
- Modify: `.env.example`
- Create: `backend/docs/ai-pipeline/IMPLEMENTATION-STATUS.md`

**Step 1: Validate env keys and defaults**
- Ensure model keys use `gemini-3.0-flash`, `gpt-5.2`, `mistral-ocr-latest`.

**Step 2: Validate queue concurrency + retry config**
- Ensure no hidden hardcoded values conflict with docs.

**Step 3: Add implementation status matrix**
- Per phase: done/in-progress/todo with tests and risks.

**Step 4: Run final checks**
- Run: `cd backend && bunx tsc --noEmit && bun test`
