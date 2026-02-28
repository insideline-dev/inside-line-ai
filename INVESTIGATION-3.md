# INVESTIGATION-3.md — InsideLine Bug Investigation Report

**Date:** 2026-02-28  
**Scope:** Bugs 2, 7, 8, 9, 10, 11, 12, 18, 21, 22  
**Status:** Investigation complete — no code changes made

---

## Bug 2: Extraction — Pitch deck / uploaded docs not being processed

### Root Cause

**File:** `backend/src/modules/ai/services/extraction.service.ts`

The extraction flow is well-implemented, but has one hard failure path:

1. **Primary fetch path (lines ~95–125):** If `record.pitchDeckPath` exists, it calls `this.storage.getDownloadUrl(record.pitchDeckPath, 900)` to generate a signed URL, then downloads the buffer. If storage fails (missing file, expired credentials, misconfigured bucket), it catches the error, adds a warning, and falls back to `pitchDeckUrl`.
2. **OCR fallback:** If both pdf-parse/pptx-parse fail (no extractable text) AND OCR fails, the service **throws a hard error** (`throw new Error(errorMessage)`) at line ~280. This propagates up to the queue processor and marks the pipeline job as failed — this is the "pipeline showing failure" behavior.
3. **Silent fallback:** If neither `pitchDeckPath` nor `pitchDeckUrl` is set, it silently falls back to startup form data with a warning — no failure surfaced to admin.

The pitch deck upload flow stores files to `pitchDeckPath` on the startup record. The extraction service correctly reads this. **The failure mode is:** file is stored in DB as a path but the actual object doesn't exist in storage (upload interrupted, wrong bucket, env mismatch), causing the signed URL fetch or download to fail. If OCR also fails (e.g. Mistral key not configured), the pipeline hard-fails.

### Severity: High

### Fix Approach
Add a pre-flight check in the extraction pipeline: validate that `pitchDeckPath` resolves to a real object in storage before starting the pipeline, surfacing the error to admins early. Separately, ensure Mistral OCR credentials are properly configured so the OCR fallback doesn't also fail, turning a recoverable warning into a hard crash.

---

## Bug 7: Research agents not receiving admin/research orchestrator guidance

### Root Cause

**File:** `backend/src/modules/ai/services/research.service.ts` (lines ~905–960)

The `research.orchestrator` prompt key exists in the catalog (`ai-prompt-catalog.ts` line 50) and even has a DB seed entry. However, **it is never actually executed as an AI call that feeds context to research agents**.

In `research.service.ts`, the method `resolveResearchKeys()` (line ~910) queries `agentConfigService.getEnabled("research_orchestrator", "pipeline")` — this only determines **which agents are enabled** (a routing/config decision). It does NOT:
- Call an LLM with the `research.orchestrator` prompt
- Capture any output
- Wire that output into `ResearchPipelineInput` or agent `contextBuilder`s

Admin guidance IS wired in separately: `loadFeedbackContext()` (line ~405) loads `PipelineFeedback` records and passes them as `adminFeedback` to `buildResearchPromptVariables()`. So admin feedback notes do reach agents. But a "research orchestrator" AI pre-pass that synthesizes guidance does not run — the prompt exists purely as catalog infrastructure.

### Severity: High

### Fix Approach
Add a pre-step in `research.service.ts` that calls `promptService.resolve({ key: 'research.orchestrator' })`, executes it via `GeminiResearchService`, and injects the output as a field in `ResearchPipelineInput`. Each agent's `contextBuilder` can then optionally consume `orchestratorGuidance` and `buildResearchPromptVariables()` can expose it as a template variable.

---

## Bug 8: Some research agents failing

### Root Cause

**File:** `backend/src/modules/ai/services/research.service.ts`

Phase 1 agents (team, market, product, news) run in parallel via `Promise.all` + `settleAgentRun()` which handles individual agent failures gracefully with fallbacks. Phase 2 (competitor) runs sequentially after Phase 1.

The most likely failure causes are:
1. **Gemini API rate limits / quota exhaustion** — 4 agents fire simultaneously. Despite stagger logic (`researchAgentStaggerMs`, default 5s), simultaneous Google Search tool calls can hit per-minute rate limits.
2. **Missing or wrong Gemini/search API key** — one bad credential silently falls back to a static fallback report. No loud error, just a fallback reason logged at WARN.
3. **Phase 2 competitor agent** — receives Phase 1 combined report via `buildCompetitorInput()`. If Phase 1 agents all produced fallback-only output, competitor gets weak context.

Error handling path: `settleAgentRun()` → `unwrapSettled()` → `handleAgentResult()`. If an agent throws, `usedFallback=true` and a static fallback string is used. No hard failure, so "some agents failing" means their output is the deterministic fallback — not empty, just low quality.

### Severity: High

### Fix Approach
Add observability: log which agents fell back and why to a persistent table (not just job metadata). Add alerting when fallback rate exceeds a threshold. Consider lowering parallel concurrency or increasing stagger to reduce Gemini quota pressure.

---

## Bug 9: Product research agent — wrong input (no product description)

### Root Cause

**Files:**  
- `backend/src/modules/ai/agents/research/product-research.agent.ts` (line 24)  
- `backend/src/modules/ai/services/research-prompt-variables.ts` (lines 276–284, 323)

The product research agent's `contextBuilder` sets `productDescription` as:
```ts
researchParameters?.productDescription ?? extraction.rawText
```

Then `research-prompt-variables.ts` line 323 sets the final template value as:
```ts
productDescription: truncate(rp?.productDescription || productDescription, 8000)
```

Where local `productDescription` falls back: `startupFormContext.productDescription → agentContext.productDescription → extraction.tagline → extraction.rawText`.

**The bug:** `researchParameters.productDescription` is AI-generated from the pitch deck via `ResearchParametersService`. If this service fails/returns empty string (falsy), the next check is `startupFormContext.productDescription`. BUT in `research-prompt-variables.ts` line 323, `rp?.productDescription` is evaluated first — and if it returns an empty string `""`, it evaluates as falsy in JS (`"" || productDescription`) so the fallback chain works. **However**, the `contextBuilder` in `product-research.agent.ts` uses `??` (nullish coalescing), not `||`, so an empty string `""` from researchParameters would NOT trigger the fallback — the agent gets an empty product description.

Compare to market research agent which uses `extraction.rawText` as `companyDescription` directly (full deck text) — it always has non-empty content.

### Severity: High

### Fix Approach
Change `product-research.agent.ts` contextBuilder line 24 to:
```ts
productDescription: researchParameters?.productDescription || extraction.startupContext?.productDescription || extraction.rawText
```
Use `||` instead of `??` so empty strings trigger the fallback. Also add `extraction.startupContext?.productDescription` as a high-priority fallback since it's directly the user's form input.

---

## Bug 10: Product research agent — wrong output structure

### Root Cause

**Files:**  
- `backend/src/modules/ai/agents/research/product-research.agent.ts` (line 17)  
- `backend/src/modules/ai/prompts/research/product-research.prompt.ts` (lines 100–133)

The agent's schema is `z.string()` — it expects a plain text report. The prompt explicitly says: "Return ONLY plain text report output. Do NOT return JSON." The prompt defines a structured text format with 9 numbered sections and headers.

**The bug:** The prompt requests structured output with labelled sections ("**Product:**", "**Maturity:**", etc.) but the schema is just `z.string()`. The downstream evaluation agent (`product-evaluation.agent.ts`) likely expects a specific structure or field it can parse. If the LLM produces the text but omits or restructures sections (or if the evaluation agent expects a different field name), the data is present but in the wrong shape.

Additionally, the prompt at line 142 references `{{claimedTechStack}}` but the human prompt template (line 139) also uses `{{adminGuidance}}` and `{{claimedTechStack}}` — these must be populated by `buildResearchPromptVariables`. If `claimedTechStack` is empty, the model gets a blank section and may skip product-technical research.

### Severity: Medium

### Fix Approach
Audit what the product evaluation agent (`agents/evaluation/product-evaluation.agent.ts`) expects from the research output and confirm the prompt's requested format matches. If evaluation expects specific section headers, add a Zod schema that validates the text structure or switch to structured JSON output. Ensure `claimedTechStack` template variable is always populated with meaningful fallback text.

---

## Bug 11: Evaluation agents not using right DB prompts

### Root Cause

**Files:**  
- `backend/src/modules/ai/agents/evaluation/base-evaluation.agent.ts` (line 131)  
- `backend/src/modules/ai/services/ai-prompt.service.ts` (lines 99–180)  
- `backend/scripts/seed-new-prompt-definitions.ts`

The evaluation base agent correctly calls:
```ts
const promptConfig = await this.promptService.resolve({
  key: EVALUATION_PROMPT_KEY_BY_AGENT[this.key],  // e.g. "evaluation.team"
  stage: pipelineData.extraction.stage,
});
```

`promptService.resolve()` queries the DB. **If no published revision is found, it silently falls back to code defaults** (line 148–151) with only a WARN log: `"using code fallback"`.

**The issue:** The seed script (`seed-new-prompt-definitions.ts`) only seeds 4 NEW keys (`pipeline.orchestrator`, `extraction.linkedin`, `research.orchestrator`, `matching.investorThesis`). Evaluation prompt definitions (`evaluation.team`, `evaluation.market`, etc.) must have been seeded separately. If the DB was not fully seeded — or if revisions exist in definition but have no `status='published'` revision — all evaluation agents silently run on hardcoded defaults, not DB prompts.

The `EVALUATION_PROMPT_KEY_BY_AGENT` map in `ai-prompt-catalog.ts` (line 249) correctly maps all 10 evaluation agents to their keys. The keys in the catalog match what's expected.

### Severity: High

### Fix Approach
Add a startup validation in `AiPromptService` or a health-check endpoint that lists all `AI_PROMPT_KEYS` and verifies each has a published revision in DB. Log a CRITICAL error (not just WARN) when falling back to code defaults. Run the full prompt seeding script against the production DB and confirm all keys have published revisions.

---

## Bug 12: Synthesis not using right DB prompts

### Root Cause

**File:** `backend/src/modules/ai/agents/synthesis/synthesis.agent.ts` (line 69–75)

Same root cause as Bug 11. The synthesis agent calls:
```ts
const promptConfig = await this.promptService.resolve({
  key: "synthesis.final",
  stage: ...,
});
```

Same silent fallback behavior applies. If `synthesis.final` has no published revision in DB, it runs on the hardcoded code default with only a WARN log.

### Severity: High

### Fix Approach
Same as Bug 11 — ensure `synthesis.final` is seeded with a published revision in DB. A unified seeding script that covers ALL `AI_PROMPT_KEYS` with default published revisions would resolve both bugs.

---

## Bug 18: Scraping — not all important pages being scraped

### Root Cause

**File:** `backend/src/modules/ai/services/scraping.service.ts` (lines 1069–1100)  
**File:** `backend/src/modules/ai/services/website-scraper.service.ts` (lines 98–179)

The scraping service resolves settings from the published flow config:
```ts
const fallback: WebsiteScrapeSettings = {
  manualPaths: [],
  discoveryEnabled: false,  // ← DEFAULT IS OFF
  source: "default",
};
```

When `discoveryEnabled=false` AND no `manualPaths` are configured, **only the homepage is scraped**. The sitemap is only fetched when `hasManualPaths || discoveryEnabled` (line 112). Without either, the scraper never touches the sitemap or discovers any subpages.

The `discoverSubpages()` method (line 262) has a sophisticated priority scoring system:
- `/about` → score 100
- `/product`, `/platform`, `/features` → score 95
- `/pricing` → score 90
- `/customers`, `/case-studies` → score 85
- etc.

But this scoring system is **never triggered** unless discovery is enabled.

### Severity: High

### Fix Approach
Change the default fallback to `discoveryEnabled: true` so discovery runs even when no published flow config exists. Alternatively, seed a default published flow config with `discoveryEnabled: true` and common `manualPaths` (e.g. `/about`, `/product`, `/pricing`, `/team`). The exclusion patterns in `isExcludedPath()` (line 906) already block docs/changelogs/CDN pages, so enabling discovery won't pull in junk.

---

## Bug 21: Investor matching approval not working

### Root Cause

**Files:**  
- `backend/src/modules/admin/admin.controller.ts` (line 320)  
- `backend/src/modules/ai/services/startup-matching-pipeline.service.ts` (lines 82, 217)

"Approval" here means admin approving a startup (`POST /admin/startups/:id/approve`), which should trigger investor matching. The flow:

1. Admin calls `POST /admin/startups/:id/approve`
2. `startup.service.ts` sets `status = 'approved'`  
3. This should queue matching via `startupMatching.queueStartupMatching()`

**The matching guard** in `StartupMatchingPipelineService` (line 82 and 217):
```ts
if (startupRecord.status !== StartupStatus.APPROVED) {
  throw new BadRequestException(`Startup must be approved before matching...`);
}
```

If the call to queue matching happens before the DB status update commits, or if the approve service doesn't actually call `queueStartupMatching`, matching silently doesn't run.

Additionally, from prior investigation (INVESTIGATION.md): **two competing matching processors** exist — `modules/analysis/processors/matching.processor.ts` (legacy) and `modules/ai/processors/matching.processor.ts` (new AI matching). If both are registered and processing the same queue, they could conflict or the wrong one could run.

### Severity: Critical

### Fix Approach
Verify that `startup.service.ts` approve() explicitly calls `startupMatching.queueStartupMatching()` after saving to DB and confirm the call is NOT conditional on a feature flag that may be off. Disable or remove the legacy `analysis/processors/matching.processor.ts` to eliminate the dual-processor conflict. Add a log line confirming matching was queued after each approval.

---

## Bug 22: Investor thesis analysis not showing

### Root Cause

**Files:**  
- `frontend/src/routes/_protected/investor/startup.$id.tsx` (lines 304–319)  
- `backend/src/modules/investor/entities/investor.schema.ts` (line 221)

The frontend renders thesis analysis with:
```tsx
{typeof match?.fitRationale === "string" && match.fitRationale.trim().length > 0 && (
  <p>{match.fitRationale}</p>
)}
```

This guard fails when `fitRationale` is `null` (not a string). The DB column `fit_rationale text` is nullable.

**The actual problem:** `fitRationale` is only populated by the **new AI matching service** (`investor-matching.service.ts`, which calls `alignThesis()` and saves `fitRationale` from the LLM response). The **legacy matching processor** (`analysis/processors/matching.processor.ts`) uses `MatchService.createOrUpdate()` which does NOT populate `fitRationale` — it only computes weighted score averages.

If the legacy processor ran instead of (or after) the new AI matching service, it overwrites the match record with `fitRationale = null`. The frontend shows nothing.

Additionally: the API endpoint `GET /investor/matches/:startupId` (match.service.ts line 77) does `db.select()` (all columns) from `startupMatch` — `fitRationale` IS returned. So this is not an API serialization issue; it's a data population issue.

### Severity: High

### Fix Approach
Resolve the dual-processor conflict (same fix as Bug 21). Once only the AI matching processor runs, `fitRationale` will be populated. As a secondary fix, update the frontend guard to also check `matchReason` as a fallback display field when `fitRationale` is null: `match.fitRationale ?? match.matchReason`.

---

## Summary Table

| Bug | Title | Severity | Primary File |
|-----|-------|----------|-------------|
| 2 | Pitch deck extraction failures | High | `extraction.service.ts` |
| 7 | Research orchestrator guidance not wired | High | `research.service.ts:905` |
| 8 | Some research agents failing | High | `research.service.ts` / Gemini quota |
| 9 | Product research — empty product description | High | `product-research.agent.ts:24` |
| 10 | Product research — output structure mismatch | Medium | `product-research.prompt.ts` |
| 11 | Evaluation agents using hardcoded prompts | High | `ai-prompt.service.ts:148` |
| 12 | Synthesis using hardcoded prompts | High | `synthesis.agent.ts:69` |
| 18 | Scraping not discovering important pages | High | `scraping.service.ts:1072` |
| 21 | Investor matching approval not triggering | Critical | `startup.service.ts` + dual-processor conflict |
| 22 | Thesis analysis (fitRationale) not showing | High | Legacy processor overwrites AI matches |
