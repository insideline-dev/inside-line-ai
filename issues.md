# Codebase Issues

> Pipeline · Redis · Scraping · Agents — security issues excluded.

---

## Pipeline

### P1 — Double Retry Job on Timeout
**File:** `backend/src/modules/ai/services/pipeline.service.ts:888-890`

`handlePhaseTimeout` calls `updatePhase(FAILED)` directly, then calls `onPhaseFailed()` which **also** calls `updatePhase(FAILED)` and increments the retry counter + queues a new job. One timeout event emits two retry jobs.

---

### P2 — No Transaction in `retryPhase` — Partial State on Crash
**File:** `backend/src/modules/ai/services/pipeline.service.ts:173-226`

Four separate writes with no transaction:
1. Create run record
2. Remove queue jobs
3. Update startup status
4. Clear phase result

Crash between any two leaves the startup stuck in `ANALYZING` with no queued jobs and no recovery path.

---

### P3 — Enrichment Skip Check Runs Twice
**Files:** `backend/src/modules/ai/services/pipeline.service.ts:546-562` · `backend/src/modules/ai/processors/enrichment.processor.ts:81-108`

`queuePhase()` calls `assessNeed()` before queuing. The processor checks `isEnrichmentEnabled()` again at execution time. If config changes between those two moments, behavior is undefined. Neither is the authoritative gate.

---

### P4 — `PipelineStateService.init` Hardcodes Wrong Starting Phase
**File:** `backend/src/modules/ai/services/pipeline-state.service.ts:111`

```ts
currentPhase: PipelinePhase.ENRICHMENT, // ← should be EXTRACTION
```

Pipeline config defines EXTRACTION as the first phase. UI and logs show the wrong current phase until the first `updatePhase` call overwrites it. Same wrong default in `ProgressTrackerService.ensureProgress`.

---

### P5 — `withStateMutationLock` Is Process-Local — Broken in Multi-Worker Deployments
**File:** `backend/src/modules/ai/services/pipeline-state.service.ts:462-479`

```ts
private stateMutationQueue: Promise<void> = Promise.resolve();
```

This in-memory queue only serializes within one Node.js process. ENRICHMENT and SCRAPING run in parallel on potentially different BullMQ workers/pods. Both do read-modify-write on Redis state with no distributed lock — last writer silently wins and drops the other's update.

---

### P6 — `withStateMutationLock` Silently Swallows Previous Errors
**File:** `backend/src/modules/ai/services/pipeline-state.service.ts:472`

```ts
await previous.catch(() => undefined); // error discarded
```

If a previous queued mutation threw, the next operation runs on corrupt/stale state with zero indication anything went wrong.

---

### P7 — Stale-Check Uses Manual `retryCount` in Job Metadata, Ignores BullMQ's `attemptsMade`
**File:** `backend/src/modules/ai/processors/run-phase.util.ts:182-190`

BullMQ has `job.attemptsMade` natively. The code ignores it and reads `job.data.metadata.retryCount` instead. If that field is missing or malformed, `readJobRetryCount` returns `0` — which may be less than `state.retryCounts[phase]` — causing a valid retry job to be silently skipped as stale.

---

### P8 — Missing `await` in Enrichment Processor Callbacks
**File:** `backend/src/modules/ai/processors/enrichment.processor.ts:150,173,200,238,280`

```ts
this.pipelineService.onAgentProgress({...}) // no await, no void
  .catch((e) => {...});
```

Extraction processor explicitly uses `void` to mark intentional fire-and-forget. Enrichment doesn't — it's an accidental fire-and-forget. Progress updates can be silently lost.

---

## Redis

### R1 — Boot-Time Cache Writes Lost When Redis Connects
**File:** `backend/src/modules/ai/services/redis-fallback.service.ts:95-112`

Redis uses `lazyConnect: true` and connects via a fire-and-forget `.connect()`. During the window before connection resolves, all cache writes go to in-memory fallback. When Redis eventually connects, `syncMemoryToRedis` only runs on **reconnect** events — not on initial connect. Anything cached at boot is never flushed to Redis and disappears on restart or if a different worker handles the next read.

---

### R2 — `setCache(key, data, ttl=0)` Deletes the Existing Entry Instead of No-Op
**File:** `backend/src/modules/ai/services/scraping-cache.service.ts:110-116`

```ts
if (ttlSeconds <= 0) {
  await this.redisClient.del(key); // ← deletes, doesn't no-op
  return;
}
```

If `WEBSITE_CACHE_TTL_HOURS` or `LINKEDIN_CACHE_TTL_DAYS` is set to `0`, every cache write **purges** the existing cached value instead of skipping. Completely backwards behavior — disabling caching actively destroys cached data.

---

## Scraping

### S1 — `liveEnriched` Index Reassembly — Wrong Person Gets Wrong LinkedIn Data
**File:** `backend/src/modules/ai/services/scraping.service.ts:1099-1125`

Non-cached members are sent to `enrichTeamMembers` as a subset. Results are stitched back by walking the original array with a sequential `liveIndex`. If `enrichTeamMembers` internally skips or short-circuits any member (error, rate-limit, integration unavailable), `liveIndex` drifts — member A gets member B's enrichment data silently attached.

---

### S2 — Original Website URL Passed to LinkedIn Enrichment Instead of Corrected One
**File:** `backend/src/modules/ai/services/scraping.service.ts:303-308`

```ts
const effectiveWebsite = enrichment?.website?.value ?? record.website;
// scraping correctly uses effectiveWebsite ✓
// linkedin enrichment context uses:
record.website // ← original, possibly wrong or missing
```

If the enrichment phase corrected the website URL, LinkedIn enrichment context still receives the stale original.

---

### S3 — `matchesTargetCompany` Single-Token Match Creates Massive False Positives
**File:** `backend/src/modules/ai/services/linkedin-enrichment.service.ts:966-972`

```ts
return targetTokens.some((token) => candidate.includes(token));
```

"Acme Labs" matches any company containing "acme" OR "labs". Generic tokens like "tech", "labs", "group", "solutions" produce a huge false positive rate — wrong LinkedIn profiles pass verification and get attached to team members.

---

### S4 — `assessRequestedProfile` Accepts Any Profile at Confidence ≥70 When No Company Name
**File:** `backend/src/modules/ai/services/linkedin-enrichment.service.ts:1006-1015`

```ts
if (!companyName) {
  return { accepted: true, confidence: Math.max(70, nameConfidence), ... };
}
```

No company name means any name-matched profile is accepted at ≥70% confidence, well above the 55% threshold. Startups with a missing name get arbitrary LinkedIn profiles attached as verified team members.

---

### S5 — `fetchSitemapUrls` Regex Parses XML — Breaks on CDATA and HTML Entities
**File:** `backend/src/modules/ai/services/website-scraper.service.ts:715-727`

```ts
/<loc>\s*(.*?)\s*<\/loc>/gi
```

Breaks on `<![CDATA[https://...]]>` and `&amp;` in URLs. Malformed URLs are pushed into the subpage candidate list and silently fail to scrape.

---

### S6 — `dedupeLinks` Cap Applied Before Deduplication — Double-Capped
**File:** `backend/src/modules/ai/services/website-scraper.service.ts:143-145`

```ts
pages.flatMap((page) => page.links).slice(0, this.maxLinksPerPage)
```

`slice` runs before `dedupeLinks`. If the first N links are mostly duplicates, effective unique count is far below `maxLinksPerPage`. Already capped per-page in `parseHtml` as well — double-capping reduces coverage significantly.

---

### S7 — Crawl4AI Single 60s Timeout Covers Entire Batch of 10 URLs
**File:** `backend/src/modules/ai/services/crawl4ai.service.ts:27-28`

One `AbortController` with a 60s timeout governs a batch request for up to 10 URLs. One slow page kills all 10 in the batch. The fallback then retries each individually with native `fetch` at 30s each — a single slow page guarantees two full timeout cycles of wasted time.

---

## Agents

### A1 — N+1 Queries in Investor Matching — No Batching
**File:** `backend/src/modules/ai/services/investor-matching.service.ts:118-156`

```ts
await Promise.all(
  firstFilterPassed.map(async (candidate) => {
    await this.alignThesis(candidate, input);        // 1 query per candidate
    await this.computeInvestorWeightedScore(...);    // 1 query per candidate
    await this.persistMatch(...);                    // 1 write per candidate
  })
);
```

100 candidates = 200+ concurrent DB queries with no batching. Will exhaust connection pools at scale.

---

### A2 — Throw Path in Team Discovery Fires `onAgentStart` With No Matching `onAgentComplete`
**File:** `backend/src/modules/ai/services/scraping.service.ts:226-251`

When `discoverCompanyLinkedinLeadership` throws inside the team discovery step, the catch block fires `onAgentComplete` with `failed` and re-throws. The LinkedIn agent's `onAgentStart` was already emitted — but on the throw path the enrichment result is never assigned. Progress event stream has a dangling start with no corresponding close.

---

### A3 — `assessRequestedProfileWithAi` — Redundant `safeParse` After `Output.object`
**File:** `backend/src/modules/ai/services/linkedin-enrichment.service.ts:1114-1158`

```ts
const response = await generateText({
  output: Output.object({ schema: LinkedInIdentityVerifierSchema }),
});
const parsed = LinkedInIdentityVerifierSchema.safeParse(response.output); // ← redundant
```

`Output.object` already validates and types `response.output` against the Zod schema. The second `safeParse` can never fail unless the AI SDK itself is broken.

---

## Frontend (Pipeline-Related)

### F1 — Race Condition in Progress Tracking — `setQueryData` + Immediate `invalidateQueries`
**File:** `frontend/src/lib/startup/useStartupRealtimeProgress.ts:369-392`

Optimistic update via `setQueryData` is immediately followed by `invalidateQueries`, which triggers a refetch that races with and overwrites the optimistic data. Pipeline progress flashes and jumps in the UI.

---

### F2 — `terminalNotified` Ref Never Reset on Re-Analysis
**File:** `frontend/src/components/AnalysisProgressBar.tsx:148-169`

Once a pipeline completes, `terminalNotified = true`. If the user re-analyzes the same startup, `onTerminalStatus` never fires because the ref is never reset. Second pipeline completion is invisible to the UI.

---

### F3 — Stale Closure in Socket Listeners After Startup Navigation
**File:** `frontend/src/lib/auth/useSocket.ts:216-296`

Handler refs are updated in one effect, socket listeners registered in another with `[socket, startupId, filterByStartup]` as deps. If `startupId` changes while a pipeline is running, listeners continue filtering by the old `startupId` — progress events for the new startup are silently dropped.

---

## Summary

| Area     | Count | Highest Impact                                      |
|----------|-------|-----------------------------------------------------|
| Pipeline | 8     | Double retry job (P1), no transaction (P2), process-local mutex (P5) |
| Redis    | 2     | Boot-time cache loss (R1), TTL=0 deletes cache (R2) |
| Scraping | 7     | Wrong person gets wrong LinkedIn data (S1), false-positive matching (S3) |
| Agents   | 3     | N+1 investor queries (A1)                           |
| Frontend | 3     | Progress race condition (F1), terminal ref not reset (F2) |
| **Total**| **23**|                                                     |
