# InsideLine AI Pipeline Migration Plan

> **Status:** Draft
> **Last Updated:** 2026-02-07
> **Owner:** Engineering Team
> **Goal:** Migrate AI evaluation pipeline from LangChain/GPT monolith to AI SDK/multi-model architecture. Target: **under 10 minutes** end-to-end (currently 25-45 minutes).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current System Analysis](#2-current-system-analysis)
   - 2.1 Architecture Overview
   - 2.2 Agent Inventory
   - 2.3 Data Flow Diagram
   - 2.4 Performance Bottlenecks
   - 2.5 Technical Debt & Problems
3. [New Architecture Design](#3-new-architecture-design)
   - 3.1 Technology Stack Changes
   - 3.2 Queue-Based Job Architecture
   - 3.3 New Pipeline Design
   - 3.4 Context Engineering Strategy
   - 3.5 Structured Output Schemas
   - 3.6 Model Selection Strategy
4. [Module Structure (NestJS)](#4-module-structure-nestjs)
   - 4.1 Directory Structure
   - 4.2 Key Services
5. [Gemini 3 Flash Grounding](#5-gemini-3-flash-grounding-replacing-gpt-52-background-research)
   - 5.1 Why Gemini 3 Flash Grounding
   - 5.2 Research Agent Migration
   - 5.3 Implementation Pattern
6. [Migration Checklist](#6-migration-checklist)
7. [Risk Mitigation](#7-risk-mitigation)
8. [Expected Performance Comparison](#8-expected-performance-comparison)
9. [Error Handling & Resilience](#9-error-handling--resilience)
10. [Testability](#10-testability)
11. [DB Compatibility](#11-db-compatibility)

---

## 1. Executive Summary

InsideLine's AI evaluation pipeline currently takes **25-45 minutes** to analyze a startup. The primary bottleneck is the GPT-5.2 background-mode deep research step, which creates background responses and polls every 15 seconds with a 30-minute timeout. The entire system lives in a monolithic 4,835-line file (`langchain-agents.ts`) using LangChain with no structured output validation, no retry logic, and an in-memory queue that loses state on restart.

This migration replaces:
- **LangChain** with **AI SDK v6** (Vercel) for type-safe, streaming-capable LLM calls
- **GPT-5.2 background polling** with **Gemini 3 Flash Grounding** for real-time web research (no polling)
- **GPT-5.2 evaluation** with **GPT-4o** for 11 parallel evaluation agents with Zod-validated structured output
- **GPT-5.2 synthesis** with **GPT-5.2** (standard mode, not background) for superior reasoning on the final synthesis step
- **GPT-4o vision OCR** with **Mistral OCR** for fast, native PDF processing (1000 pages/min, $2/1000 pages)
- **In-memory queue** with **BullMQ (Redis)** for persistent, scalable job processing
- **Unvalidated JSON parsing** with **Zod schemas** on every agent output via `generateObject()`

Target outcome: **7-11 minutes** total pipeline time (roughly 75% faster), with zero data loss on restart, full token tracking, per-agent context engineering, and a modular NestJS architecture where each agent is its own file.

---

## 2. Current System Analysis

### 2.1 Architecture Overview

The old system lives in `old-backend/` and follows a 5-stage sequential pipeline with limited parallelism:

```
Submission ──> Stage 1: PDF Extraction
                  │
                  v
              Stage 2: Research & Enrichment
              (2A: Website Scraping)
              (2B: LinkedIn Enrichment)
              (2C: Research Parameters)
              (2D: 4 Deep Research Agents - POLLING)
                  │
                  v
              Stage 3: AI Evaluation (11 agents, Promise.all)
                  │
                  v
              Stage 4: Synthesis
                  │
                  v
              Stage 5: Post-Processing
              (Score computation, investor matching, PDF, notifications)
```

**Key Files:**

| File | Lines | Purpose |
|------|-------|---------|
| `langchain-agents.ts` | 4,835 | Main orchestrator, all 12 agent classes, PDF extraction, vision fallback |
| `research-orchestrator.ts` | 1,792 | Research pipeline, 4 deep research agents, background polling |
| `investor-agents.ts` | 753 | Investor thesis generation, first-level filters, thesis alignment |
| `web-tools.ts` | ~500 | Cheerio-based web scraping, Tavily search integration |
| `unipile.ts` | ~300 | LinkedIn profile extraction via Unipile API (7-day cache) |
| `score-computation.ts` | 127 | Weighted scoring with 11 categories |
| `analysis-queue.ts` | 143 | Singleton in-memory queue, max 3 concurrent |
| `analysis-progress.ts` | 275 | 5-stage progress tracking, agent status updates |
| `sync-prompts-inline.ts` | ~2,000 | 21 inline prompt templates |
| `agent-prompt-loader.ts` | ~200 | DB-driven prompt loading with 60-second cache |
| `communication-agent.ts` | ~400 | Clara AI chatbot (AgentMail + Twilio) |
| `pdf-generator.ts` | ~600 | PDFKit report generation |

### 2.2 Agent Inventory

#### Research Agents (Stage 2)

| # | Agent ID | Purpose | Model | Input | Output | Est. Time |
|---|----------|---------|-------|-------|--------|-----------|
| 1 | `dataExtraction` | Parse pitch deck PDF, extract fields (website, stage, sector, founders) | GPT-4o (vision fallback) | PDF binary, up to 20 pages | `ExtractedData`: companyName, website, sector, teamMembers[], deckContent | 5-15 min |
| 2 | `teamDeepResearch` | Background research on founders: patents, exits, achievements | GPT-5.2 (background, web_search) | Team member names/roles, company context | `TeamMemberResearch[]`: pastAccomplishments, patents, previousExits, notableAchievements | 5-30 min (polling) |
| 3 | `marketDeepResearch` | TAM validation, CAGR, market trends, regulatory landscape | GPT-5.2 (background, web_search) | Sector, specificMarket, claimedMetrics (TAM, growthRate) | `MarketResearch`: TAM/SAM/SOM, growthRate, trends[], drivers[], challenges[] | 5-30 min (polling) |
| 4 | `productDeepResearch` | Competitor profiles, features, funding, reviews, market dynamics | GPT-5.2 (background, web_search) | productDescription, knownCompetitors[], targetCustomers | `ProductResearch`: competitors[], reviews[], strengths[], marketDynamics | 5-30 min (polling) |
| 5 | `newsSearch` | Company mentions, funding news, product releases, sentiment | GPT-5.2 (background, web_search) | companyName, sector, geographicFocus | `NewsResearch`: companyMentions[], fundingNews[], sentimentOverview | 5-30 min (polling) |
| 6 | `teamLinkedInResearch` | LinkedIn profile enrichment via Unipile API | Unipile API (no LLM) | LinkedIn URLs from deck | `LinkedInProfileData[]`: headline, experience[], education[], skills[] | 1-3 min |

#### Evaluation Agents (Stage 3)

| # | Agent ID | Purpose | Model | Key Scoring Criteria | Output Fields | Est. Time |
|---|----------|---------|-------|---------------------|---------------|-----------|
| 7 | `team` | Founder-market fit, track record, team composition | GPT-5.2 | Founder-Market Fit (40%), Track Record (25%), Composition (20%), Execution (15%) | overallScore, narrativeSummary, founderProfiles[], teamGaps | 30-60s |
| 8 | `market` | TAM/SAM/SOM validation, competitive landscape | GPT-5.2 | TAM Validation, Growth Rate, Competitive Position, Timing | overallScore, narrativeSummary, tamAnalysis, competitiveLandscape | 30-60s |
| 9 | `product` | Differentiation, TRL, moat, tech stack | GPT-5.2 | Differentiation, Technology Readiness, Moat, Feature Set | overallScore, narrativeSummary, trlAssessment, moatAnalysis | 30-60s |
| 10 | `traction` | Revenue stage, growth metrics, momentum | GPT-5.2 | Revenue Stage, Growth Rate, Momentum, Credibility | overallScore, narrativeSummary, revenueAnalysis, growthMetrics | 30-60s |
| 11 | `businessModel` | Unit economics, CAC/LTV, margins, pricing | GPT-5.2 | CAC/LTV Ratio, Gross Margins, Pricing, Payback Period | overallScore, narrativeSummary, unitEconomics, revenueModel | 30-60s |
| 12 | `gtm` | Channel strategy, sales motion, virality | GPT-5.2 | Channel Effectiveness, Sales Motion, Virality, Content Strategy | overallScore, narrativeSummary, channelAnalysis, salesMotion | 30-60s |
| 13 | `financials` | Capital efficiency, burn rate, valuation, runway | GPT-5.2 | Capital Efficiency, Burn Rate, Valuation, Runway | overallScore, narrativeSummary, burnAnalysis, valuationAssessment | 30-60s |
| 14 | `competitiveAdvantage` | Moat analysis, positioning, barriers | GPT-5.2 | Network Effects, Switching Costs, Data Moat, Brand | overallScore, narrativeSummary, keyCompetitors[], moatDetails | 30-60s |
| 15 | `legal` | Compliance (GDPR/HIPAA), IP, regulatory risk | GPT-5.2 | Regulatory Compliance, IP Ownership, Legal Risks | overallScore, narrativeSummary, complianceChecklist, ipAssessment | 30-60s |
| 16 | `dealTerms` | Valuation assessment, deal structure, dilution | GPT-5.2 | Valuation Reasonableness, Structure, Dilution Impact | overallScore, narrativeSummary, valuationAssessment, dealStructure | 30-60s |
| 17 | `exitPotential` | M&A landscape, IPO feasibility, strategic acquirers | GPT-5.2 | M&A Likelihood, IPO Path, Acquirer Universe | overallScore, narrativeSummary, exitScenarios[], acquirerList | 30-60s |

#### Synthesis & Matching Agents (Stage 4-5)

| # | Agent ID | Purpose | Model | Input | Output | Est. Time |
|---|----------|---------|-------|-------|--------|-----------|
| 18 | `synthesis` | Combine all 11 evaluations into executive summary | GPT-5.2 | All 11 agent outputs | executiveSummary (400-500 words), sectionScores, investorMemo, founderReport | 2-5 min |
| 19 | `investorThesis` | Generate holistic thesis summary for investor | GPT-5.2 | Thesis data, portfolio companies, fund info | thesisSummary, investmentFocus[], typicalCheckSize | 30-60s |
| 20 | `thesisAlignment` | Score startup-investor fit (1-100) | GPT-5.2 | Startup evaluation + investor thesis | fitScore (1-100), rationale, keyStrengths[], concerns[] | 15-30s per investor |
| 21 | `orchestrator` | Coordinate the full pipeline (prompt template exists, logic in langchain-agents.ts) | GPT-5.2 | Pipeline state | Coordination decisions | N/A (embedded) |

### 2.3 Data Flow Diagram

```
                            STARTUP SUBMISSION
                                    |
                    +---------------+---------------+
                    |         STAGE 1: EXTRACTION        |
                    |  PDF ──> pdf-parse ──> text         |
                    |  If image PDF ──> GPT-4o vision     |
                    |    (up to 20 pages in parallel)      |
                    |  Extract: name, website, stage,      |
                    |    sector, location, round size,     |
                    |    founder LinkedIn URLs              |
                    +---------------+---------------+
                                    |
                    +---------------+---------------+
                    |     STAGE 2: RESEARCH (BOTTLENECK)   |
                    |                                       |
                    |  2A ─── Website Deep Scrape           |
                    |  |       Cheerio: /about, /team,      |
                    |  |       /pricing (up to 20 pages)    |
                    |  |                                    |
                    |  2B ─── LinkedIn Enrichment            |
                    |  |       Unipile API (7-day cache)     |
                    |  |       Search by name if no URL      |
                    |  |                                    |
                    |  2C ─── Research Params Generation     |
                    |  |       GPT-5.2: sector, market,      |
                    |  |       competitors, customers        |
                    |  |                                    |
                    |  2D ─── 4x Deep Research (PARALLEL)    |
                    |         GPT-5.2 background mode        |
                    |         Poll every 15s, 30min max      |
                    |         ┌─ Team Research               |
                    |         ├─ Market Research              |
                    |         ├─ Product/Competitor Research   |
                    |         └─ News Search                  |
                    +---------------+---------------+
                                    |
                    +---------------+---------------+
                    |     STAGE 3: AI EVALUATION             |
                    |                                       |
                    |  11 agents via Promise.all():          |
                    |  ┌─ team        ┌─ gtm                |
                    |  ├─ market      ├─ financials          |
                    |  ├─ product     ├─ competitiveAdv      |
                    |  ├─ traction    ├─ legal               |
                    |  ├─ bizModel    ├─ dealTerms           |
                    |  └──────────────└─ exitPotential       |
                    |                                       |
                    |  Each: LangChain RunnableSequence      |
                    |  ──> ChatOpenAI (GPT-5.2)              |
                    |  ──> JsonOutputParser                  |
                    |  Output: score(0-100), narrative,      |
                    |          strengths[], risks[], JSON     |
                    +---------------+---------------+
                                    |
                    +---------------+---------------+
                    |     STAGE 4: SYNTHESIS                 |
                    |  SynthesisAgent combines 11 outputs    |
                    |  ──> executiveSummary (400-500 words)  |
                    |  ──> sectionScores{11}                 |
                    |  ──> investorMemo                      |
                    |  ──> founderReport                     |
                    |  ──> keyStrengths[], keyRisks[]        |
                    |  ──> recommendations                   |
                    +---------------+---------------+
                                    |
                    +---------------+---------------+
                    |     STAGE 5: POST-PROCESSING          |
                    |                                       |
                    |  5A ─── Score Computation               |
                    |  |       computeWeightedScore()        |
                    |  |       11 categories, stage weights   |
                    |  |       sum(score*weight)/sum(weights) |
                    |  |                                     |
                    |  5B ─── Location Normalization          |
                    |  |       AI: location ──> region code   |
                    |  |       (us, europe, asia, latam,      |
                    |  |        mena, global)                 |
                    |  |                                     |
                    |  5C ─── Investor Matching               |
                    |  |       For each investor:             |
                    |  |       1. First-level filters          |
                    |  |          (sector, stage, geo, check)  |
                    |  |       2. AI thesis alignment (1-100)  |
                    |  |       3. Store match + rationale       |
                    |  |                                     |
                    |  5D ─── PDF Memo Generation             |
                    |  |       PDFKit report                   |
                    |  |                                     |
                    |  5E ─── WebSocket Notifications          |
                    |         Socket.io: notification:new,     |
                    |         job:status                       |
                    +---------------------------------------+
```

### 2.4 Performance Bottlenecks

**Total pipeline time: 25-45 minutes**

| Stage | Duration | Bottleneck Reason |
|-------|----------|-------------------|
| **1. PDF Extraction** | 5-15 min | Vision fallback processes up to 20 pages sequentially through GPT-4o. Text-based PDFs are fast (~30s), but image-heavy decks trigger the slow path. |
| **2. Deep Research** | **20-30 min** | **THE BOTTLENECK.** GPT-5.2 `background: true` creates async responses. Each of the 4 agents polls every 15 seconds with a 30-minute timeout. Even though they run in parallel, a single slow agent blocks the whole stage. Average completion is 8-15 minutes per agent, but worst case is 30 minutes. |
| **3. AI Evaluation** | 5-15 min | 11 agents run via `Promise.all()` but share the same OpenAI rate limit. Each call is 30-60s individually, but queued API calls can stretch to 15 minutes under load. |
| **4. Synthesis** | 2-5 min | Single sequential LLM call with a large context window (all 11 agent outputs concatenated). |
| **5. Post-Processing** | 2-5 min | Investor matching iterates sequentially through all investors. Each thesis alignment requires an LLM call. |

**The single largest optimization opportunity is replacing GPT-5.2 background polling with real-time Gemini grounding. This alone could save 15-25 minutes.**

### 2.5 Technical Debt & Problems

#### 2.5.1 Context Engineering Failures

Every evaluation agent receives the **exact same context blob**, regardless of what it actually needs:

```
Current (ALL agents get):
  - deckContent (full pitch deck text, sliced to 4,000 chars)
  - webResearch (full website scrape, all pages concatenated)
  - companyName, website, description, sector, stage
  - teamMembers[] (all LinkedIn data)
  - marketResearch (full TAM/SAM/SOM data)
  - productResearch (full competitor profiles)
  - newsResearch (all news items)
  - adminGuidance (if any)
```

This means:
- The **Legal/Regulatory agent** receives full competitor funding data it will never use
- The **Team agent** receives market TAM data and news items irrelevant to team assessment
- The **Exit Potential agent** receives granular unit economics data
- Token waste is estimated at **40-60% of input tokens per agent call**

#### 2.5.2 No Structured Output Validation

All agents use LangChain's `JsonOutputParser` which:
- Has **no schema validation** -- it just calls `JSON.parse()` on the LLM output
- Agents can return malformed data (missing required fields, wrong types, extra fields)
- The `safeJsonParse()` wrapper retries on parse errors but cannot enforce structure
- No Zod schemas exist anywhere in the old codebase
- Result: downstream consumers (frontend, scoring) must handle arbitrary shapes defensively

#### 2.5.3 Monolithic Codebase

- `langchain-agents.ts` is **4,835 lines** in a single file
- Contains all 12 agent class definitions, the orchestrator, PDF extraction, vision fallback logic, team discovery, and source tracking
- No separation of concerns: extraction logic mixed with evaluation logic mixed with synthesis logic
- Cannot test individual agents in isolation
- Cannot deploy or scale agents independently

#### 2.5.4 In-Memory Queue

```typescript
// analysis-queue.ts -- the entire "queue" is a JS array
class AnalysisQueue {
  private queue: QueuedJob[] = [];
  private activeJobs: Map<number, ActiveJob> = new Map();
  private readonly maxConcurrent: number = 3;
}
```

Problems:
- **Lost on restart** -- all queued/active jobs disappear on deploy or crash
- **No persistence** -- no record of what was processing
- **No retry** -- failed jobs are `catch`ed and logged, not retried
- **No dead letter queue** -- permanently failed jobs vanish
- **No visibility** -- no admin dashboard for queue health
- **Max 3 concurrent** -- hardcoded, not configurable

#### 2.5.5 Wasteful Polling

The deep research polling mechanism:

```typescript
const POLL_INTERVAL = 15000;  // 15 seconds
const MAX_POLL_TIME = 1800000; // 30 minutes

while (!isTerminal(response?.status)) {
  await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  response = await openai.responses.retrieve(responseId);
}
```

- 4 agents polling simultaneously = **8 API calls per minute** just for status checks
- Over a 15-minute average research time = **120 wasted API calls** per startup analysis
- No exponential backoff
- Blocks the Node.js event loop with `setTimeout` chains

#### 2.5.6 No Token Tracking

```typescript
// Hardcoded zeros in response metadata
promptTokens: 0,
completionTokens: 0
```

- No cost tracking per analysis
- No cost tracking per agent
- No ability to optimize token usage because there is no visibility
- Cannot set budgets or alerts

#### 2.5.7 Context Window Overflow

```typescript
deckContent.slice(0, 4000)  // Arbitrary truncation
```

- No intelligent summarization -- just cuts at 4,000 characters
- May cut mid-sentence, mid-number, mid-table
- Important data at position 4,001+ is silently lost
- No token counting to stay within model limits

---

## 3. New Architecture Design

### 3.1 Technology Stack Changes

| Component | Old | New | Rationale |
|-----------|-----|-----|-----------|
| **LLM Framework** | LangChain (`@langchain/openai`, `RunnableSequence`, `JsonOutputParser`) | AI SDK v6 (`@ai-sdk/openai`, `@ai-sdk/google`, `ai`) | Type-safe `generateObject()` with Zod, built-in streaming, lighter dependency tree, no chain abstraction overhead |
| **Research Model** | GPT-5.2 with `background: true` + 15s polling | Gemini 3 Flash with Google Search Grounding | Real-time grounded responses with citations, no polling, responds in seconds |
| **Evaluation Model** | GPT-5.2 via LangChain | GPT-4o via AI SDK | Fast structured output, great for parallel execution, excellent instruction following |
| **Synthesis Model** | GPT-5.2 via LangChain | GPT-5.2 via AI SDK (standard mode) | Best reasoning capability for synthesizing 11 complex analyses into coherent memo |
| **PDF OCR** | GPT-4o (20 pages, sequential) | Mistral OCR | 1000 pages/min, $2/1000 pages, native PDF support -- no page-by-page processing needed |
| **Queue System** | In-memory singleton (`AnalysisQueue` class) | BullMQ with Redis | Persistent jobs survive restarts, built-in retry/backoff, dead letter queues, job dependencies, admin dashboard via Bull Board |
| **Web Scraping** | Cheerio (raw HTML parsing) | Firecrawl API or improved Cheerio | Firecrawl handles JS-rendered pages, automatic content extraction, better for SPAs |
| **Output Validation** | `JsonOutputParser` (no schema) | Zod schemas + `generateObject()` | Type-safe outputs, automatic retry on validation failure, compile-time type inference |
| **Prompt Management** | DB-loaded with 60s cache + inline fallbacks | Static prompt constants in code (version-controlled) | Simpler, testable, reviewable in PRs. DB override can be added later if needed. |

### 3.2 Queue-Based Job Architecture

#### BullMQ Flow Producer Design

The analysis pipeline uses BullMQ's **Flow Producer** to create a dependency tree of jobs. Each stage is a job (or group of parallel jobs) with explicit dependencies on prior stages.

```
analysis:{startupId}                    (Parent Job - orchestrator)
  |
  +-- extraction:{startupId}            (Stage 1 - PDF + field extraction)
  |     |
  |     +-- research:website:{startupId}    (Stage 2A - parallel)
  |     +-- research:linkedin:{startupId}   (Stage 2B - parallel)
  |     +-- research:market:{startupId}     (Stage 2C - parallel)
  |     +-- research:news:{startupId}       (Stage 2D - parallel)
  |           |
  |           +-- eval:team:{startupId}             (Stage 3 - all parallel)
  |           +-- eval:market:{startupId}
  |           +-- eval:product:{startupId}
  |           +-- eval:traction:{startupId}
  |           +-- eval:businessModel:{startupId}
  |           +-- eval:gtm:{startupId}
  |           +-- eval:financials:{startupId}
  |           +-- eval:competitiveAdvantage:{startupId}
  |           +-- eval:legal:{startupId}
  |           +-- eval:dealTerms:{startupId}
  |           +-- eval:exitPotential:{startupId}
  |                 |
  |                 +-- synthesis:{startupId}        (Stage 4)
  |                       |
  |                       +-- post:scoring:{startupId}      (Stage 5 - parallel)
  |                       +-- post:matching:{startupId}
  |                       +-- post:pdf:{startupId}
  |                       +-- post:notify:{startupId}
```

#### Queue Configuration

```
Queue: "analysis"
  Concurrency: 10 (up from 3)
  Default attempts: 3
  Backoff: exponential, 2s base

Job-specific overrides:
  extraction:     { attempts: 2, timeout: 120_000 }   # 2 min max
  research:*:     { attempts: 3, timeout: 300_000 }   # 5 min max
  eval:*:         { attempts: 3, timeout: 120_000 }   # 2 min max per agent
  synthesis:      { attempts: 2, timeout: 180_000 }   # 3 min max
  post:scoring:   { attempts: 2, timeout: 30_000 }    # 30s max (no LLM)
  post:matching:  { attempts: 3, timeout: 300_000 }   # 5 min (multiple LLM calls)
  post:pdf:       { attempts: 2, timeout: 60_000 }    # 1 min max
  post:notify:    { attempts: 3, timeout: 10_000 }    # 10s max
```

#### Retry Policies

| Job Type | Max Attempts | Backoff | Dead Letter After |
|----------|-------------|---------|-------------------|
| `extraction` | 2 | 5s fixed | 2 failures |
| `research:*` | 3 | exponential 2s | 3 failures |
| `eval:*` | 3 | exponential 2s | 3 failures |
| `synthesis` | 2 | 5s fixed | 2 failures |
| `post:*` | 3 | exponential 1s | 3 failures |

#### Dead Letter Queue

Failed jobs (after all retries exhausted) move to `analysis:dead-letter` queue with:
- Original job data
- All error messages from each attempt
- Timestamp of final failure
- Admin UI visibility via Bull Board

#### Concurrency Configuration

```
Global concurrency: 10 analyses simultaneously (up from 3)

Per-stage concurrency:
  extraction processor:    5 concurrent
  research processor:     20 concurrent (4 parallel research jobs * 5 analyses)
  evaluation processor:   55 concurrent (11 parallel eval jobs * 5 analyses)
  synthesis processor:     5 concurrent
  post-processing:        20 concurrent
```

### 3.3 New Pipeline Design (Target: <10 minutes)

#### Phase 1: Data Extraction (1-2 min) -- BullMQ Job: `extraction`

**PDF Extraction:**
- Upload pitch deck PDF to temporary storage
- If text-extractable: use `pdf-parse` (fast path, ~10s)
- If image-based: send entire PDF to **Mistral OCR** (native PDF support, no page splitting needed)
  - Mistral OCR processes 1000 pages/min at $2 per 1000 pages
  - Returns structured text from the entire document in one call
- Expected time: 10-30s (down from 5-15 min)

**Field Extraction:**
- Pass extracted text to **GPT-4o-mini** via `generateObject()`
- Zod schema enforces output shape:
  - `companyName: z.string()`
  - `website: z.string().url().optional()`
  - `stage: z.enum([...stages])`
  - `sector: z.string()`
  - `location: z.string().optional()`
  - `roundSize: z.number().optional()`
  - `founderLinkedInUrls: z.array(z.string().url())`
  - `description: z.string()`
- Expected time: 5-15s

#### Phase 2: Research & Enrichment (3-5 min) -- 4 Parallel BullMQ Jobs

All 4 jobs launch in parallel immediately after extraction completes:

**Job 2A: Website Scraping** (`research:website`)
- Firecrawl API (or improved Cheerio) scrapes company website
- Priority pages: `/`, `/about`, `/team`, `/pricing`, `/product`, `/blog`
- Up to 15 pages, max 3 concurrent requests
- Extract: mainContent, headings, metadata, links
- Cache results for 24 hours
- Expected time: 30-90s

**Job 2B: LinkedIn Enrichment** (`research:linkedin`)
- For each founder LinkedIn URL from extraction:
  - Check Unipile cache (7-day TTL)
  - If miss: fetch via Unipile API
  - Extract: headline, experience[], education[], skills[], connections
- For founders with no URL:
  - Search by name + company via Unipile search
  - Verify match confidence > 0.8 before using
- Expected time: 30-90s (cached hits are instant)

**Job 2C: Market & Competitor Research** (`research:market`)
- **Gemini 3 Flash with Google Search Grounding** (NOT GPT-5.2 background mode)
- Single real-time call with grounding enabled
- Prompt includes: sector, claimed TAM, competitors, geographic focus
- Returns in one response: TAM validation, CAGR, trends, competitor profiles, funding data
- Built-in source citations from Google Search
- Expected time: 30-60s (down from 15-30 min)

**Job 2D: News Search** (`research:news`)
- **Gemini 3 Flash with Google Search Grounding**
- Search for: company mentions, funding news, product launches, partnerships
- Returns: news items with dates, sources, sentiment classification
- Expected time: 15-30s (down from 10-30 min)

#### Phase 3: AI Evaluation (2-3 min) -- 11 Parallel BullMQ Jobs

Each of the 11 evaluation agents runs as its own BullMQ job (`eval:{agentId}`), all launched in parallel after all research jobs complete.

**For each agent:**
1. Build agent-specific context (see Section 3.4)
2. Call **GPT-4o** via `generateObject()` with agent-specific Zod schema
3. On validation failure: retry up to 2 times with the same model
4. On persistent failure: fallback to `generateText()` + manual JSON parse
5. Store result in `evaluation_sections` table

**All 11 agents produce a common base shape:**
```
{
  overallScore: number (0-100),
  narrativeSummary: string (250-350 words),
  keyStrengths: string[],
  keyRisks: string[],
  ...agentSpecificFields
}
```

Expected time per agent: 15-30s. All 11 in parallel: **30-60s total** (limited by slowest agent, down from 5-15 min).

#### Phase 4: Synthesis (1 min) -- BullMQ Job: `synthesis`

- Receives all 11 agent outputs (already structured via Zod)
- Calls **GPT-5.2** via `generateObject()` with synthesis Zod schema
- Produces:
  - `executiveSummary`: 400-500 word VC memo
  - `sectionScores`: all 11 scores
  - `keyStrengths`: top 5 across all sections
  - `keyRisks`: top 5 across all sections
  - `investorMemo`: formatted for investor view
  - `founderReport`: formatted for founder view
  - `recommendations`: actionable next steps
- Expected time: 30-60s

#### Phase 5: Post-Processing (30s) -- 4 Parallel BullMQ Jobs

**Job 5A: Score Computation** (`post:scoring`)
- No LLM call -- pure math
- `computeWeightedScore(sectionScores, stageWeights)`
- 11 categories, weights from `stage_scoring_weights` table
- Investor custom weight overrides
- Expected time: <1s

**Job 5B: Investor Matching** (`post:matching`)
- For each investor with a thesis:
  1. `checkFirstLevelFilters()` -- hard rules (sector, stage, geo, check size)
  2. If passes: `thesisAlignment()` via **GPT-4o** `generateObject()`
  3. Store match with fitScore, rationale
- Location normalization via **GPT-4o-mini** (run once per startup, cached)
- Investors processed in parallel batches of 5
- Expected time: 5-30s (depends on investor count)

**Job 5C: PDF Generation** (`post:pdf`)
- Generate investor memo PDF using PDFKit
- Upload to object storage
- Expected time: 5-15s

**Job 5D: Notifications** (`post:notify`)
- WebSocket push via Socket.io: `notification:new`, `job:status`
- Email notifications to admins (if configured)
- Expected time: <1s

### 3.4 Context Engineering Strategy

The key principle: **each agent receives ONLY the data it needs to score its specific dimension.** No more passing the entire research blob to every agent.

#### Per-Agent Context Allocation

| Agent | NEEDS (include) | DOES NOT NEED (exclude) | Est. Input Tokens |
|-------|----------------|------------------------|-------------------|
| **team** | teamMembers[], linkedinData[], founderBios, deckContent (team section), teamDeepResearch results | Market TAM, competitor profiles, news, financials, pricing | ~3,000 |
| **market** | sector, marketResearch (TAM/SAM/SOM, CAGR, trends), deckContent (market section), newsResearch (industry trends only) | Team LinkedIn, competitor product features, deal terms, legal data | ~4,000 |
| **product** | productDescription, websiteContent (product pages), productResearch (competitors, features, reviews), techStack | Team bios, market TAM numbers, financial projections, legal compliance | ~4,000 |
| **traction** | revenue figures from deck, growth metrics, customer count, websiteContent (case studies/testimonials), newsResearch (growth mentions) | Team LinkedIn, competitor funding, legal data, deal structure | ~2,500 |
| **businessModel** | pricing from website, revenue model from deck, unitEconomics if mentioned, sector benchmarks | Team deep research, competitor product features, legal compliance, exit scenarios | ~2,500 |
| **gtm** | websiteContent (marketing pages), deckContent (GTM section), sector, targetCustomers, productResearch (market dynamics) | Team LinkedIn, financial projections, legal data, deal terms | ~3,000 |
| **financials** | deckContent (financials section), roundSize, valuation, fundingHistory, revenue, burnRate | Team deep research, competitor features, news sentiment, legal compliance | ~2,000 |
| **competitiveAdvantage** | productResearch (competitors[], market dynamics), websiteContent (differentiators), deckContent (competitive section) | Team bios, financial projections, news items, deal terms | ~3,500 |
| **legal** | sector (for regulatory context), deckContent (legal/compliance mentions), websiteContent (privacy/terms pages), location (jurisdiction) | Team LinkedIn, market TAM, competitor profiles, financial data | ~2,000 |
| **dealTerms** | roundSize, valuation, fundingHistory, stage, sector benchmarks, deckContent (terms section) | Team deep research, competitor features, news items, website content | ~1,500 |
| **exitPotential** | sector, stage, productResearch (competitors with exits), marketResearch (market size for exit multiples), newsResearch (M&A activity) | Team LinkedIn details, pricing data, legal compliance details | ~2,500 |
| **synthesis** | All 11 agent outputs (scores + narratives + strengths + risks), companyName, stage, sector | Raw research data (already distilled by evaluation agents) | ~8,000 |

**Total estimated input tokens per analysis: ~38,500** (down from ~80,000+ when every agent gets everything)

#### Context Building Pattern

Each agent has a `buildContext()` function that selects and formats only the relevant data:

```
interface AgentContext {
  companyName: string;
  stage: string;
  sector: string;
  agentSpecificData: Record<string, unknown>;
  adminGuidance?: string;  // Optional per-section admin comments
}

// Example: TeamAgent gets ONLY team-relevant data
TeamAgent.buildContext(research) => {
  companyName, stage, sector,
  agentSpecificData: {
    teamMembers: research.teamMembers,
    linkedinProfiles: research.linkedinData,
    teamDeepResearch: research.teamResearch,
    deckTeamSection: extractSection(research.deckContent, 'team'),
    websiteTeamPage: research.websiteContent.find(p => p.url.includes('/team')),
  }
}
```

### 3.5 Structured Output Schemas

#### Schema Design Philosophy

Every agent output is defined as a Zod schema. AI SDK's `generateObject()` enforces the schema at the API level (for models that support it) and validates the response. This replaces the old `JsonOutputParser` which had zero validation.

#### Common Base Schema

All 11 evaluation agents share this base:

```
EvaluationBaseSchema = z.object({
  overallScore: z.number().min(0).max(100)
    .describe("Overall score for this dimension, 0-100"),
  narrativeSummary: z.string().min(200).max(2000)
    .describe("3-4 paragraph VC memo-style narrative, 250-350 words"),
  keyStrengths: z.array(z.string()).min(1).max(5)
    .describe("Top strengths identified in this dimension"),
  keyRisks: z.array(z.string()).min(1).max(5)
    .describe("Top risks identified in this dimension"),
})
```

#### Agent-Specific Schema Extensions (Summary)

**TeamAgentSchema** extends base with:
- `founderMarketFitScore: z.number().min(0).max(100)`
- `trackRecordScore: z.number().min(0).max(100)`
- `compositionScore: z.number().min(0).max(100)`
- `executionScore: z.number().min(0).max(100)`
- `founderProfiles: z.array(FounderProfileSchema)`
- `teamGaps: z.array(z.string())`
- `redFlags: z.array(z.string())`

**MarketAgentSchema** extends base with:
- `tamAnalysis: TamAnalysisSchema` (value, year, source, confidence, claimAccuracy)
- `samAnalysis: z.object({...}).optional()`
- `growthRate: z.object({ cagr, period, source })`
- `marketTrends: z.array(TrendSchema)`
- `competitiveLandscape: z.string()`
- `timingAssessment: z.string()`

**ProductAgentSchema** extends base with:
- `trlLevel: z.number().min(1).max(9)`
- `differentiators: z.array(z.string())`
- `moatAnalysis: MoatSchema` (type, strength, sustainability)
- `featureComparison: z.array(FeatureComparisonSchema)`
- `techStackAssessment: z.string().optional()`

**TractionAgentSchema** extends base with:
- `revenueStage: z.enum(["pre-revenue", "early-revenue", "growth", "scaling"])`
- `growthMetrics: z.array(MetricSchema)`
- `momentumAssessment: z.string()`
- `credibilityScore: z.number().min(0).max(100)`

**BusinessModelAgentSchema** extends base with:
- `unitEconomics: UnitEconomicsSchema` (estimatedCAC, estimatedLTV, ltvCacRatio, paybackPeriod)
- `revenueModel: RevenueModelSchema` (type, recurringRevenue, assessment)
- `margins: MarginsSchema` (estimatedGrossMargin, industryBenchmark, assessment)
- `pricing: PricingSchema` (strategy, competitorComparison, assessment)

**GTMAgentSchema** extends base with:
- `channelStrategy: z.array(ChannelSchema)`
- `salesMotion: z.enum(["self-serve", "inside-sales", "field-sales", "hybrid", "plg"])`
- `viralityAssessment: z.string()`
- `contentStrategy: z.string().optional()`

**FinancialsAgentSchema** extends base with:
- `capitalEfficiency: z.string()`
- `burnRate: z.string().optional()`
- `runway: z.string().optional()`
- `valuationAssessment: ValuationSchema` (methodology, comparables, reasonableness)

**CompetitiveAdvantageAgentSchema** extends base with:
- `keyCompetitors: z.array(z.string()).min(1).max(5)`
- `primaryDifferentiator: z.string()`
- `biggestThreat: z.string()`
- `moatDetails: MoatDetailsSchema` (networkEffects, switchingCosts, dataMoat, brand, ipProtection)
- `positioning: z.enum(["blue-ocean", "red-ocean", "niche"])`

**LegalAgentSchema** extends base with:
- `complianceChecklist: z.array(ComplianceItemSchema)`
- `ipAssessment: IpSchema` (ownership, strength, risks)
- `regulatoryRisks: z.array(RegulatoryRiskSchema)`
- `jurisdiction: z.string()`

**DealTermsAgentSchema** extends base with:
- `valuationAssessment: z.object({ premiumOrDiscount, justification, comparableRange })`
- `dealStructure: z.string()`
- `dilutionAnalysis: z.string()`
- `redFlags: z.array(z.string())`

**ExitPotentialAgentSchema** extends base with:
- `exitScenarios: z.array(ExitScenarioSchema)` (type, probability, timeframe, estimatedMultiple)
- `potentialAcquirers: z.array(z.string())`
- `ipoFeasibility: z.enum(["likely", "possible", "unlikely", "too-early"])`
- `strategicValue: z.string()`

**SynthesisSchema:**
- `executiveSummary: z.string().min(300).max(3000)`
- `sectionScores: z.record(z.number().min(0).max(100))` (all 11 categories)
- `keyStrengths: z.array(z.string()).min(3).max(7)`
- `keyRisks: z.array(z.string()).min(3).max(7)`
- `investorMemo: InvestorMemoSchema`
- `founderReport: FounderReportSchema`
- `recommendations: z.array(z.string()).min(1).max(5)`
- `overallAssessment: z.enum(["strong-pass", "pass", "borderline", "fail", "strong-fail"])`

#### Validation & Retry Strategy

```
1. Call generateObject() with Zod schema
   |
   +-- Success: return validated result
   |
   +-- Validation Error:
       |
       +-- Retry 1: same model, append "Fix these validation errors: {errors}"
       |
       +-- Retry 2: same model, more explicit schema instructions
       |
       +-- Fallback: generateText() + manual JSON.parse() + zod.safeParse()
           |
           +-- If parse succeeds: return (log warning)
           |
           +-- If parse fails: return default/empty result (log error, mark job as degraded)
```

### 3.6 Model Selection Strategy

| Task Type | Model | Rationale |
|-----------|-------|-----------|
| **Research/Grounding** | Gemini 3 Flash + Google Search | Real-time grounded responses, citations, no polling |
| **PDF OCR** | Mistral OCR | 1000 pages/min, $2/1000 pages, native PDF support |
| **Field Extraction** | GPT-4o-mini | Simple structured extraction, fast, cheap |
| **Evaluation (11 agents)** | GPT-4o | Fast structured output, great for parallel execution |
| **Synthesis** | GPT-5.2 | Best reasoning for complex multi-input analysis |
| **Thesis Alignment** | GPT-4o | Good structured output for fit scoring |
| **Location Normalization** | GPT-4o-mini | Trivial task, cheapest model sufficient |
| **Communication (Clara)** | GPT-4o | Conversational quality for investor comms |

**Estimated cost per full analysis: ~$2-5** (vs current ~$8-15 with GPT-5.2 for everything)

---

## 4. Module Structure (NestJS)

### 4.1 Directory Structure

```
src/modules/ai/
+-- ai.module.ts                          # NestJS module registration
+-- ai.config.ts                          # Model names, API keys, timeouts, token budgets
|
+-- providers/
|   +-- openai.provider.ts               # AI SDK OpenAI client (GPT-4o, GPT-4o-mini, GPT-5.2)
|   +-- gemini.provider.ts               # AI SDK Google client (Gemini 3 Flash)
|   +-- mistral.provider.ts              # Mistral OCR client
|   +-- ai.provider.ts                   # Factory: getModel(task) => appropriate client
|   +-- index.ts
|
+-- schemas/
|   +-- base.schema.ts                    # EvaluationBaseSchema (shared by all 11 agents)
|   +-- team.schema.ts                    # TeamAgentSchema = base.extend({...})
|   +-- market.schema.ts                  # MarketAgentSchema
|   +-- product.schema.ts                 # ProductAgentSchema
|   +-- traction.schema.ts               # TractionAgentSchema
|   +-- business-model.schema.ts          # BusinessModelAgentSchema
|   +-- gtm.schema.ts                     # GTMAgentSchema
|   +-- financials.schema.ts              # FinancialsAgentSchema
|   +-- competitive-advantage.schema.ts   # CompetitiveAdvantageAgentSchema
|   +-- legal.schema.ts                   # LegalAgentSchema
|   +-- deal-terms.schema.ts              # DealTermsAgentSchema
|   +-- exit-potential.schema.ts          # ExitPotentialAgentSchema
|   +-- synthesis.schema.ts               # SynthesisSchema
|   +-- extraction.schema.ts              # FieldExtractionSchema, PdfPageSchema
|   +-- research.schema.ts               # MarketResearchSchema, NewsResearchSchema
|   +-- matching.schema.ts               # ThesisAlignmentSchema, LocationSchema
|   +-- index.ts
|
+-- prompts/
|   +-- team.prompt.ts                    # System + human prompt templates
|   +-- market.prompt.ts
|   +-- product.prompt.ts
|   +-- traction.prompt.ts
|   +-- business-model.prompt.ts
|   +-- gtm.prompt.ts
|   +-- financials.prompt.ts
|   +-- competitive-advantage.prompt.ts
|   +-- legal.prompt.ts
|   +-- deal-terms.prompt.ts
|   +-- exit-potential.prompt.ts
|   +-- synthesis.prompt.ts
|   +-- extraction.prompt.ts
|   +-- research.prompt.ts
|   +-- matching.prompt.ts
|   +-- index.ts
|
+-- agents/
|   +-- base.agent.ts                     # Abstract base: buildContext(), run(), validate()
|   +-- team.agent.ts                     # Extends BaseAgent, uses TeamAgentSchema
|   +-- market.agent.ts
|   +-- product.agent.ts
|   +-- traction.agent.ts
|   +-- business-model.agent.ts
|   +-- gtm.agent.ts
|   +-- financials.agent.ts
|   +-- competitive-advantage.agent.ts
|   +-- legal.agent.ts
|   +-- deal-terms.agent.ts
|   +-- exit-potential.agent.ts
|   +-- synthesis.agent.ts
|   +-- index.ts
|
+-- research/
|   +-- research.service.ts               # Gemini grounding research orchestration
|   +-- website-scraper.service.ts        # Firecrawl or Cheerio web scraper
|   +-- linkedin.service.ts              # Unipile API wrapper with cache
|   +-- pdf-extractor.service.ts         # pdf-parse + Mistral OCR fallback
|   +-- news.service.ts                  # Gemini grounding news search
|   +-- index.ts
|
+-- scoring/
|   +-- scoring.service.ts               # computeWeightedScore(), stage weights
|   +-- matching.service.ts              # First-level filters + thesis alignment
|   +-- index.ts
|
+-- processors/
|   +-- extraction.processor.ts          # BullMQ processor for Stage 1
|   +-- research.processor.ts            # BullMQ processor for Stage 2 (all 4 jobs)
|   +-- evaluation.processor.ts          # BullMQ processor for Stage 3 (all 11 jobs)
|   +-- synthesis.processor.ts           # BullMQ processor for Stage 4
|   +-- post-processing.processor.ts     # BullMQ processor for Stage 5
|   +-- index.ts
|
+-- orchestrator/
|   +-- analysis.orchestrator.ts         # BullMQ FlowProducer: creates job dependency tree
|   +-- progress.service.ts              # Real-time progress tracking (DB + WebSocket)
|   +-- token-tracker.service.ts         # Per-agent token usage tracking
|   +-- index.ts
|
+-- interfaces/
|   +-- research.interface.ts            # ComprehensiveResearchResult, ExtractedData, etc.
|   +-- evaluation.interface.ts          # AgentContext, EvaluationResult (inferred from Zod)
|   +-- job.interface.ts                 # Job data types for all BullMQ jobs
|   +-- index.ts
```

### 4.2 Key Services

#### `ai.provider.ts` -- Model Factory

Centralizes model selection. All agents call `getModel(taskType)` instead of hardcoding model names. If we need to swap models (e.g., test Gemini for evaluation), we change one file.

Responsibilities:
- Create and cache AI SDK model instances (OpenAI, Google, Mistral)
- Map task types to model configurations (temperature, maxTokens, etc.)
- Centralized API key management
- Token budget enforcement per model

#### `base.agent.ts` -- Abstract Base Agent

Shared logic for all 11 evaluation agents:
- `buildContext(research: ComprehensiveResearchResult)` -- abstract, each agent implements its own
- `run(context: AgentContext)` -- calls `generateObject()` with the agent's schema
- `validate(result: unknown)` -- Zod validation with retry logic
- `trackTokens(usage: TokenUsage)` -- logs token consumption
- Error handling with graceful degradation

#### `analysis.orchestrator.ts` -- BullMQ Flow Producer

The nerve center. Creates the entire job dependency tree when a new analysis is triggered.

Responsibilities:
- Build BullMQ `FlowJob` tree with proper dependencies
- Handle re-analysis from specific stages (reuse cached data from prior stages)
- Handle section-level re-analysis (single agent re-run with admin guidance)
- Expose analysis status to progress.service.ts

#### `progress.service.ts` -- Real-time Progress

Replaces the old `analysis-progress.ts`. Tracks:
- Current stage (1-5) with labels
- Per-job status (pending, running, completed, failed)
- Deep research agent status (4 agents)
- Evaluation agent status (11 agents)
- WebSocket push on every state change
- DB persistence for polling fallback

#### `research.service.ts` -- Gemini Grounding Orchestration

Replaces `research-orchestrator.ts`. Orchestrates the 4 parallel research jobs:
- Website scraping via `website-scraper.service.ts`
- LinkedIn enrichment via `linkedin.service.ts`
- Market/competitor research via Gemini grounding
- News search via Gemini grounding

No polling. No background mode. All calls return in real-time.

#### `scoring.service.ts` -- Score Computation

Migrates `score-computation.ts` with the same algorithm:
- `computeWeightedScore(sectionScores, weights)` = `sum(score * weight) / sum(weights)`
- 11 categories (team, market, product, traction, businessModel, gtm, financials, competitiveAdvantage, legal, dealTerms, exitPotential)
- Weights from `stage_scoring_weights` table (DB is single source of truth)
- Investor custom weight overrides via `investor_scoring_preferences` table
- `normalizeWeights()` and `validateWeights()` utilities preserved

#### `matching.service.ts` -- Investor Matching

Migrates `investor-agents.ts`:
- `checkFirstLevelFilters()` -- same logic: sector, stage, geography (using normalized region), check size
- `normalizeLocationToRegion()` -- now uses **GPT-4o-mini** instead of GPT-5.2 (same 6 region codes: us, europe, asia, latam, mena, global)
- `runThesisAlignment()` -- now uses **GPT-4o** with Zod schema for fitScore (1-100) + rationale
- Parallel investor processing in batches of 5

#### `token-tracker.service.ts` -- Token Usage Tracking

New service that did not exist in the old system:
- Captures `promptTokens` and `completionTokens` from AI SDK response metadata
- Aggregates per-analysis, per-agent, per-model
- Stores in `analysis_token_usage` table
- Enables cost tracking and budget alerts

---

## 5. Gemini 3 Flash Grounding (Replacing GPT-5.2 Background Research)

### 5.1 Why Gemini 3 Flash Grounding

The single biggest performance win in this migration. The old system's research phase accounts for **65-75% of total pipeline time** due to GPT-5.2 background mode polling.

| Capability | GPT-5.2 Background | Gemini 3 Flash Grounding |
|-----------|-------------------|------------------------|
| **Response Time** | 5-30 min (polling) | 10-60 seconds (real-time) |
| **Web Search** | `tools: [{ type: "web_search" }]` | Google Search grounding (built-in) |
| **Citations** | Extracted from response text | Structured `groundingMetadata.groundingChunks[]` |
| **Cost** | ~$5-8 per research call | ~$0.10-0.50 per research call |
| **Reliability** | Polling can timeout, incomplete responses | Synchronous response, standard HTTP timeout |
| **Concurrency** | Blocked by polling loops | Standard async/await |
| **Source Quality** | Web search tool (generic) | Google Search index (high quality, recent) |

### 5.2 Research Agent Migration

#### Team Deep Research

| Aspect | Old | New |
|--------|-----|-----|
| **Model** | GPT-5.2 background mode | Gemini 3 Flash with grounding |
| **Mechanism** | `background: true`, poll every 15s, 30 min max | Single `generateText()` call with Google Search tool |
| **Input** | Team member names, roles, company context (large prompt) | Same data, optimized prompt |
| **Output** | Raw JSON from response text, regex-parsed | `generateText()` + Zod-parsed `TeamResearchSchema` |
| **Time** | 5-30 minutes | 15-45 seconds |
| **Citations** | None (unverifiable) | Google Search grounding chunks with URLs |

#### Market Deep Research

| Aspect | Old | New |
|--------|-----|-----|
| **Model** | GPT-5.2 background mode | Gemini 3 Flash with grounding |
| **Mechanism** | `background: true`, poll every 15s | Single `generateText()` call with Google Search tool |
| **Input** | Sector, market, claimed TAM/CAGR, competitors | Same data |
| **Output** | `MarketResearch` type, regex-parsed JSON | `generateText()` + Zod-parsed `MarketResearchSchema` with citations |
| **Time** | 5-30 minutes | 20-45 seconds |
| **Key Improvement** | TAM validation was based on GPT's training data | TAM validation uses live Google Search data |

#### Product/Competitor Deep Research

| Aspect | Old | New |
|--------|-----|-----|
| **Model** | GPT-5.2 background mode | Gemini 3 Flash with grounding |
| **Input** | Product description, known competitors, target customers | Same data |
| **Output** | `ProductResearch` with `CompetitorProfile[]` | `generateText()` + Zod-parsed schema with funding data, features |
| **Time** | 5-30 minutes | 20-60 seconds |
| **Key Improvement** | Competitor funding data was stale (training cutoff) | Live funding data from Google Search |

#### News Search

| Aspect | Old | New |
|--------|-----|-----|
| **Model** | GPT-5.2 background mode | Gemini 3 Flash with grounding |
| **Input** | Company name, sector, geographic focus | Same data |
| **Output** | `NewsResearch` with sentiment | `generateText()` + Zod-parsed `NewsResearchSchema` |
| **Time** | 5-30 minutes | 10-30 seconds |
| **Key Improvement** | News data limited to training cutoff | Real-time news from Google Search index |

### 5.3 Implementation Pattern

The AI SDK v6 pattern for Gemini grounding uses the tool-based approach (NOT `useSearchGrounding`):

```typescript
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

const { text, sources, providerMetadata } = await generateText({
  model: google('gemini-3.0-flash'),
  tools: {
    google_search: google.tools.googleSearch({}),
  },
  system: 'You are a market research analyst...',
  prompt: `Research the following company and market: ${companyContext}`,
});

// Access grounding metadata
const metadata = providerMetadata?.google;
const groundingMetadata = metadata?.groundingMetadata;

// Sources are available directly
// sources[] contains URLs and titles from Google Search
```

**Key implementation details:**

1. **Use `generateText()` for research** -- grounding tools work best with text generation, not `generateObject()` directly. The model needs freedom to search and synthesize before structuring.

2. **Parse structured output from text with Zod** -- after getting grounded text, parse the response into the expected schema:
   ```
   1. Call generateText() with google.tools.googleSearch({})
   2. Get text + sources + groundingMetadata
   3. Parse the text response with Zod schema using manual parsing
   4. Store validated result
   ```

3. **Tool-based approach** -- use `google.tools.googleSearch({})` as a tool, NOT the old `useSearchGrounding: true` option.

4. **Citation extraction** -- sources are available directly in the `sources` field, and detailed grounding info in `providerMetadata?.google?.groundingMetadata`.

Key differences from the old GPT-5.2 pattern:
- **No `background: true`** -- the call is synchronous
- **No polling loop** -- response arrives in the same HTTP request
- **No `responses.retrieve()`** -- no separate status check API
- **No regex JSON parsing** -- Zod handles validation after text extraction
- **Built-in citations** -- structured metadata from `sources` and `groundingMetadata`

---

## 6. Migration Checklist

### Phase 1: Foundation (Week 1)

- [ ] Install AI SDK v6 packages: `@ai-sdk/openai`, `@ai-sdk/google`, `ai`, `mistralai` (or `@ai-sdk/mistral`)
- [ ] Create `src/modules/ai/` directory structure
- [ ] Implement `ai.config.ts` with model names, API key env vars, token budgets
- [ ] Implement `openai.provider.ts` -- AI SDK OpenAI client (GPT-4o, GPT-4o-mini, GPT-5.2)
- [ ] Implement `gemini.provider.ts` -- AI SDK Google client
- [ ] Implement `mistral.provider.ts` -- Mistral OCR client
- [ ] Implement `ai.provider.ts` -- model factory with task type mapping (OpenAI/Gemini/Mistral)
- [ ] Create `base.schema.ts` -- `EvaluationBaseSchema` (shared by all 11 agents)
- [ ] Create all 11 evaluation agent Zod schemas (team, market, product, etc.)
- [ ] Create `synthesis.schema.ts`, `extraction.schema.ts`, `research.schema.ts`
- [ ] Create `matching.schema.ts` (thesis alignment + location normalization)
- [ ] Implement `base.agent.ts` -- abstract base with `run()`, `validate()`, `trackTokens()`
- [ ] Set up BullMQ queue with Redis connection (extend existing `src/queue/` infrastructure)
- [ ] Define job types and interfaces in `job.interface.ts`
- [ ] Implement `token-tracker.service.ts` with DB schema for `analysis_token_usage`

### Phase 2: Research Pipeline (Week 1-2)

- [ ] Implement `pdf-extractor.service.ts`:
  - [ ] `pdf-parse` for text extraction (fast path)
  - [ ] Mistral OCR for image-based PDFs (native PDF support, entire document in one call)
  - [ ] Field extraction with GPT-4o-mini + `FieldExtractionSchema`
- [ ] Implement `website-scraper.service.ts`:
  - [ ] Firecrawl API integration (or improved Cheerio)
  - [ ] Priority page selection (/about, /team, /pricing, /product)
  - [ ] Content extraction and caching (24-hour TTL)
- [ ] Implement `linkedin.service.ts`:
  - [ ] Unipile API wrapper (migrate from `old-backend/unipile.ts`)
  - [ ] 7-day cache preservation
  - [ ] Search-by-name fallback with confidence threshold
- [ ] Implement `research.service.ts`:
  - [ ] Gemini 3 Flash with `google.tools.googleSearch({})` for market research
  - [ ] Gemini 3 Flash with `google.tools.googleSearch({})` for news search
  - [ ] Citation extraction from `sources` and `groundingMetadata`
  - [ ] Zod validation on all research outputs (parse from `generateText()` response)
- [ ] Implement `extraction.processor.ts` (BullMQ Stage 1)
- [ ] Implement `research.processor.ts` (BullMQ Stage 2 -- launches 4 parallel jobs)
- [ ] Test research pipeline end-to-end with 3 sample startups
- [ ] Benchmark research time (target: <5 min total)

### Phase 3: Evaluation Agents (Week 2-3)

- [ ] Migrate all 21 prompt templates from `sync-prompts-inline.ts` to `prompts/*.prompt.ts`
- [ ] Implement all 11 evaluation agents extending `base.agent.ts`:
  - [ ] `team.agent.ts` with `TeamAgentSchema`
  - [ ] `market.agent.ts` with `MarketAgentSchema`
  - [ ] `product.agent.ts` with `ProductAgentSchema`
  - [ ] `traction.agent.ts` with `TractionAgentSchema`
  - [ ] `business-model.agent.ts` with `BusinessModelAgentSchema`
  - [ ] `gtm.agent.ts` with `GTMAgentSchema`
  - [ ] `financials.agent.ts` with `FinancialsAgentSchema`
  - [ ] `competitive-advantage.agent.ts` with `CompetitiveAdvantageAgentSchema`
  - [ ] `legal.agent.ts` with `LegalAgentSchema`
  - [ ] `deal-terms.agent.ts` with `DealTermsAgentSchema`
  - [ ] `exit-potential.agent.ts` with `ExitPotentialAgentSchema`
- [ ] Implement per-agent `buildContext()` methods (context engineering)
- [ ] Implement `evaluation.processor.ts` (BullMQ Stage 3 -- launches 11 parallel jobs)
- [ ] Test each agent individually with sample research data
- [ ] Validate structured output compliance (run 10 samples per agent, check Zod pass rate)
- [ ] Benchmark evaluation time (target: <3 min total for all 11)

### Phase 4: Synthesis & Post-Processing (Week 3)

- [ ] Implement `synthesis.agent.ts` with `SynthesisSchema` and GPT-5.2
- [ ] Implement `synthesis.processor.ts` (BullMQ Stage 4)
- [ ] Migrate `scoring.service.ts`:
  - [ ] Port `computeWeightedScore()` from `old-backend/score-computation.ts`
  - [ ] Port `getWeightsForStage()` with DB lookup
  - [ ] Port `computeStartupScoreWithInvestorPreferences()`
  - [ ] Port `normalizeWeights()` and `validateWeights()`
- [ ] Migrate `matching.service.ts`:
  - [ ] Port `checkFirstLevelFilters()` from `old-backend/investor-agents.ts`
  - [ ] Port `normalizeLocationToRegion()` (switch to GPT-4o-mini)
  - [ ] Port `runThesisAlignmentAgent()` (switch to GPT-4o + Zod)
  - [ ] Port `runThesisAlignmentForApprovedStartup()` with parallel batch processing
- [ ] Migrate PDF generation (port from `old-backend/pdf-generator.ts`)
- [ ] Implement `post-processing.processor.ts` (BullMQ Stage 5 -- 4 parallel jobs)

### Phase 5: Orchestration & Integration (Week 3-4)

- [ ] Implement `analysis.orchestrator.ts`:
  - [ ] BullMQ FlowProducer job tree creation
  - [ ] Re-analysis from specific stage support
  - [ ] Section-level re-analysis with admin comments
- [ ] Implement `progress.service.ts`:
  - [ ] DB-backed progress tracking (replaces `analysis-progress.ts`)
  - [ ] WebSocket push via existing `NotificationGateway`
  - [ ] Frontend-compatible progress format (same shape as old system)
- [ ] Wire up `ai.module.ts`:
  - [ ] Register all providers, services, processors
  - [ ] Configure BullMQ queues and processors
  - [ ] Export public API surface
- [ ] Update `startup.service.ts` to use new `AnalysisOrchestrator`
- [ ] Update admin controller for re-analysis endpoints
- [ ] End-to-end pipeline testing with 10 sample startups
- [ ] Performance benchmarking (target: <10 min end-to-end)
- [ ] Compare output quality: old pipeline vs new pipeline for same startups
- [ ] Frontend progress tracking integration testing
- [ ] Error handling and retry testing (simulate failures at each stage)
- [ ] Load testing: 5 concurrent analyses

---

## 7. Risk Mitigation

### Risk 1: Gemini Grounding Quality Lower Than GPT-5.2

**Probability:** Medium
**Impact:** High (degraded research quality affects all downstream agents)

**Mitigation:**
- Run parallel comparison: same 20 startups through both old (GPT-5.2) and new (Gemini) research pipelines
- Compare output quality on 5 dimensions: data completeness, factual accuracy, citation quality, recency, TAM validation accuracy
- If Gemini quality is insufficient for a specific research type (e.g., team deep research), keep GPT-5.2 for that agent only (but use the standard API, not background mode)
- Gemini grounding can be supplemented with a second pass through GPT-4o for analysis/synthesis of raw grounding results

### Risk 2: GPT-4o Structured Output Validation Failures

**Probability:** Low (GPT-4o has strong structured output compliance)
**Impact:** Medium (individual agent failure, not pipeline failure)

**Mitigation:**
- AI SDK `generateObject()` has built-in retry on validation failure
- Additional application-level retry (2 attempts max) with error context appended to prompt
- Fallback chain: `generateObject()` -> retry with error context -> `generateText()` + manual parse -> default/empty result
- Monitor Zod validation pass rate per agent; if any agent drops below 95%, investigate prompt or schema issues
- Schema designs use `.optional()` for non-critical fields to maximize pass rate

### Risk 3: Partial Pipeline Failures

**Probability:** Medium (more moving parts = more failure points)
**Impact:** Medium (analysis may be incomplete but not lost)

**Mitigation:**
- BullMQ job persistence: jobs survive process restarts
- Per-stage retry policies (see Section 3.2)
- Dead letter queue for jobs that exhaust retries
- Graceful degradation: if a research job fails, evaluation agents proceed with available data
- If an evaluation agent fails (after retries), synthesis proceeds with 10/11 agents and flags the missing section
- Admin UI shows per-job status for debugging
- Alert on dead letter queue growth

### Risk 4: Cost Overruns

**Probability:** Low
**Impact:** Medium

**Mitigation:**
- Token tracking service provides real-time cost visibility
- Per-analysis cost budget: alert if any single analysis exceeds $10
- Per-agent token budgets enforced in `ai.config.ts`
- GPT-5.2 used only for synthesis (1 call per analysis), not evaluation
- Gemini 3 Flash is 10-20x cheaper than GPT-5.2 for research

### Risk 5: Migration Regression

**Probability:** Medium
**Impact:** High (users see worse results)

**Mitigation:**
- **Shadow mode:** Run new pipeline alongside old pipeline for 2 weeks before cutover
- Compare outputs side-by-side for the same startups
- A/B test with internal team: blind review of old vs new evaluation quality
- Rollback strategy: old pipeline code remains in `old-backend/`, can be re-enabled via feature flag
- Keep old `sync-prompts-inline.ts` prompts as reference; new prompts should be equivalent or better

### Risk 6: BullMQ/Redis Failures

**Probability:** Low (Redis is battle-tested)
**Impact:** High (all analyses blocked)

**Mitigation:**
- Redis persistence configuration (AOF + RDB snapshots)
- Health check endpoint monitors Redis connectivity
- Circuit breaker pattern: if Redis is down, reject new analyses with user-friendly error
- Redis Sentinel or managed Redis (e.g., Upstash) for high availability
- BullMQ connection retry with exponential backoff (built-in)

---

## 8. Expected Performance Comparison

| Stage | Old Duration | New Duration | Key Change | Improvement |
|-------|-------------|-------------|------------|-------------|
| **1. Data Extraction** | 5-15 min | 30s-1 min | Mistral OCR (native PDF, 1000 pages/min) replaces sequential GPT-4o vision | 10-15x faster |
| **2. Research** | 20-30 min | 3-5 min | Gemini grounding (real-time) replaces GPT-5.2 background polling (15s intervals, 30 min max) | 5-10x faster |
| **3. Evaluation** | 5-15 min | 2-3 min | 11 parallel BullMQ jobs with GPT-4o (faster per-call) + per-agent context (fewer input tokens) | 2-5x faster |
| **4. Synthesis** | 2-5 min | 30-60s | GPT-5.2 with structured output (no JSON parsing overhead) + pre-validated inputs from Stage 3 | 2-5x faster |
| **5. Post-Processing** | 2-5 min | 15-30s | 4 parallel BullMQ jobs, batch investor matching, pure-math scoring | 5-10x faster |
| **TOTAL** | **25-45 min** | **7-11 min** | | **~70-75% faster** |

### Cost Comparison (Estimated per Analysis)

| Component | Old Cost | New Cost | Savings |
|-----------|----------|----------|---------|
| **Research (4 agents)** | ~$5-8 (GPT-5.2) | ~$0.40-1.00 (Gemini Flash) | 80-90% |
| **PDF OCR** | ~$0.50-1.00 (GPT-4o vision) | ~$0.02-0.05 (Mistral OCR, $2/1000 pages) | 95%+ |
| **Evaluation (11 agents)** | ~$3-5 (GPT-5.2) | ~$1-2 (GPT-4o: ~$2.50/1M input, ~$10/1M output) | 50-60% |
| **Synthesis** | ~$0.50-1 (GPT-5.2) | ~$0.50-1 (GPT-5.2: ~$5/1M input, ~$15/1M output) | ~0% |
| **Other (extraction, matching)** | ~$0.50-1 (GPT-5.2/4o) | ~$0.05-0.15 (GPT-4o-mini: ~$0.15/1M input, ~$0.60/1M output) | 80-90% |
| **TOTAL** | **~$8-15** | **~$2-5** | **~60-70%** |

#### Model Pricing Reference

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| GPT-4o | ~$2.50 | ~$10.00 |
| GPT-4o-mini | ~$0.15 | ~$0.60 |
| GPT-5.2 | ~$5.00 | ~$15.00 |
| Gemini 3 Flash | ~$0.10 | ~$0.40 |
| Mistral OCR | $2 per 1000 pages (flat rate) | -- |

### Reliability Comparison

| Metric | Old | New |
|--------|-----|-----|
| **Jobs lost on restart** | All queued/active | None (Redis-persisted) |
| **Max retries** | 0 (catch and log) | 2-3 per job with exponential backoff |
| **Output validation** | None (JSON.parse only) | Zod schema on every agent output |
| **Dead letter queue** | None | BullMQ dead letter with full error history |
| **Token tracking** | Hardcoded zeros | Full per-agent, per-analysis tracking |
| **Concurrent analyses** | 3 (hardcoded) | 10 (configurable) |
| **Agent isolation** | All in one 4,835-line file | One file per agent, independently testable |
| **Context efficiency** | ~80,000 tokens (all agents get everything) | ~38,500 tokens (per-agent context) |

---

## 9. Error Handling & Resilience

### 9.1 Parallel Agent Execution

Use `Promise.allSettled()` for parallel agent execution, **NOT** `Promise.all()`. If one agent fails, the others continue independently.

```typescript
// CORRECT: allSettled -- partial failures are OK
const results = await Promise.allSettled(
  agentIds.map(id => runAgent(id, context))
);

const succeeded = results.filter(r => r.status === 'fulfilled');
const failed = results.filter(r => r.status === 'rejected');

// Log failures but continue with partial results
for (const f of failed) {
  logger.error(`Agent failed: ${f.reason}`);
}
```

### 9.2 BullMQ Retry Strategy

Each job type has independent retry configuration:
- **3 attempts** with exponential backoff (2s base) for research and evaluation jobs
- **2 attempts** with fixed 5s delay for extraction and synthesis
- After exhausting retries, jobs move to the dead letter queue for admin investigation

### 9.3 Synthesis with Partial Results

Synthesis proceeds with partial results if **at least 8 out of 11** evaluation agents succeed:
- The synthesis prompt explicitly notes which sections are missing
- Missing sections receive a score of `null` (not 0) and are excluded from weighted scoring
- If fewer than 8 agents succeed, the analysis is marked as `degraded` and an admin alert is triggered

### 9.4 Dead Letter Queue

Failed jobs (after all retries exhausted) are moved to `analysis:dead-letter` with:
- Original job data and payload
- All error messages from each attempt
- Timestamp of final failure
- Stack traces for debugging
- Admin UI visibility via Bull Board

### 9.5 Circuit Breakers

- If a model provider returns 5 consecutive 5xx errors, the circuit breaker trips for 60 seconds
- During the trip, all jobs targeting that provider are paused (not failed)
- After 60 seconds, a single probe request tests recovery
- If the probe succeeds, normal processing resumes

---

## 10. Testability

### 10.1 Independently Testable Agents

Each of the 11 evaluation agents is a standalone class that can be tested in isolation. The `base.agent.ts` abstract class defines the contract, and each concrete agent implements `buildContext()` with its own data selection logic.

### 10.2 Mock Patterns

**Mock AI SDK at the provider level:**
```typescript
// Mock generateObject() for evaluation agents
vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: { overallScore: 75, narrativeSummary: '...', keyStrengths: ['...'], keyRisks: ['...'] },
    usage: { promptTokens: 1000, completionTokens: 500 },
  }),
}));

// Mock generateText() for research agents
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: '{"tam": "50B", "cagr": "12%"}',
    sources: [{ url: 'https://example.com', title: 'Source' }],
    providerMetadata: { google: { groundingMetadata: {} } },
  }),
}));
```

**Mock BullMQ queues at the service level:**
```typescript
const mockQueue = {
  add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  getJob: vi.fn().mockResolvedValue({ data: {}, status: 'completed' }),
};
```

**Mock Redis state store:**
```typescript
const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
};
```

**Mock Drizzle DB with chain pattern:**
```typescript
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue([{ id: 1, score: 85 }]),
};
```

### 10.3 Test Strategy

| Layer | What to Test | How |
|-------|-------------|-----|
| **Agent unit tests** | `buildContext()` selects correct data, `run()` produces valid schema output | Mock `generateObject()`, verify Zod parse passes |
| **Processor tests** | BullMQ job lifecycle (start, complete, fail, retry) | Mock queue and agent, verify state transitions |
| **Integration tests** | Full pipeline with mocked LLMs | Mock all providers, run orchestrator, verify DB writes |
| **E2E smoke tests** | Real LLM calls with 1-2 sample startups | Real API keys, verify output quality and timing |

### 10.4 Key Testing Principles

- Use `Promise.allSettled()` in tests to verify partial failure handling
- Verify that `generateObject()` is called with the correct Zod schema for each agent
- Verify that `generateText()` is called with `google.tools.googleSearch({})` for research agents
- Simulate provider failures (timeouts, 5xx, rate limits) to test retry and circuit breaker logic
- Assert that dead letter queue receives jobs after exhausting retries

---

## 11. DB Compatibility

### 11.1 Existing Schema is Sufficient

The existing `startup_evaluations` table already has all the columns needed to store the new AI pipeline outputs. **No schema migration is required for core AI storage.**

### 11.2 Agent-to-Column Mapping

Each of the 11 evaluation agents maps directly to an existing pair of columns in `startup_evaluations`:

| Agent | JSONB Column (detailed output) | Real Column (score) |
|-------|-------------------------------|---------------------|
| team | `teamData` | `teamScore` |
| market | `marketData` | `marketScore` |
| product | `productData` | `productScore` |
| traction | `tractionData` | `tractionScore` |
| businessModel | `businessModelData` | `businessModelScore` |
| gtm | `gtmData` | `gtmScore` |
| financials | `financialsData` | `financialsScore` |
| competitiveAdvantage | `competitiveAdvantageData` | `competitiveAdvantageScore` |
| legal | `legalData` | `legalScore` |
| dealTerms | `dealTermsData` | `dealTermsScore` |
| exitPotential | `exitPotentialData` | `exitPotentialScore` |
| synthesis | `synthesisData` | `overallScore` |

### 11.3 JSONB Flexibility

The JSONB columns accept any JSON structure. The Zod-validated outputs from the new pipeline are simply a stricter, cleaner version of what the old pipeline stored:
- Old pipeline: unvalidated `JSON.parse()` output, arbitrary shapes
- New pipeline: Zod-validated structured objects, guaranteed shape

Both are valid JSONB. The new outputs are a superset of the old -- they include all the same fields plus additional structured sub-fields. Frontend consumers that already handle the old shape will work with the new shape because all original fields are preserved.

### 11.4 New Tables (Optional)

The only new table required is for token tracking (does not affect existing schema):

```sql
CREATE TABLE analysis_token_usage (
  id SERIAL PRIMARY KEY,
  startup_id INTEGER REFERENCES startups(id),
  agent_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```
