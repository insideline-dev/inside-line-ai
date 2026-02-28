# InsideLine Codebase Investigation Report

**Date:** 2026-02-28  
**Scope:** Evaluation agents, investor thesis AI summary, startup-investor matching  

---

## 1. Evaluation Agents — How They Work & Why They Fail

### Architecture Overview

11 agents run in parallel during the evaluation phase. Each extends `BaseEvaluationAgent<TOutput>` which handles all retry/fallback logic.

**File locations:**
- `backend/src/modules/ai/agents/evaluation/base-evaluation.agent.ts` — base class (the most important file)
- `backend/src/modules/ai/agents/evaluation/{team,market,product,traction,business-model,gtm,financials,competitive-advantage,legal,deal-terms,exit-potential}-evaluation.agent.ts` — 11 concrete agents
- `backend/src/modules/ai/schemas/evaluations/{team,market,...}.schema.ts` — Zod schemas per agent
- `backend/src/modules/ai/schemas/base-evaluation.schema.ts` — shared base schema
- `backend/src/modules/ai/processors/evaluation.processor.ts` — BullMQ processor
- `backend/src/modules/ai/services/evaluation.service.ts` — orchestrates parallel runs

### How It Works (Input → Processing → Output)

1. **Input:** `EvaluationPipelineInput` — contains `extraction`, `scraping`, `research` data from prior phases
2. **Setup:** Each agent calls `buildContext(pipelineData)` to shape agent-specific context, then loads prompt from DB (or code fallback) via `AiPromptService.resolve()`
3. **AI call:** Uses Vercel AI SDK `generateText()` with `Output.object({ schema: this.schema })` — structured output mode
4. **Output validation:** `this.schema.parse(response.output)` with Zod
5. **Normalization:** `normalizeNarrativeFields()` post-processes narrative text fields

### Zod Schemas

Base schema (`base-evaluation.schema.ts`) defines:
```typescript
BaseEvaluationSchema = z.object({
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  feedback: z.preprocess(nullToFallbackString("..."), z.string().min(1)),
  narrativeSummary: optionalNarrative,
  memoNarrative: optionalNarrative,
  keyFindings: stringArray,  // preprocessed null → []
  risks: stringArray,
  dataGaps: stringArray,
  sources: stringArray,
})
```

Each agent extends with agent-specific fields. Example `TeamEvaluationSchema`:
```typescript
TeamEvaluationSchema = BaseEvaluationSchema.extend({
  founderQuality: requiredStringFromNull("Founder quality requires manual review"),
  teamCompletion: z.number().int().min(0).max(100),
  executionCapability: requiredStringFromNull("..."),
  founderMarketFitScore: z.number().int().min(0).max(100),
  teamMembers: z.array(TeamMemberEvaluationSchema).default([]),
})
```

All schemas use `z.preprocess()` to handle null → default conversions, making them fairly null-tolerant.

### What Happens When Output Doesn't Match Schema

1. `this.schema.parse(response.output)` throws `ZodError`
2. Classified as `SCHEMA_OUTPUT_INVALID` fallback reason
3. **Text recovery attempted** — re-calls the model without structured output, tries to extract JSON from the raw text response
4. If text recovery fails, retried up to `maxAttempts` (default: 3)
5. After all retries exhausted, `fallback()` method is called — returns hardcoded safe values
6. Agent result is returned with `usedFallback: true`

**Key code (base-evaluation.agent.ts ~line 175-235):**
```typescript
} catch (error) {
  if (this.shouldAttemptTextRecovery(message)) {
    const recovered = await this.tryRecoverFromTextOutput({...});
    if (recovered.success) { return result; }
  }
  // classify, decide retry vs fallback
  const fallbackReason = this.classifyFallbackReason(error, message);
  const shouldRetry = attempt < maxAttempts && this.shouldRetryFallbackReason(fallbackReason);
  if (shouldRetry) { continue; }
  return { key, output: fallbackOutput, usedFallback: true, error, fallbackReason };
}
```

### Where Prompts Are Stored and Loaded

Prompts live in the **database** (`ai_prompt_revision` table), with code fallbacks from `ai-prompt-catalog.ts`.

Resolution flow (`ai-prompt.service.ts`):
1. Check in-memory cache (60s TTL)
2. Look up `aiPromptDefinition` by key (e.g. `evaluation.team`)
3. Find published `aiPromptRevision` — stage-specific first, then global
4. If no DB record → fall back to hardcoded `AI_PROMPT_CATALOG[key].defaultSystemPrompt/userPrompt`
5. Inject narrative guardrails into system prompt
6. Cache result

**Prompt keys follow pattern:** `evaluation.team`, `evaluation.market`, etc.

Admin can create/update/publish prompt revisions via API. `seedFromCode()` seeds initial prompts from catalog.

### Retry/Fallback Mechanism

```
Attempt 1
  → schema parse fails → text recovery → retry if SCHEMA_OUTPUT_INVALID / TIMEOUT / EMPTY_STRUCTURED_OUTPUT / MODEL_ERROR
Attempt 2
  → fails again → retry
Attempt 3 (maxAttempts)
  → fails → FALLBACK (hardcoded safe values)
```

Hard timeout per agent: `attemptTimeout * maxAttempts + 30s` (default ~300s).

### Specific Failure Modes

| Failure | Reason Code | Retry? |
|---------|------------|--------|
| Model returns empty output | `EMPTY_STRUCTURED_OUTPUT` | Yes |
| Model output fails Zod parse | `SCHEMA_OUTPUT_INVALID` | Yes |
| Model/network timeout | `TIMEOUT` | Yes |
| Provider API error | `MODEL_OR_PROVIDER_ERROR` | Yes |
| Any uncaught exception | `UNHANDLED_AGENT_EXCEPTION` | No |

**The core failure mode when prompts change:**

When a prompt is updated to return a new field that the Zod schema doesn't expect — no problem (extra fields are stripped). BUT when a prompt changes the **type** or **removes a required field**, the Zod `.parse()` throws and the agent falls back.

**Critical issue:** The schema and prompts are managed independently. An admin can edit a prompt in the DB to return different fields, but the Zod schema is hardcoded in TypeScript. There's a `AgentSchemaRegistryService` and `aiAgentSchemaRevision` table suggesting a schema-versioning system exists, but whether the runtime actually uses it to dynamically validate is unclear — the agents directly use the hardcoded TypeScript schemas.

**The practical risk:** If someone edits a prompt via admin UI to change the output shape, agents will silently fall back to hardcoded values rather than failing loudly. The `usedFallback: true` flag is how you detect this.

---

## 2. Investor Thesis AI Summary

### Does It Exist?

**Yes — it exists and is fully implemented.** It's a hybrid rule-based system (not AI-generated), built into `ThesisService`.

**File:** `backend/src/modules/investor/thesis.service.ts`

### How It Works

When an investor saves/updates their thesis (`upsert()` method), the summary is **automatically generated synchronously** using `buildThesisSummary()`.

```typescript
async upsert(userId: string, dto: CreateThesis | UpdateThesis) {
  // ... geography normalization ...
  const thesisSummary = this.buildThesisSummary({ ...existing, ...payload });
  payload.thesisSummary = thesisSummary;
  payload.thesisSummaryGeneratedAt = thesisSummary ? new Date() : null;
  // ... upsert to DB ...
}
```

**`buildThesisSummary()` logic** (rule-based string builder):
1. Appends `thesisNarrative` (investor's written thesis)
2. Appends `notes`
3. Lists industries, preferred stages, geographic focus
4. Formats check size range (min/max USD)
5. Lists business model preferences, must-have signals, deal breakers, anti-portfolio constraints
6. Truncates to 2000 chars

**`composeSummary()`** is a separate method (similar logic) used by the `generateSummary()` endpoint.

### Separate `generateSummary()` Endpoint

There's also an explicit endpoint that re-generates the summary on demand. It uses `composeSummary()` (slightly different implementation than `buildThesisSummary()`) and saves to DB.

### Key Finding: NOT AI-Generated

Despite the method being called `generateSummary`, **it does NOT call any AI model**. It's pure string concatenation of the investor's own data fields.

The `thesisSummary` field is then used by `InvestorMatchingService.alignThesis()` when matching startups:
```typescript
investorThesisSummary: candidate.thesisSummary ?? "Not available",
```

### Recommendation

If the goal is true AI-generated summaries (e.g., "This investor focuses on Series A B2B SaaS in MENA with a strong bias toward capital-efficient founders..."), that would need to be built. The infrastructure exists (`AiProviderService`, `AiPromptService`) to add a real LLM call to `generateSummary()`. The current summary is functional but mechanical.

---

## 3. Startup-Investor Matching

### Two Matching Systems Exist

There are **two separate matching implementations** — important distinction:

**A. Legacy matching** (`backend/src/modules/analysis/processors/matching.processor.ts`)  
- Uses `MatchService.calculateOverallScore()` with simple weighted averages
- Does NOT use AI/thesis alignment
- Does NOT do industry/geography filtering
- Still lives in the codebase but appears to be superseded

**B. New AI matching** (`backend/src/modules/ai/processors/matching.processor.ts` + `investor-matching.service.ts`)  
- Filters by industry, stage, check size, geography first
- Then calls AI (`alignThesis()`) to compute `thesisFitScore` per investor
- Composite score = `thesisFitScore * 0.7 + weightedStartupScore * 0.3`
- Uses investor's `thesisSummary` as AI input
- Saves results to `startupMatch` table

### Is It Triggered Automatically?

**Yes — but only when a startup is approved.**

Flow in `pipeline.service.ts → finalizeStartupAfterPipelineCompletion()`:
```typescript
if (currentStatus === StartupStatus.APPROVED) {
  await this.startupMatching.queueStartupMatching({
    startupId,
    requestedBy,
    triggerSource: "retry",  // NOTE: "retry" even on first run - possible naming bug
  });
}
```

The pipeline calls this after synthesis phase completes. If the startup isn't yet approved (which is typical — it goes to PENDING_REVIEW), matching does NOT run automatically. 

Matching is triggered again when admin approves a startup:
- `startup.service.ts` calls `queueStartupMatching({ triggerSource: "approval" })`
- `match.service.ts` also triggers it in certain conditions

Manual re-trigger available at `admin-matching.service.ts`.

### What Data It Uses

```
Matching filters (hard gates):
  - investor.industries ∩ startup.industry
  - investor.stages includes startup.stage
  - startup.fundingTarget within investor checkSizeMin/Max
  - startup.geoPath matches investor.geographicFocusNodes

AI scoring (for each passing investor):
  - synthesis.executiveSummary, recommendation, overallScore → AI prompt
  - investor.thesisSummary, thesisNarrative, notes → AI prompt
  - Output: thesisFitScore (0-100) + fitRationale

Final composite:
  - overallScore = investor-weighted section scores
  - compositeFitScore = thesisFitScore * 0.7 + overallScore * 0.3
```

### Issues & Gaps

1. **Duplicate MatchingProcessor classes** — both `modules/analysis/processors/matching.processor.ts` and `modules/ai/processors/matching.processor.ts` exist. The old one uses `AnalysisService` and simple score math; the new one uses `StartupMatchingPipelineService` with AI. If both are registered in their respective modules and processing the same queue, there could be conflicts.

2. **`triggerSource: "retry"` used for first-time auto-trigger** — in `finalizeStartupAfterPipelineCompletion()`, `triggerSource` is hardcoded to `"retry"` even when it's the first automatic trigger. Cosmetic but confusing for analytics.

3. **Matching only runs for APPROVED startups** — if a startup completes the pipeline but hasn't been approved yet, matching doesn't run at pipeline completion. It runs when approved. This is probably intentional.

4. **No re-matching when investor updates thesis** — `match.service.ts` has some logic to trigger matching when a new thesis is created, but it's unclear if all existing startups are re-matched when an investor updates their thesis criteria. This is likely a gap.

5. **AI fallback score** — if `alignThesis()` fails (model error, timeout), it returns `getMatchingFallbackScore()` (a config value). This means failed AI calls silently produce matches with a fallback score, potentially surfacing incorrect matches to investors.

6. **Legacy `MatchService` vs. new `InvestorMatchingService`** — both write to `startupMatch` table. The legacy processor (`analysis/processors`) uses `MatchService.createOrUpdate()` while the new one (`ai/processors`) directly uses `InvestorMatchingService`. Could overwrite each other's results.

---

## Summary Table

| Area | Status | Critical Issues |
|------|--------|----------------|
| Evaluation agents | Fully implemented with retry/fallback | Schema-prompt mismatch causes silent fallback; no loud failure signal |
| Thesis AI summary | Implemented (rule-based, not AI) | Not actually AI-generated; usable as-is |
| Startup-investor matching | Fully implemented (AI-powered) | Two competing matching systems; no re-match on thesis update |
