# AI Agents: Prompts and Context Map (Active Runtime)

This document describes the **active** agent prompt/context wiring in `backend/src/modules/*`.

It answers:
- What each AI agent receives as **system prompt**
- What each AI agent receives as **user prompt**
- What data/context is shared across agents

## Scope and Source of Truth

- Active pipeline code: `src/modules/ai/`
- Clara assistant code: `src/modules/clara/`
- This document does **not** describe legacy `old-backend/` runtime behavior.

---

## Shared Context Across Agents

### 1. Canonical startup profile (shared across most pipeline stages)

Most agents indirectly rely on `ExtractionResult`, which contains:
- `companyName`
- `tagline`
- `founderNames`
- `industry`
- `stage`
- `location`
- `website`
- `fundingAsk`
- `valuation`
- `rawText`
- `startupContext` (form fields and uploaded artifacts)

Source: `src/modules/ai/interfaces/phase-results.interface.ts`

### 2. Startup form context (`startupFormContext`)

This is the most important shared structured context across pipeline agents. It includes fields like:
- sector fields (`sectorIndustryGroup`, `sectorIndustry`)
- round and valuation fields (`roundCurrency`, `valuationKnown`, `valuationType`, `raiseType`)
- lead and prior funding fields (`leadSecured`, `leadInvestorName`, `hasPreviousFunding`, etc.)
- product/demo fields (`demoUrl`, `demoVideoUrl`, `productDescription`, `productScreenshots`)
- uploaded files and team references

Source: `StartupFormContext` in `src/modules/ai/interfaces/phase-results.interface.ts`

### 3. Admin feedback context (`adminFeedback`)

Injected into all research and evaluation agent prompts:
- phase-level feedback
- agent-specific feedback
- each note includes scope, feedback text, and creation date

Sources:
- `src/modules/ai/services/research.service.ts`
- `src/modules/ai/agents/evaluation/base-evaluation.agent.ts`

### 4. Shared evaluation scoring instructions

Every evaluation agent receives a shared rubric/rules block appended to its system prompt:
- score bands (0-39, 40-69, 70-84, 85-100)
- "use only provided context"
- "lower confidence when evidence is missing"
- "avoid unsupported claims"

Source: `src/modules/ai/agents/evaluation/base-evaluation.agent.ts`

---

## Model Routing (Defaults)

From `src/modules/ai/ai.config.ts`:
- Extraction: `gemini-3.0-flash`
- Research: `gemini-3.0-flash`
- Evaluation: `gemini-3.0-flash`
- Synthesis: `gpt-5.2`
- Thesis alignment: `gemini-3.0-flash`
- Location normalization: `gemini-3.0-flash`
- OCR: `mistral-ocr-latest`

Environment variables can override these defaults via `AiConfigService`.

---

## Pipeline Agents

## A) Extraction Phase

### Agent: Field Extraction (`FieldExtractorService`)
- File: `src/modules/ai/services/field-extractor.service.ts`
- Prompt type: single prompt (no separate system prompt string)
- Prompt includes:
  - instruction to extract structured startup fields from pitch deck text
  - strict rules (no invention, only evidence-backed fields)
  - `Startup context hints: <JSON>`
  - truncated deck text
- Context passed in prompt:
  - startup DB fields (`name`, `tagline`, `industry`, `stage`, `location`, `website`, `fundingTarget`, `valuation`, `teamMembers`)
  - nested `startupFormContext` fields

---

## B) Research Phase (4 agents)

Research runtime path:
- Agent config registry: `src/modules/ai/agents/research/index.ts`
- Execution/injection: `src/modules/ai/services/research.service.ts`
- Model runner: `src/modules/ai/services/gemini-research.service.ts`

For every research agent:
- Receives `systemPrompt` from its prompt file
- Receives user prompt template with `{{contextJson}}`
- `contextJson` includes:
  - agent-specific context from `contextBuilder(...)`
  - `startupFormContext`
  - `adminFeedback`
- Uses Google Search tool when model name includes `gemini`

### 1. Team Research Agent
- Key: `team`
- Files:
  - `src/modules/ai/agents/research/team-research.agent.ts`
  - `src/modules/ai/prompts/research/team-research.prompt.ts`
- System prompt:
  - venture research analyst for founder/leadership diligence
- Agent-specific context keys:
  - `companyName`
  - `teamMembers`
  - `companyDescription`
  - `industry`
  - `websiteUrl`

### 2. Market Research Agent
- Key: `market`
- Files:
  - `src/modules/ai/agents/research/market-research.agent.ts`
  - `src/modules/ai/prompts/research/market-research.prompt.ts`
- System prompt:
  - venture market analyst
- Agent-specific context keys:
  - `industry`
  - `geographicFocus`
  - `companyDescription`
  - `targetMarket`

### 3. Product Research Agent
- Key: `product`
- Files:
  - `src/modules/ai/agents/research/product-research.agent.ts`
  - `src/modules/ai/prompts/research/product-research.prompt.ts`
- System prompt:
  - venture product analyst
- Agent-specific context keys:
  - `productDescription`
  - `knownCompetitors`
  - `websiteProductPages`
  - `demoUrl`
  - `websiteHeadings`

### 4. News Research Agent
- Key: `news`
- Files:
  - `src/modules/ai/agents/research/news-research.agent.ts`
  - `src/modules/ai/prompts/research/news-research.prompt.ts`
- System prompt:
  - venture diligence analyst focused on current events
- Agent-specific context keys:
  - `companyName`
  - `industry`
  - `geographicFocus`
  - `foundingDate`
  - `knownFunding`

---

## C) Evaluation Phase (11 agents)

Evaluation runtime path:
- Base class: `src/modules/ai/agents/evaluation/base-evaluation.agent.ts`
- Registry: `src/modules/ai/services/evaluation-agent-registry.service.ts`

For every evaluation agent:
- Has a dedicated system prompt in its class
- Gets a formatted user prompt generated from context sections (`## Section Name`)
- Prompt payload always includes:
  - agent-specific `buildContext(...)` output
  - `startupFormContext`
  - `adminFeedback`
- Shared scoring rubric/rules appended to system prompt (from base class)

### 1. Team Evaluation Agent
- Key: `team`
- File: `src/modules/ai/agents/evaluation/team-evaluation.agent.ts`
- System prompt role: founder/leadership quality analyst
- Context keys:
  - `teamMembers`
  - `linkedinProfiles`
  - `teamResearch`
  - `companyDescription`
  - `industry`

### 2. Market Evaluation Agent
- Key: `market`
- File: `src/modules/ai/agents/evaluation/market-evaluation.agent.ts`
- System prompt role: market quality/TAM credibility analyst
- Context keys:
  - `marketResearch`
  - `industry`
  - `claimedTAM`
  - `targetMarket`
  - `competitiveLandscape`

### 3. Product Evaluation Agent
- Key: `product`
- File: `src/modules/ai/agents/evaluation/product-evaluation.agent.ts`
- System prompt role: product/technical differentiation analyst
- Context keys:
  - `deckProductSection`
  - `productResearch`
  - `websiteProductPages`
  - `demoUrl`
  - `extractedFeatures`

### 4. Traction Evaluation Agent
- Key: `traction`
- File: `src/modules/ai/agents/evaluation/traction-evaluation.agent.ts`
- System prompt role: traction/growth/KPI credibility analyst
- Context keys:
  - `tractionMetrics`
  - `stage`
  - `newsResearch`
  - `previousFunding`

### 5. Business Model Evaluation Agent
- Key: `businessModel`
- File: `src/modules/ai/agents/evaluation/business-model-evaluation.agent.ts`
- System prompt role: business model quality/scalability analyst
- Context keys:
  - `deckBusinessModelSection`
  - `pricing`
  - `revenueModel`
  - `unitEconomics`

### 6. GTM Evaluation Agent
- Key: `gtm`
- File: `src/modules/ai/agents/evaluation/gtm-evaluation.agent.ts`
- System prompt role: go-to-market/distribution analyst
- Context keys:
  - `targetMarket`
  - `websiteMarketingPages`
  - `distributionChannels`
  - `customerAcquisitionStrategy`

### 7. Financials Evaluation Agent
- Key: `financials`
- File: `src/modules/ai/agents/evaluation/financials-evaluation.agent.ts`
- System prompt role: financial health/burn/runway analyst
- Context keys:
  - `financialProjections`
  - `fundingTarget`
  - `previousFunding`
  - `currentValuation`
  - `burnRate`

### 8. Competitive Advantage Evaluation Agent
- Key: `competitiveAdvantage`
- File: `src/modules/ai/agents/evaluation/competitive-advantage-evaluation.agent.ts`
- System prompt role: moat/defensibility analyst
- Context keys:
  - `productResearch`
  - `extractedFeatures`
  - `patents`
  - `techStack`

### 9. Legal Evaluation Agent
- Key: `legal`
- File: `src/modules/ai/agents/evaluation/legal-evaluation.agent.ts`
- System prompt role: legal/compliance/regulatory risk analyst
- Context keys:
  - `location`
  - `industry`
  - `complianceMentions`
  - `regulatoryLandscape`

### 10. Deal Terms Evaluation Agent
- Key: `dealTerms`
- File: `src/modules/ai/agents/evaluation/deal-terms-evaluation.agent.ts`
- System prompt role: valuation and round terms analyst
- Context keys:
  - `fundingTarget`
  - `currentValuation`
  - `raiseType`
  - `leadInvestorStatus`
  - `investorRights`

### 11. Exit Potential Evaluation Agent
- Key: `exitPotential`
- File: `src/modules/ai/agents/evaluation/exit-potential-evaluation.agent.ts`
- System prompt role: long-term exit and return potential analyst
- Context keys:
  - `marketSize`
  - `competitorMandA`
  - `businessModelScalability`
  - `exitOpportunities`

---

## D) Synthesis Phase

### Agent: Synthesis Agent (`SynthesisAgentService`)
- File: `src/modules/ai/services/synthesis-agent.service.ts`
- System prompt:
  - investment committee synthesis role
  - grounded claims only
  - concise executive language
  - strict required output fields
- User prompt (`buildSynthesisBrief`) is assembled from:
  - extraction data (company overview)
  - research summaries (team/market/product/news)
  - evaluation scores/findings/risks
- Input object includes full:
  - `extraction`
  - `scraping`
  - `research`
  - `evaluation`

---

## E) Post-Synthesis Matching Agent

### Agent: Thesis Alignment (`InvestorMatchingService.alignThesis`)
- File: `src/modules/ai/services/investor-matching.service.ts`
- System prompt:
  - investor-startup fit analyst
  - explicit scoring rubric (0-100)
- User prompt sections:
  - `## Investor Thesis` (thesis narrative/notes)
  - `## Startup Profile` (synthesis executive summary, recommendation, overall score)

---

## Clara (Email Assistant) AI Agents

### 1) Clara Intent Classifier
- File: `src/modules/clara/clara-ai.service.ts`
- Prompt contains:
  - sender metadata
  - subject/body
  - attachments
  - linked-startup flag
  - recent conversation history
  - explicit intent taxonomy

### 2) Clara Response Generator
- File: `src/modules/clara/clara-ai.service.ts`
- Prompt contains:
  - persona and tone instructions
  - investor name
  - detected intent
  - optional startup extras (`startupName`, `startupStatus`, `score`)
  - recent conversation context

---

## Location Normalization Mini-Agent

### Agent: Location Normalizer (`LocationNormalizerService`)
- File: `src/modules/ai/services/location-normalizer.service.ts`
- Prompt asks model to map a location string to one enum:
  - `us`, `europe`, `latam`, `asia`, `mena`, `global`

---

## Direct Answer: "Do we have common company/startup details shared across contexts?"

Yes.

The common, reusable startup context backbone is:
1. `ExtractionResult` canonical fields (`companyName`, `industry`, `stage`, `location`, `website`, `fundingAsk`, `valuation`, `rawText`, etc.)
2. `startupFormContext` (structured startup metadata from forms/uploads)
3. `adminFeedback` (for research/evaluation runs)

Not every agent gets every field directly, but nearly all agent contexts are derived from these shared sources.

---

## Notes on Prompt Storage

- `agent_prompts` DB table exists in schema (`src/modules/agent/entities/agent.schema.ts`).
- Current active AI pipeline does not dynamically load those DB prompts at runtime.
- Active prompt source is code constants/classes in:
  - `src/modules/ai/prompts/research/*.prompt.ts`
  - `src/modules/ai/agents/evaluation/*.ts`
  - `src/modules/ai/services/*` (for extraction/synthesis/matching)
