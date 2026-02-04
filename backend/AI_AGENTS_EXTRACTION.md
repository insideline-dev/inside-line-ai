# Inside Line AI - AI Agents Architecture

## Overview

The Inside Line AI platform uses a multi-layered AI agent architecture to evaluate startups. The system is organized into 5 main stages with 11 specialized evaluation agents.

---

## Complete Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STARTUP EVALUATION PIPELINE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STAGE 1: DATA EXTRACTION                                                   │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  PDF Parser     │───►│  Vision Fallback│───►│  Field Extractor │         │
│  │  (pdf-parse)    │    │  (GPT-4o Vision)│    │  (Startup fields)│         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│         │                                              │                    │
│         ▼                                              ▼                    │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │  EXTRACTED: deck content, website, description, stage, etc. │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STAGE 2: LINKEDIN RESEARCH (via Unipile API)                               │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  Team Discovery │───►│  Profile Search │───►│  Data Enrichment│         │
│  │  (from deck)    │    │  (by name/URL)  │    │  (experience,   │         │
│  │                 │    │                 │    │   education)    │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STAGE 3: DEEP RESEARCH (4 parallel agents via GPT-5.2 background)          │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │ Team Research │  │Market Research│  │Product Research│  │News Search │  │
│  │ (patents,     │  │(TAM, CAGR,    │  │(competitors,   │  │(mentions,  │  │
│  │  exits, etc.) │  │ trends)       │  │ features)      │  │ sentiment) │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  └─────────────┘  │
│         │                  │                  │                  │          │
│         └──────────────────┼──────────────────┼──────────────────┘          │
│                            ▼                                                │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │              ComprehensiveResearchResult                     │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STAGE 4: EVALUATION (11 specialized agents in parallel)                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐           │
│  │  Team   │ │ Market  │ │ Product │ │Traction │ │Business Model│           │
│  │(20% wt) │ │(15% wt) │ │(10% wt) │ │(10% wt) │ │  (10% wt)   │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────────┘           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐           │
│  │   GTM   │ │Financials│ │Compet.  │ │  Legal  │ │ Deal Terms  │           │
│  │(5% wt)  │ │(5% wt)  │ │Advntge  │ │(5% wt)  │ │  (5% wt)    │           │
│  │         │ │         │ │(5% wt)  │ │         │ │             │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────────┘           │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                    Exit Potential (10% wt)                   │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                  │                                          │
│                                  ▼                                          │
│                     ┌─────────────────────────┐                             │
│                     │    Synthesis Agent      │                             │
│                     │  (Executive Summary,    │                             │
│                     │   Final Score, Memo)    │                             │
│                     └─────────────────────────┘                             │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STAGE 5: INVESTOR MATCHING (runs after approval)                           │
│  ┌───────────────────┐    ┌───────────────────┐    ┌─────────────────────┐ │
│  │ First Level Filter│───►│ Thesis Alignment  │───►│  Match Creation     │ │
│  │ (stage, sector,   │    │ Agent (fit score, │    │  (investor matches) │ │
│  │  geography, size) │    │  rationale)       │    │                     │ │
│  └───────────────────┘    └───────────────────┘    └─────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Locations

| File | Purpose |
|------|---------|
| `server/langchain-agents.ts` | Main evaluation agents (11 agents + orchestrator) |
| `server/research-orchestrator.ts` | Deep research pipeline (4 agents) |
| `server/investor-agents.ts` | Investor matching agents |
| `server/communication-agent.ts` | Clara - email/WhatsApp agent |
| `server/agent-prompt-loader.ts` | Database prompt loader with caching |

---

## Stage 1: Data Extraction

### Purpose
Extract structured data from pitch deck PDFs and discover missing startup information.

### Components

#### 1.1 Deck Content Extractor
**Location:** `langchain-agents.ts:extractDeckContent()`

**Flow:**
```
PDF File(s)
    │
    ├──► pdf-parse library (text extraction)
    │         │
    │         └──► Success? → Return extracted text
    │
    └──► Vision Fallback (if text extraction fails or content is image-based)
              │
              └──► Convert PDF pages to images
              └──► Send to GPT-4o Vision
              └──► Extract text from images
```

**Key Logic:**
- Attempts text extraction using `pdf-parse` first
- If content is too short (<500 chars) or appears to be image-based, falls back to Vision API
- Vision API processes each page as an image and extracts text
- Returns concatenated content from all pages

#### 1.2 Field Extractor
**Location:** `langchain-agents.ts:extractFieldsFromDeckContent()`

**Input:** Raw deck text content

**Extracts:**
- `website` - Company URL
- `description` - One-liner description
- `stage` - Funding stage (pre_seed, seed, series_a, etc.)
- `sector` - Industry sector
- `location` - Company headquarters
- `roundSize` - Amount being raised
- `roundCurrency` - Currency of the raise

**Flow:**
```
Deck Content
    │
    └──► GPT-4o with structured output
              │
              └──► Parse existing fields in startup record
              └──► Only extract MISSING fields
              └──► Return extracted fields (JSON)
```

#### 1.3 Website Discovery
**Location:** `langchain-agents.ts:discoverWebsite()`

**Purpose:** Find company website when not provided

**Flow:**
```
1. Search deck content for URL patterns
    │
    ├──► Filter out social media, file extensions
    ├──► Prefer URLs matching company name
    │
    └──► If not found in deck:
              │
              └──► OpenAI web search for company
              └──► Visit each result
              └──► Verify page mentions company name
              └──► Return verified URL
```

---

## Stage 2: LinkedIn Research

### Purpose
Enrich team member profiles with LinkedIn data via Unipile API.

### Components

#### 2.1 Team Discovery
**Location:** `langchain-agents.ts:extractTeamFromDeck()`

**Flow:**
```
Deck Content
    │
    └──► GPT-5.2 with team extraction prompt
              │
              └──► Extract: name, role, LinkedIn URL
              └──► Filter out advisors/board members
              └──► Filter out watermarks (Gamma, Canva, etc.)
              └──► Limit to TOP 10 leadership members
```

**Filters Applied:**
- Watermark patterns (presentation tools like Gamma, Canva, etc.)
- Generic email prefixes (help@, support@, info@)
- Advisor roles (excludes advisors, board members, investors)
- Validates names are real person names, not URLs or emails

#### 2.2 LinkedIn Enrichment
**Location:** `research-orchestrator.ts:enrichTeamWithLinkedIn()`

**For each team member:**
```
Team Member
    │
    ├──► Has LinkedIn URL?
    │         └──► Fetch profile via Unipile API
    │
    └──► No LinkedIn URL?
              └──► Search Unipile by name + company
              └──► Find best match (company name match > job title match)
```

**Data Enriched:**
- Headline
- Summary/Bio
- Location
- Profile picture URL
- Experience (company, title, duration, description)
- Education (school, degree, field)
- Skills

---

## Stage 3: Deep Research

### Purpose
Conduct comprehensive web research using GPT-5.2 with `web_search` tool in background mode.

### Research Orchestrator
**Location:** `research-orchestrator.ts:conductComprehensiveResearch()`

**High-Level Flow:**
```
Startup Data (name, website, sector, deck content)
    │
    ├──► Stage 1: Deep Website Scraping
    │         └──► Scrape up to 20 pages with priority patterns
    │
    ├──► Stage 2: Team Discovery & LinkedIn Enrichment
    │         └──► Extract team from deck + enrich via Unipile
    │
    ├──► Stage 3: Generate Research Parameters
    │         └──► Create smart search queries from extracted data
    │
    └──► Stage 4: Run 4 Deep Research Agents IN PARALLEL
              ├──► Team Deep Research
              ├──► Market Deep Research
              ├──► Product Deep Research
              └──► News Search
```

### 3.1 Deep Website Scraper
**Location:** `research-orchestrator.ts:deepScrapeWebsite()`

**Priority URL Patterns:**
```javascript
[
  "/about", "/team", "/company", "/leadership",  // Team info
  "/product", "/features", "/solutions", "/platform",  // Product info
  "/pricing", "/plans",  // Pricing info
  "/customers", "/case-studies", "/testimonials",  // Traction
  "/blog", "/news", "/press",  // Content
  "/careers", "/jobs"  // Growth signals
]
```

**Flow:**
```
Website URL
    │
    └──► Scrape homepage
    └──► Extract all internal links
    └──► Score links by priority patterns
    └──► Scrape top 20 prioritized pages
    └──► Return: { url, title, mainContent, description }[]
```

### 3.2 Team Deep Research Agent
**Location:** `research-orchestrator.ts:runTeamDeepResearch()`

**Model:** GPT-5.2 with `web_search` tool (background mode, 15s polling)

**Research Areas:**
- Previous company exits
- Patents and publications
- Notable achievements and awards
- Education highlights (top schools, degrees)
- Industry recognition

**Output Structure:**
```typescript
{
  name: string;
  role: string;
  confidenceScore: number;
  pastAccomplishments: string[];
  patents: { title: string; year: string; url?: string }[];
  previousExits: { company: string; type: string; year: string; value?: string }[];
  notableAchievements: string[];
  educationHighlights: string[];
  sources: string[];
}
```

### 3.3 Market Deep Research Agent
**Location:** `research-orchestrator.ts:runMarketDeepResearch()`

**Model:** GPT-5.2 with `web_search` tool (background mode, 15s polling)

**Research Areas:**
- TAM (Total Addressable Market) validation
- SAM (Serviceable Addressable Market)
- Market growth rate (CAGR)
- Market trends and drivers
- Market challenges
- Forecasts from analyst reports
- Regulatory landscape

**Output Structure:**
```typescript
{
  specificMarket: string;
  totalAddressableMarket: { value: string; year: string; source: string; confidence: string };
  serviceableAddressableMarket: { value: string; source: string };
  marketGrowthRate: { value: string; cagr: string; period: string; source: string };
  tamValidation: { claimAccuracy: string; explanation: string };
  marketTrends: { trend: string; impact: string; timeframe: string }[];
  marketDrivers: string[];
  marketChallenges: string[];
  forecasts: { metric: string; value: string; year: string; source: string }[];
  regulatoryLandscape: string;
  sources: string[];
}
```

### 3.4 Product Deep Research Agent
**Location:** `research-orchestrator.ts:runProductDeepResearch()`

**Model:** GPT-5.2 with `web_search` tool (background mode, 15s polling)

**Research Areas:**
- Competitor identification and profiles
- Competitor funding history
- Competitor strengths/weaknesses
- Product reviews (G2, Capterra, etc.)
- Technical stack (if discoverable)
- Market dynamics (entry barriers, substitutes)

**Output Structure:**
```typescript
{
  productDescription: string;
  coreFeatures: string[];
  technicalStack: string[];
  competitors: {
    name: string;
    website?: string;
    description: string;
    funding?: { totalRaised: string; lastRound: string; keyInvestors: string[] };
    strengths: string[];
    weaknesses: string[];
    marketShare?: string;
    pricing?: string;
    sources: string[];
  }[];
  reviews: { source: string; rating: string; summary: string }[];
  strengths: string[];
  weaknesses: string[];
  competitivePosition: string;
  marketDynamics: { entryBarriers: string; substitutes: string[]; buyerPower: string; supplierPower: string };
  sources: string[];
}
```

### 3.5 News Search Agent
**Location:** `research-orchestrator.ts:runNewsSearch()`

**Model:** GPT-5.2 with `web_search` tool (background mode, 15s polling)

**Research Areas:**
- Company mentions in press
- Funding news
- Product launches
- Partnerships
- Media sentiment analysis

**Output Structure:**
```typescript
{
  companyName: string;
  totalMentions: number;
  fundingMentions: { headline: string; source: string; date: string; amount?: string }[];
  productLaunches: { title: string; date: string; description: string; source: string }[];
  partnerships: { partner: string; type: string; date: string; description: string; source: string }[];
  mediaSentiment: "positive" | "neutral" | "negative" | "mixed";
  sentimentExplanation: string;
  notableArticles: { title: string; source: string; date: string; url: string; summary: string }[];
  sources: string[];
}
```

### Background API Pattern
**Location:** `research-orchestrator.ts:callDeepResearchModel()`

```
Create OpenAI request with:
    - model: "gpt-5.2"
    - background: true
    - tools: [web_search]
    │
    └──► Returns: { id: string, status: "in_progress" }
              │
              └──► Poll every 15 seconds
                        │
                        ├──► status: "in_progress" → continue polling
                        │
                        └──► status: "completed" → return response content
```

---

## Stage 4: Evaluation Agents

### Overview
11 specialized evaluation agents run in parallel, each generating:
- A narrative summary (3-4 paragraphs, VC memo style)
- Section scores (0-100)
- Key strengths and risks
- Structured data specific to the section

### Model Used
GPT-5.2 with JSON response format for all evaluation agents.

### 4.1 Team Agent
**Location:** `langchain-agents.ts:TeamAgent`

**Weight:** 20% of total score

**Evaluation Framework:**
| Component | Weight | Scoring Criteria |
|-----------|--------|------------------|
| Founder-Market Fit | 40% | Domain expertise alignment |
| Track Record | 25% | Prior exits, tier-1 companies, VC funding |
| Team Composition | 20% | Business/Technical/Industry expert coverage |
| Execution Capability | 15% | Co-founder history, full-time commitment |

**Flow:**
```
StartupContext + Team Members + LinkedIn Data + Deep Research
    │
    ├──► Scoring Chain (evaluates each founder)
    │         └──► FMF score, track record, strengths, concerns
    │
    └──► Synthesis Chain (generates narrative)
              └──► Team memo narrative
              └──► One-line summary
              └──► Investor highlights
```

### 4.2 Market Agent
**Location:** `langchain-agents.ts:MarketAgent`

**Weight:** 15% of total score

**Evaluation Areas:**
- TAM/SAM/SOM validation with bottom-up calculations
- Market growth rate (CAGR) verification
- "Why Now" timing analysis
- Competitive landscape overview
- Market dynamics (barriers, network effects)

**Key Feature - Claim Validation:**
```
Compare deck claims against web research:
    - tamAccuracy: "inflated" | "accurate" | "conservative" | "unable_to_verify"
    - growthRateAccuracy: same options
    - discrepancies: [list of specific differences]
    - verifiedClaims: [list of confirmed claims]
```

### 4.3 Product Agent
**Location:** `langchain-agents.ts:ProductAgent`

**Weight:** 10% of total score

**Evaluation Areas:**
- Product differentiation (proprietary vs wrapper)
- Technology Readiness Level (idea/MVP/scaling/mature)
- Competitive moat (network effects, data, IP, switching costs)
- UX/UI quality assessment
- Defensibility and time-to-replicate

**Special Outputs:**
- `productSummary` - 2-3 sentence plain description of what product does
- `extractedFeatures` - Concrete features from deck/website
- `extractedTechStack` - Technologies mentioned
- `extractedDemoVideos` - Demo URLs if found

### 4.4 Traction Agent
**Location:** `langchain-agents.ts:TractionAgent`

**Weight:** 10% of total score

**Evaluation Areas:**
- Revenue stage (pre-revenue, early-revenue, scaling, mature)
- Growth velocity (MoM rates)
- User quality (active vs signups, engagement)
- Retention metrics
- Momentum credibility

**Key Metrics Assessed:**
```typescript
{
  revenueStage: "pre-revenue" | "early-revenue" | "scaling" | "mature";
  growthSignals: string[];
  momentum: number; // 0-100
  credibility: number; // 0-100
  estimatedMRR: string;
  userMetrics: { claimed: string; assessment: string };
}
```

### 4.5 Business Model Agent
**Location:** `langchain-agents.ts:BusinessModelAgent`

**Weight:** 10% of total score

**Evaluation Areas:**
- Unit economics (CAC vs LTV)
- Revenue model type (subscription, transaction, freemium, enterprise)
- Margin profile (gross margin benchmarks)
- Pricing strategy assessment
- Payback period

### 4.6 GTM Agent (Go-To-Market)
**Location:** `langchain-agents.ts:GTMAgent`

**Weight:** 5% of total score

**Evaluation Areas:**
- Channel strategy (SEO, paid, direct sales, partnerships)
- Sales motion (product-led, sales-led, hybrid)
- Sales cycle length and complexity
- Virality potential and referral mechanics
- Content marketing effectiveness
- Scalability assessment

### 4.7 Financials Agent
**Location:** `langchain-agents.ts:FinancialsAgent`

**Weight:** 5% of total score

**Evaluation Areas:**
- Unit economics deep dive (CAC, LTV, payback)
- Margin analysis (gross margin vs industry benchmark)
- Burn rate and runway
- Burn multiple (cash burned per $1 ARR)
- Valuation reasonableness

**Inputs Include:**
- Round size and currency
- Valuation and type (pre/post money)
- Raise type (SAFE, convertible, equity)
- Previous funding history

### 4.8 Competitive Advantage Agent
**Location:** `langchain-agents.ts:CompetitiveAdvantageAgent`

**Weight:** 5% of total score

**Evaluation Areas:**
- Moat analysis (network effects, data, IP, brand, switching costs)
- Market positioning (blue ocean vs red ocean)
- Competitor landscape (direct and indirect)
- Barriers to entry
- Sustainable advantage assessment

**Output Includes:**
- `keyCompetitors` - Top 3-5 competitors
- `primaryDifferentiator` - Main competitive advantage
- `biggestCompetitiveThreat` - Key risk
- `moatStrengthAssessment` - weak/moderate/strong/very_strong
- Detailed competitor profiles from deep research

### 4.9 Legal & Regulatory Agent
**Location:** `langchain-agents.ts:LegalRegulatoryAgent`

**Weight:** 5% of total score

**Evaluation Areas:**
- Compliance requirements (GDPR, HIPAA, fintech licenses)
- IP ownership (patents, trademarks, trade secrets)
- Regulatory risk outlook
- Legal structure concerns
- Cap table issues

### 4.10 Deal Terms Agent
**Location:** `langchain-agents.ts:DealTermsAgent`

**Weight:** 5% of total score

**Evaluation Areas:**
- Valuation analysis vs comparable companies
- Deal structure assessment (SAFE, convertible, priced round)
- Dilution impact analysis
- Round context (use of funds, runway)
- Investor protections review

### 4.11 Exit Potential Agent
**Location:** `langchain-agents.ts:ExitPotentialAgent`

**Weight:** 10% of total score

**Evaluation Areas:**
- M&A activity in sector
- IPO feasibility
- Strategic acquirer identification
- Exit timeline estimation
- Exit multiples analysis

---

## Synthesis Agent

**Location:** `langchain-agents.ts:SynthesisAgent`

### Purpose
Synthesize all 11 agent outputs into final evaluation.

### Input
All 11 agent analysis results as JSON strings.

### Output
```typescript
{
  executiveSummary: string; // 5-6 paragraph comprehensive summary (400-500 words)
  percentileRank: number; // Estimated percentile among startups
  sectionScores: {
    team: number;
    market: number;
    product: number;
    traction: number;
    businessModel: number;
    gtm: number;
    financials: number;
    competitiveAdvantage: number;
    legal: number;
    dealTerms: number;
    exitPotential: number;
  };
  keyStrengths: string[]; // Top 5-7 across all dimensions
  keyRisks: string[]; // Top 5-7 across all dimensions
  recommendations: string[]; // 5-7 actionable improvements
  investorMemo: {
    dealHighlights: string[]; // 5 bullet points for quick pitch
    summary: string; // 2-3 sentence deal thesis
    keyDueDiligenceAreas: string[];
  };
  founderReport: {
    summary: string; // 3-4 paragraph summary for founders
    strengths: string[];
    improvements: string[];
    milestones: string[]; // Suggested milestones for next fundraise
  };
}
```

### Weighted Score Calculation
The final overall score is calculated separately using configurable stage-specific weights (stored in database). The synthesis agent normalizes section scores but does not compute the final weighted score.

---

## Stage 5: Investor Matching

### Overview
After a startup is approved by admin, investor matching runs automatically.

### Location
`server/investor-agents.ts`

### 5.1 Location Normalizer
**Purpose:** Convert location strings to standardized region codes for matching.

**Valid Region Codes:**
- `us` - United States and Canada
- `europe` - All European countries including UK
- `asia` - All Asian countries
- `latam` - Latin America including Mexico
- `mena` - Middle East and North Africa
- `global` - Multiple regions or unclear

**Flow:**
```
Location String (e.g., "San Francisco, CA")
    │
    └──► GPT-5.2 Mini with geography prompt
              │
              └──► Returns: { region: "us", confidence: 0.99 }
```

### 5.2 First Level Filter
**Purpose:** Quick filter based on hard thesis requirements.

**Filter Criteria:**
| Criteria | Match Logic |
|----------|-------------|
| Sector | Startup sector in thesis sectors list |
| Stage | Startup stage in thesis stages list |
| Geography | Startup region in thesis regions OR thesis includes "global" |
| Check Size | Round size within thesis min/max range |

**Returns:**
```typescript
{
  passes: boolean;
  matchedCriteria: string[];
  failedCriteria: string[];
}
```

### 5.3 Thesis Alignment Agent
**Purpose:** Deep analysis of startup-investor fit.

**Input:**
- Startup data and evaluation
- Investor thesis and profile
- Thesis summary (if generated)

**Evaluation Considers:**
- Sector/industry alignment depth
- Stage fit nuances
- Geographic preferences
- Business model alignment
- Revenue and traction requirements
- Team requirements
- Thesis narrative alignment
- Anti-portfolio considerations

**Output:**
```typescript
{
  fitScore: number; // 1-100
  rationale: string; // 2-3 sentence summary
  keyStrengths: string[];
  concerns: string[];
}
```

### 5.4 Investor Thesis Generator
**Purpose:** Create holistic thesis summary from investor inputs.

**Flow:**
```
Investor Profile + Thesis + Portfolio Companies
    │
    └──► Scrape investor website for portfolio
    └──► Extract company patterns
    └──► Generate comprehensive thesis summary
```

**Output:**
```typescript
{
  thesisSummary: string; // 3-5 paragraph summary
  portfolioCompanies: { name, description, stage, sector }[];
  investmentFocus: string[];
  typicalCheckSize: string;
  preferredStages: string[];
}
```

---

## Communication Agent (Clara)

### Location
`server/communication-agent.ts`

### Purpose
AI-powered email and WhatsApp assistant for investor interactions.

### Capabilities

#### Message Analysis
```typescript
{
  intent: "question" | "submission" | "follow_up" | "greeting" | "report_request" | "unknown";
  extractedEntities: {
    startupNames: string[];
    founderEmails: string[];
    founderNames: string[];
    urls: string[];
    attachments: { name, type, url? }[];
  };
  confidence: number;
  suggestedAction: string;
}
```

#### Supported Actions

| Intent | Action |
|--------|--------|
| `submission` | Extract startup info, create record, queue analysis |
| `question` | Look up startup data, provide evaluation details |
| `report_request` | Generate PDF memo, attach to reply |
| `follow_up` | Check analysis status, provide updates |
| `greeting` | Friendly response, offer help |

#### Flow for Pitch Deck Submission
```
Inbound Email with PDF Attachment
    │
    ├──► Analyze message intent
    │         └──► Detect "submission" intent
    │
    ├──► Extract startup info from email
    │         └──► Company name, contact details
    │
    ├──► Create startup record
    │         └──► Set pitchDeckPath from attachment
    │
    ├──► Queue for analysis
    │         └──► Status: "analyzing"
    │
    └──► Send acknowledgment
              └──► Dynamic response via LLM
```

#### Report Generation
```
Report Request
    │
    └──► Find startup (by name or conversation context)
    └──► Check evaluation status
    └──► Generate PDF via pdf-generator
    └──► Attach to email reply
```

---

## Prompt Management System

### Location
`server/agent-prompt-loader.ts`

### Purpose
Allow admins to edit agent prompts without code changes.

### Features

#### Prompt Caching
- 1-minute TTL cache
- Version tracking for invalidation
- Fallback to hardcoded prompts

#### Variable Escaping
The system auto-escapes curly braces in prompts that aren't template variables:
```
Known variables: companyName, sector, stage, website, etc.
JSON examples in prompts → {{ and }} (escaped)
Template variables → { and } (preserved)
```

#### Database Schema
```typescript
{
  agentKey: string; // "team", "market", etc.
  systemPrompt: string;
  humanPrompt: string;
  version: number;
}
```

---

## Source Tracking

### Location
`langchain-agents.ts:SourceTracker`

### Purpose
Log all data sources used during analysis for audit trail.

### Source Types
```typescript
type SourceEntry = {
  type: "document" | "website" | "linkedin" | "api" | "database";
  name: string;
  agentName: string;
  description: string;
  timestamp: Date;
  url?: string;
  apiEndpoint?: string;
  tableName?: string;
  metadata?: string;
};
```

### Methods
- `logDocument(name, agent, description, url?, metadata?)`
- `logWebsite(url, agent, description, metadata?)`
- `logLinkedIn(profileUrl, agent, description, metadata?)`
- `logAPI(endpoint, agent, description, metadata?)`
- `logDatabase(tableName, agent, description, metadata?)`

---

## Orchestrator Class

### Location
`langchain-agents.ts:StartupEvaluationOrchestrator`

### Configuration
```typescript
constructor(options?: {
  autoApprove?: boolean;  // Skip admin review
  fromStage?: number;     // Resume from stage (1-4)
})
```

### Stage Resume Logic
| fromStage | Behavior |
|-----------|----------|
| 1 | Run all stages (full re-evaluation) |
| 2 | Use cached deck content, re-run LinkedIn + research + evaluation |
| 3 | Use cached deck + LinkedIn, re-run research + evaluation |
| 4 | Use all cached data, only re-run evaluation |

### Main Evaluate Flow
```
evaluate(startupId)
    │
    ├──► Stage 1: Data Extraction
    │         └──► extractDeckContent()
    │         └──► extractFieldsFromDeckContent()
    │         └──► discoverWebsite()
    │
    ├──► Stage 2+3: Research
    │         └──► conductComprehensiveResearch()
    │                   └──► deepScrapeWebsite()
    │                   └──► extractTeamFromDeck()
    │                   └──► enrichTeamWithLinkedIn()
    │                   └──► generateResearchParameters()
    │                   └──► [parallel] Team/Market/Product/News Deep Research
    │
    ├──► Stage 4: Evaluation
    │         └──► [parallel] Run all 11 agents
    │         └──► synthesisAgent.synthesize()
    │         └──► Calculate weighted score
    │
    └──► Save Evaluation
              └──► Update startup status
              └──► Save all agent data
              └──► Save source tracker log
```

---

## Agent Relationships Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT DEPENDENCIES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────┐                                                          │
│  │ PDF Extractor │──┬──► Deck Content ──► Field Extractor                   │
│  └───────────────┘  │                                                       │
│                     │                                                       │
│  ┌───────────────┐  │                                                       │
│  │Vision Fallback│──┘                                                       │
│  └───────────────┘                                                          │
│                                                                             │
│  ┌───────────────┐      ┌───────────────┐      ┌───────────────┐           │
│  │Team Discovery │─────►│LinkedIn Search│─────►│LinkedIn Fetch │           │
│  │  (from deck)  │      │ (by name)     │      │ (by URL)      │           │
│  └───────────────┘      └───────────────┘      └───────────────┘           │
│         │                                              │                    │
│         └──────────────────────┬───────────────────────┘                    │
│                                ▼                                            │
│                    ┌─────────────────────┐                                  │
│                    │  Enriched Team Data │                                  │
│                    └─────────────────────┘                                  │
│                                │                                            │
│         ┌──────────────────────┼──────────────────────┐                     │
│         ▼                      ▼                      ▼                     │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐               │
│  │Team Research│       │  Market Res │       │ Product Res │               │
│  │   (deep)    │       │   (deep)    │       │   (deep)    │               │
│  └─────────────┘       └─────────────┘       └─────────────┘               │
│         │                      │                      │                     │
│         └──────────────────────┼──────────────────────┘                     │
│                                ▼                                            │
│              ┌─────────────────────────────────┐                            │
│              │  ComprehensiveResearchResult    │                            │
│              └─────────────────────────────────┘                            │
│                                │                                            │
│    ┌───────────────────────────┼───────────────────────────┐               │
│    ▼           ▼           ▼           ▼           ▼       ▼               │
│ ┌──────┐  ┌───────┐  ┌─────────┐  ┌────────┐  ┌─────┐  ┌────┐             │
│ │ Team │  │Market │  │ Product │  │Traction│  │ ... │  │Exit│             │
│ │Agent │  │ Agent │  │  Agent  │  │ Agent  │  │     │  │Agent│            │
│ └──────┘  └───────┘  └─────────┘  └────────┘  └─────┘  └────┘             │
│    │           │           │           │          │       │                │
│    └───────────┴───────────┴───────────┴──────────┴───────┘                │
│                                │                                            │
│                                ▼                                            │
│                    ┌─────────────────────┐                                  │
│                    │  Synthesis Agent    │                                  │
│                    └─────────────────────┘                                  │
│                                │                                            │
│                                ▼                                            │
│                    ┌─────────────────────┐                                  │
│                    │  Final Evaluation   │                                  │
│                    └─────────────────────┘                                  │
│                                │                                            │
│                                ▼ (on approval)                              │
│         ┌──────────────────────┴──────────────────────┐                     │
│         ▼                                             ▼                     │
│  ┌─────────────────┐                        ┌─────────────────┐            │
│  │First Level Filter│                        │  Thesis Agent   │            │
│  └─────────────────┘                        │  (generates     │            │
│         │                                   │   summary)      │            │
│         ▼ (passes)                          └─────────────────┘            │
│  ┌─────────────────┐                                                        │
│  │Thesis Alignment │                                                        │
│  │     Agent       │                                                        │
│  └─────────────────┘                                                        │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────┐                                                        │
│  │  Investor Match │                                                        │
│  └─────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## API Integration Summary

| Service | Purpose | Used By |
|---------|---------|---------|
| **OpenAI GPT-4o** | Text model, vision fallback | Field extraction, all evaluation agents |
| **OpenAI GPT-5.2** | JSON responses, web search | Deep research (background), evaluation agents |
| **Unipile** | LinkedIn data enrichment | Team discovery, profile fetching |
| **Tavily** | Web search (legacy) | Market/competitor research fallback |
| **AgentMail** | Email sending/receiving | Clara communication agent |
| **Twilio** | WhatsApp messaging | Clara communication agent |

---

## Key Configuration

### Environment Variables
```
OPENAI_API_KEY - OpenAI API access
UNIPILE_API_KEY - LinkedIn data via Unipile
UNIPILE_ACCOUNT_ID - Unipile account
TAVILY_API_KEY - Web search fallback
```

### Model Selection
```javascript
// In langchain-agents.ts
getModel()        // GPT-4o for general tasks
getJsonModel()    // GPT-5.2 for structured JSON outputs
getDeepResearchModel() // GPT-4o for competitive analysis
```

---

## Migration Notes for NestJS

### Recommended Module Structure
```
src/ai/
├── ai.module.ts
├── orchestrator/
│   ├── analysis.orchestrator.ts
│   └── analysis.queue.processor.ts
├── extractors/
│   ├── deck.extractor.ts
│   ├── website.extractor.ts
│   └── linkedin.extractor.ts
├── researchers/
│   ├── base.researcher.ts
│   ├── team.researcher.ts
│   ├── market.researcher.ts
│   ├── product.researcher.ts
│   └── news.researcher.ts
├── agents/
│   ├── base.agent.ts
│   ├── team.agent.ts
│   ├── market.agent.ts
│   ├── product.agent.ts
│   ├── traction.agent.ts
│   ├── business-model.agent.ts
│   ├── gtm.agent.ts
│   ├── financials.agent.ts
│   ├── competitive-advantage.agent.ts
│   ├── legal.agent.ts
│   ├── deal-terms.agent.ts
│   └── exit-potential.agent.ts
├── synthesizers/
│   ├── score.synthesizer.ts
│   ├── memo.synthesizer.ts
│   └── summary.synthesizer.ts
├── prompts/
│   └── prompt.loader.ts
└── types/
    └── evaluation.types.ts
```

### Key Improvements for Migration
1. **Separate prompt templates** into individual files
2. **Create abstract base class** for evaluation agents
3. **Implement proper error handling** with retry logic
4. **Add BullMQ job queue** for analysis jobs
5. **Implement caching layer** for expensive operations
6. **Add observability** (OpenTelemetry tracing)
