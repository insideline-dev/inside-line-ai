# Old vs New Backend — Node Comparison Report

> Compares `/backend/old-backend/` (Express monolith) with `/backend/src/` (NestJS pipeline)

---

## Architecture: Everything Changed

| Aspect | Old | New |
|---|---|---|
| **Framework** | Express monolith | NestJS modules |
| **Queue** | In-memory singleton (max 3 concurrent) | BullMQ + Redis (persistent) |
| **AI calls** | `gpt-5.2` with `background:true` + polling every 15s (up to 30 min) | Standard structured AI calls with Zod schemas |
| **Progress** | DB polling (stored in `analysisProgress` JSON field) | WebSocket real-time events |
| **Routing** | One giant `routes.ts` (104KB) | Separated NestJS controllers per module |

---

## Research Agents

### Input

| | Old | New |
|---|---|---|
| **Format** | Reads from DB fields directly | `{ extraction, scraping, enrichment? }` as typed job data |
| **Trigger** | In-memory queue | BullMQ job with `pipelineRunId` |
| **Retry** | Full pipeline restart | Per-agent retry via `metadata.agentKey` |

### Team Research Output

| Field | Old | New |
|---|---|---|
| Structure | `TeamMemberResearch[]` (per-member flat) | `{ linkedinProfiles[], teamSummary, onlinePresence, ... }` |
| Per member | `{ name, role, linkedinProfile, pastAccomplishments, patents[], previousExits[], notableAchievements[], educationHighlights[], confidenceScore, sources }` | `{ name, title, company, experience[], url, patents[], previousExits[], notableAchievements[], educationHighlights[], confidenceScore, sources[] }` |
| Team summary | Not present | `{ overallExperience, strengthAreas[], gaps[], redFlags[] }` |
| Online presence | Not present | `{ github, twitter, personalSites[] }` |

### Market Research Output

| Field | Old | New |
|---|---|---|
| TAM | `totalAddressableMarket: {value, year, source, confidence}` | Same + `marketSize: {tam?, sam?, som?}` |
| Trends | `marketTrends: {trend, impact, timeframe}[]` | `marketTrends: string[]` (simpler) |
| Forecasts | `forecasts` field | Removed |
| Indirect competitors | Not present | `indirectCompetitorsDetailed[]` |
| TAM validation | `tamValidation: {claimAccuracy, explanation}` | Same |

### Product Research Output

| Field | Old | New |
|---|---|---|
| Features | `coreFeatures[]` | `features[]` + `integrations[]` |
| Tech stack | `technicalStack[]` | `techStack[]` |
| Market dynamics | Not present | `{ entryBarriers, substitutes, buyerPower, supplierPower }` |
| Competitors | `competitors: CompetitorProfile[]` embedded | Moved to separate competitor agent |
| Product pages | Not present | `productPages[]` (URLs) |

### News Research Output

| Field | Old | New |
|---|---|---|
| Structure | `{ companyMentions, fundingNews, productReleases, industryNews, totalMentions }` | `articles[]` with per-article `category` + `articleSentiment` |
| Sentiment | `sentimentOverview: {positive, negative, neutral}` | Same + per-article sentiment |
| Recent events | Not present | `recentEvents: string[]` |

### Competitor Research Output

| Field | Old | New |
|---|---|---|
| Format | Flat `CompetitorProfile[]` | `{ competitors[], indirectCompetitors[], marketPositioning, competitiveLandscapeSummary }` |
| Per competitor | `{ name, description, website, fundingRaised, marketShare, strengths[], weaknesses[] }` | Same + `productOverview`, `keyFeatures[]`, `productFeatures[]`, `recentNews[]`, `pricing`, `funding: {totalRaised, lastRound, lastRoundDate, keyInvestors[]}`, `threatLevel` |
| Normalization | None | Handles two formats (old flat + new structured) via `ResearchResultNormalizer` |

---

## Evaluation Agents

### Input

| | Old | New |
|---|---|---|
| **Source** | Reads separate DB fields per section (`teamData`, `marketData`, etc.) | `{ extraction, scraping, research, enrichment?, mappedInputs?, mappedInputSources? }` |
| **Edge-driven inputs** | Not present | Optional field-mapped inputs from specific research agents (`AI_EDGE_DRIVEN_EVAL_INPUTS` flag) |

### Output — All Agents (Base Fields)

| Field | Old | New |
|---|---|---|
| Score | 0-100 | Same |
| **confidence** | Not present | `0-1 decimal` |
| **narrativeSummary** | Not present | Optional string |
| **memoNarrative** | Not present | Optional string |
| **keyFindings** | Not present | `string[]` |
| **dataGaps** | Not present | `string[]` |
| Feedback | Per-field | `feedback: string` (single) |

### Team Eval

| Field | Old | New |
|---|---|---|
| Founder market fit | `founderMarketFit: string` | `founderMarketFitScore: 0-100 integer` (numeric now) |
| Team composition | `teamComposition, executionRiskNotes` | `executionCapability: string` |
| Per-member eval | `teamMemberEvaluations[]` stored separately | `teamMembers[]: {name, role, background, strengths[], concerns[]}` inline |
| Team completion | Not present | `teamCompletion: 0-100` |

### Market Eval

| Field | Old | New |
|---|---|---|
| TAM estimate | Not extracted | `tamEstimate: number` |
| Credibility | `marketCredibility: string` | `credibilityScore: 0-100 integer` |
| Competitor lists | Not present | `directCompetitorsDetailed[]`, `indirectCompetitorsDetailed[]` |

### Traction Eval

| Field | Old | New |
|---|---|---|
| Metrics | `momentumScore` field | `metrics: {users?, revenue?, growthRatePct?}` |
| Credibility | `tractionCredibility` | Not separate — folded into `feedback` |

---

## LinkedIn / Unipile

### Old `LinkedInProfileData`
```
name, headline, summary, location, currentPosition, currentCompany,
yearsExperience: number | null,      ← REMOVED in new
skills: string[],                     ← REMOVED in new
education: string[],                  ← simplified
previousCompanies: string[],          ← REMOVED in new
experienceDetails: {company, position, startDate, endDate, duration, description, isCurrent}[]
educationDetails: {school, degree, fieldOfStudy, startDate, endDate}[]
```

### New `LinkedInProfile`
```
id, firstName, lastName, headline, location, profileUrl,
profileImageUrl: string | null,       ← NEW explicit
summary: string | null,
currentCompany: {name, title} | null,
experience: {company, title, startDate, endDate, current, location?, description?, companyPictureUrl?}[]
education: {school, degree, fieldOfStudy, startYear, endYear}[]
```

**Lost:** `yearsExperience`, `skills[]`, `previousCompanies[]`
**Gained:** `id`, `firstName/lastName` split, `profileImageUrl`, `companyPictureUrl`

---

## Scraping

| | Old | New |
|---|---|---|
| **Library** | Cheerio (direct HTTP) | `WebsiteScraperService.deepScrape()` |
| **Pages** | Home + about/pricing/product/team/company | Same strategy |
| **Team discovery** | Not a separate phase | 4-step: website bios → LinkedIn links → company LinkedIn search → deck AI |
| **Output** | `WebPageContent[]` (raw pages array) | `ScrapingResult: {website, teamMembers[], notableClaims[], scrapeErrors[]}` |
| **LinkedIn enrichment** | Done in enrichment phase | Merged into scraping phase |
| **Caching** | Not present | 7-day cache for website + LinkedIn results |

---

## Synthesis / Scoring

| | Old | New |
|---|---|---|
| **Score computation** | `Math.round(sum(score*weight) / sum(weights))` | Same logic, moved to frontend `score-utils.ts` |
| **Weights source** | `stage_scoring_weights` DB table (throws if missing) | Same |
| **Investor weights** | `computeStartupScoreWithInvestorPreferences()` | Same concept in `InvestorMatchService` |
| **percentileRank** | Computed + stored on evaluation | Optional field on synthesis output |
| **investorMemo** | `{summary, recommendation}` | `{executiveSummary, summary?, sections[], recommendation, riskLevel, dealHighlights[], keyDueDiligenceAreas[]}` |
| **founderReport** | Present | Same + `actionItems[]` added |
| **confidenceLevel** | Not present | `"High" \| "Medium" \| "Low"` |

---

## Data Lost in Migration

| Field | Old Location | Status |
|---|---|---|
| `websiteScore` + `messagingClarityScore` | Stored on evaluation | Gone |
| `deckScore` + `missingSlideFlags` | Stored on evaluation | Gone |
| `sources[].dataExtracted` | Rich source metadata | Not in new schema |
| `yearsExperience`, `skills[]` | LinkedIn profiles | Removed |
| `marketTrends[].impact` + `.timeframe` | Structured trend objects | Flattened to strings |
| `totalMentions` | News research | Removed |
| `forecasts` | Market research | Removed |
| `previousCompanies[]` | LinkedIn profiles | Removed |

---

## Data Gained in Migration

| Field | Old | New |
|---|---|---|
| Edge-driven eval inputs | Not present | `mappedInputs` + `mappedInputSources` (feature-flagged) |
| Research normalization | None | `ResearchResultNormalizer` with warnings |
| Per-agent retry | Full pipeline restart | Single agent retry |
| `narrativeSummary` / `memoNarrative` | Not present | On all eval agents |
| `keyFindings[]` / `dataGaps[]` | Not present | On all eval agents |
| `teamCompletion` score | Not present | 0-100 integer |
| `credibilityScore` (market) | String label | 0-100 integer |
| `founderMarketFitScore` | String label | 0-100 integer |
| `indirectCompetitorsDetailed[]` | Not present | Full objects with context |
| Competitor `funding` object | Flat `fundingRaised` string | `{totalRaised, lastRound, lastRoundDate, keyInvestors[]}` |
| `teamSummary` | Not present | `{overallExperience, strengthAreas[], gaps[], redFlags[]}` |
| `onlinePresence` | Not present | `{github, twitter, personalSites[]}` |
| `marketDynamics` (product) | Not present | `{entryBarriers, substitutes, buyerPower, supplierPower}` |

---

## Unchanged Nodes

| Node | Status |
|---|---|
| Extraction processor/schema | Unchanged |
| Synthesis processor/schema | Unchanged |
| Clara / AgentMail flow | Functionally equivalent, modularized |
| Score weighting logic | Equivalent (DB-driven weights) |
| Unipile API endpoints | Same (`GET /api/v1/users/{id}`, `POST /api/v1/linkedin/search`) |
