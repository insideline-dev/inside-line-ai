# Phase 7: Synthesis & Post-Processing

## Goal
Combine all 11 evaluation results into final synthesis using GPT-5.2, compute weighted scores from DB-stored stage weights, run investor matching with AI thesis alignment, and generate PDF memos for distribution.

## Prerequisites
- Phase 6 (Evaluation) completed successfully
- All 11 evaluation agent results available
- Extraction, scraping, and research data available
- `stage_scoring_weights` table populated with current weights
- Active investors with thesis data in database

## Deliverables

| File | Purpose |
|------|---------|
| `src/modules/ai/synthesis/synthesis.module.ts` | NestJS sub-module exporting all synthesis services |
| `src/modules/ai/synthesis/synthesis-agent.service.ts` | GPT-5.2 integration via AI SDK `generateObject()` with synthesis Zod schema. Inputs: all 11 agent evaluation results + startup data + research outputs. Outputs: executive summary, key strengths array, key risks array, recommendations, investor memo text, founder report text |
| `src/modules/ai/synthesis/score-computation.service.ts` | Pure mathematical service ported from `old-backend/score-computation.ts`. Methods: `computeWeightedScore(sectionScores, weights)`, `getWeightsForStage(stage)` queries `stage_scoring_weights` table, `computeWithInvestorPreferences()`, `normalizeWeights()`, `validateWeights()`. Handles all 11 sections with no AI calls |
| `src/modules/ai/synthesis/investor-matching.service.ts` | Two-stage matching: (1) First-level filter based on industry tags, funding stage, check size range, and normalized geography - port logic from existing `MatchingProcessor`. (2) AI-powered thesis alignment using GPT-4o with thesis-alignment schema to generate `thesisFitScore` and `fitRationale` per matched investor |
| `src/modules/ai/synthesis/location-normalizer.service.ts` | Geographic normalization service ported from `old-backend/investor-agents.ts`. Uses GPT-4o-mini via `generateObject()` to map locations to regions: us, europe, latam, asia, mena, global. Redis cache with 30-day TTL for performance |
| `src/modules/ai/synthesis/memo-generator.service.ts` | PDF generation using existing `PdfService` from `src/modules/startup/pdf.service.ts` and `StorageService`. Transforms synthesis output into formatted PDFKit templates, uploads to S3, returns public URL |
| `src/modules/ai/synthesis/synthesis.service.ts` | Main orchestrator coordinating sequence: (1) run synthesis agent, (2) compute weighted scores, (3) update `startup_evaluations` table, (4) update `startups` table with `overallScore`, (5) run investor matching, (6) generate and upload PDF memo, (7) trigger notifications to matched investors |
| `src/modules/ai/synthesis/synthesis.processor.ts` | BullMQ processor consuming `ai-synthesis` queue jobs, invoking `SynthesisService` orchestration |

## Key Interface Names

### Input Interfaces
- `SynthesisInput`: contains evaluations (Record mapping all 11 EvaluationAgentKey to results), research outputs, extraction data, scraping data, full startup record
- `SectionScores`: Record<EvaluationAgentKey, number> mapping each of 11 agents to numeric score
- `StageWeights`: Record<EvaluationAgentKey, number> from database per funding stage

### Output Interfaces
- `SynthesisOutput`: structure inferred from synthesis Zod schema - executive summary string, key strengths array, key risks array, recommendations array, investor memo markdown, founder report markdown
- `MatchCandidate`: investorId, thesis text, passedFirstFilter boolean, thesisFitScore optional number, fitRationale optional string
- `NormalizedRegion`: enum 'us' | 'europe' | 'latam' | 'asia' | 'mena' | 'global'

## Database Writes

### `startup_evaluations` Updates
Updates existing record with:
- `executiveSummary`: synthesis executive summary text
- `sectionScores`: JSONB Record of all 11 agent scores
- `overallScore`: weighted final score (0-100)
- `percentileRank`: computed ranking against all startups
- `keyStrengths`: array of top strengths
- `keyRisks`: array of identified risks
- `recommendations`: array of recommended actions
- `investorMemo`: markdown formatted memo for investors
- `founderReport`: markdown formatted feedback for founders
- `sources`: array of citation objects
- `dataConfidenceNotes`: metadata about data quality

### `startups` Table Updates
- `overallScore`: final weighted score
- `percentileRank`: relative ranking

### `startup_matches` Table
Creates or updates records for each matched investor with:
- Match confidence score
- Thesis fit score and rationale
- Timestamp

## Component Responsibilities

### SynthesisAgentService
Calls GPT-5.2 with rich context containing all evaluation results, research findings, and startup data. Uses structured output via `generateObject()` with comprehensive synthesis schema. No fallback - schema validation must pass. Includes source citations and data confidence notes.

### ScoreComputationService
Pure math service with zero external dependencies except database reads. Fetches stage-specific weights from `stage_scoring_weights` table. Applies weighted averaging across 11 sections. Validates weight normalization (sum to 1.0). Computes percentile ranking by comparing against all startups in database. Handles investor preference overrides if present.

### InvestorMatchingService
**Stage 1 - First Filter**: Queries investors table with WHERE clauses on industry tags (array overlap), funding stage (array contains), check size (range comparison), geography (normalized region match). Result: subset of potentially matching investors.

**Stage 2 - AI Thesis Alignment**: For each passed investor, calls GPT-4o with startup summary + investor thesis text. Schema returns `thesisFitScore` (0-100) and detailed `fitRationale`. Only investors scoring above threshold (configurable, default 80%) become final matches.

### LocationNormalizerService
Handles geographic ambiguity. Input: location string (city, country, or region). Uses GPT-4o-mini with strict schema enforcing six regions. Redis cache key: `location:normalized:{location}` with 30-day TTL. On cache miss, calls AI and stores result. Handles edge cases like "Bay Area" → "us", "EMEA" → "europe".

### MemoGeneratorService
Consumes synthesis output. Uses existing `PdfService` infrastructure. Two memo types: (1) Investor memo - highlights opportunity, market, traction, team, risks, (2) Founder report - constructive feedback, improvement areas, next steps. Uploads both to S3 via `StorageService`. Returns public URLs.

### SynthesisService Orchestration
Sequential execution with error handling:
1. Call `SynthesisAgentService` - retry on schema validation failure (max 2 retries)
2. Call `ScoreComputationService` - no retry needed (deterministic)
3. Update `startup_evaluations` via Drizzle
4. Update `startups` table
5. Call `InvestorMatchingService` - continue even if zero matches found
6. Call `MemoGeneratorService` - log error if fails but don't block pipeline
7. Trigger notifications via `NotificationGateway` for matched investors above threshold

Updates progress tracking after each step via `ProgressTrackerService`.

## Acceptance Criteria

### Functional Requirements
- [ ] Synthesis GPT-5.2 call produces valid `SynthesisOutput` conforming to schema
- [ ] Score computation uses current weights from `stage_scoring_weights` table, not hardcoded defaults
- [ ] First-level investor filter correctly eliminates non-matching investors (stage, geography, check size, industry)
- [ ] Thesis alignment produces numeric `fitScore` and textual `fitRationale` for each matched investor
- [ ] All database updates complete successfully with correct data
- [ ] PDF memo generated with proper formatting and uploaded to S3
- [ ] Notifications sent to matched investors scoring above 80% threshold
- [ ] Percentile rank computed accurately against full startup database

### Error Handling
- [ ] Synthesis schema validation failure triggers retry (max 2)
- [ ] Missing weights for stage falls back to default weights with warning logged
- [ ] Zero investor matches is valid outcome (logs info, no error)
- [ ] PDF generation failure logged but does not halt pipeline
- [ ] Database write failures roll back partial updates

### Performance
- [ ] Score computation completes in <100ms
- [ ] Investor matching first filter uses indexed queries (<500ms for 1000 investors)
- [ ] AI thesis alignment batched if >50 candidate investors
- [ ] Redis location cache hit rate >90% after warmup

## Test Plan

| Test File | Focus | Mock Strategy |
|-----------|-------|---------------|
| `synthesis-agent.service.spec.ts` | Schema validation, prompt structure | Mock AI SDK `generateObject`, return valid/invalid schemas. Verify retry logic on validation failure |
| `score-computation.service.spec.ts` | Mathematical accuracy | Mock Drizzle for weights query. Test weighted average with known inputs/outputs, normalization validation, percentile ranking edge cases (min, max, median). **Most thorough test coverage required - pure deterministic logic** |
| `investor-matching.service.spec.ts` | Filter logic and AI alignment | Mock Drizzle query builder + AI SDK. Test: investor matching stage passes, mismatched stage fails, check size boundaries, geography normalization. Verify AI thesis scoring called only for passed investors |
| `location-normalizer.service.spec.ts` | Region mapping and caching | Mock AI SDK `generateObject`. Test known location mappings (NYC → us, London → europe, Singapore → asia). Verify Redis cache hit/miss behavior, TTL setting |
| `memo-generator.service.spec.ts` | PDF generation and upload | Mock `PdfService` + `StorageService`. Verify correct data passed to templates, S3 upload called with correct params |
| `synthesis.service.spec.ts` | Orchestration sequence | Mock all sub-services. Verify: correct call order, progress updates after each step, error handling at each stage, partial failure recovery |

### Test Data Requirements
Use fixtures from `src/modules/ai/tests/fixtures/`:
- `mock-evaluation.fixture.ts` - complete 11-agent evaluation results
- `mock-synthesis.fixture.ts` - expected synthesis output
- `mock-investor.fixture.ts` - diverse investor profiles (different stages, geographies, theses)

## Reference Files

### Code to Port
- `old-backend/score-computation.ts` - weighted scoring logic, normalization, validation
- `old-backend/investor-agents.ts` - location normalization, thesis alignment logic

### Existing Infrastructure
- `src/modules/analysis/processors/matching.processor.ts` - current matching processor (first-level filter patterns)
- `src/modules/startup/pdf.service.ts` - PDF generation service using PDFKit
- `src/modules/storage/storage.service.ts` - S3 upload utilities

### Schema Files
- `src/modules/ai/schemas/synthesis.schema.ts` - Zod schema for synthesis output
- `src/modules/ai/schemas/thesis-alignment.schema.ts` - Zod schema for investor fit scoring

## Effort Estimate
**Size: M (2-3 days)**

### Breakdown
- Synthesis agent integration: 0.5 day
- Score computation porting + testing: 1 day (thorough math validation)
- Investor matching two-stage: 0.75 day
- Location normalizer + caching: 0.25 day
- Memo generation: 0.25 day
- Orchestration service: 0.25 day
- Comprehensive testing: 0.5 day

### Dependencies
- Evaluation phase (Phase 6) must be complete
- `stage_scoring_weights` table must exist and be populated
- Investor thesis data must be available in database
- PDF service and storage service must be functional

### Risk Factors
- Schema validation failures on complex synthesis output - mitigate with thorough schema testing
- Performance issues with thesis alignment for large investor sets - mitigate with batching
- Percentile rank computation expensive for large startup database - mitigate with indexed queries
