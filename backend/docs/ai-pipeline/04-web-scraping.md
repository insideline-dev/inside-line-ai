# Phase 4: Web & LinkedIn Scraping

## Overview

Deep-scrape startup websites using Cheerio (extending existing utility at `src/common/utils/web-scraper.util.ts`), enrich team members via LinkedIn using existing `UnipileModule`, cache all results in Redis.

## Prerequisites

- Phase 1 (Foundation) completed
- Existing web scraper utility at `src/common/utils/web-scraper.util.ts`
- UnipileModule at `src/modules/integrations/unipile/` (for LinkedIn enrichment)
- Redis configured for caching

## Architecture Overview

```
Website URL → Cache Check
                ↓
         Cache Hit? ─┬─ Yes → Return cached data
                     │
                     └─ No → Deep Scrape (up to 20 subpages, batched 5/parallel)
                              ↓
                         Extract metadata, team bios, pricing
                              ↓
                         Cache for 24h
                              ↓
Team Members → LinkedIn Enrichment
                     ↓
              Check Unipile Config
                     ↓
         Configured? ─┬─ Yes → Batch enrich (Promise.allSettled)
                      │
                      └─ No → Mark as 'not_configured'
                               ↓
                         Cache for 7 days
                               ↓
                    Store in Pipeline State
```

## Deliverables

| File | Purpose | Key Methods |
|------|---------|-------------|
| `src/modules/ai/scraping/scraping.module.ts` | Sub-module for scraping services | Module definition with providers and exports |
| `src/modules/ai/scraping/website-scraper.service.ts` | Extended Cheerio scraper | `deepScrape(url: string): Promise<WebsiteScrapedData>` |
| `src/modules/ai/scraping/linkedin-enrichment.service.ts` | Wraps existing UnipileService | `enrichTeamMembers(members: TeamMember[], startupContext?: object): Promise<EnrichedTeamMember[]>` |
| `src/modules/ai/scraping/scraping-cache.service.ts` | Redis caching layer | `getWebsiteCache(url)`, `setWebsiteCache(url, data)`, `getLinkedInCache(profileUrl)`, `setLinkedInCache(profileUrl, data)` |
| `src/modules/ai/scraping/scraping.service.ts` | Orchestrator service | `processScraping(jobData: ScrapingJobData): Promise<ScrapingResult>` |
| `src/modules/ai/scraping/scraping.processor.ts` | BullMQ processor for `ai-scraping` queue | Extends `BaseProcessor` from `src/queue/processors/base.processor.ts` |

## Key Interface Definitions

### WebsiteScrapedData
```typescript
{
  url: string;
  title: string;
  description: string;
  fullText: string; // Aggregated from all pages
  headings: string[]; // All headings extracted from pages
  subpages: Array<{
    url: string;
    title: string;
    content: string;
  }>;
  links: Array<{
    url: string;
    text: string;
  }>; // Up to 100 links per page
  teamBios: Array<{
    name: string;
    role: string;
    bio: string;
    imageUrl?: string;
  }>;
  pricing?: {
    plans: Array<{ name: string; price: string; features: string[] }>;
    currency?: string;
  };
  customerLogos: string[]; // Image URLs
  testimonials: Array<{
    quote: string;
    author: string;
    role?: string;
  }>;
  metadata: {
    scrapedAt: ISO8601;
    pageCount: number;
    hasAboutPage: boolean;
    hasTeamPage: boolean;
    hasPricingPage: boolean;
    ogImage?: string; // og:image meta tag
    keywords?: string; // keywords meta tag
    author?: string; // author meta tag
  };
}
```

### EnrichedTeamMember
```typescript
{
  name: string;
  role: string;
  linkedinUrl?: string;
  linkedinProfile?: {
    headline: string;
    summary: string;
    experience: Array<{
      title: string;
      company: string;
      duration: string;
    }>;
    education: Array<{
      school: string;
      degree: string;
      field: string;
    }>;
  };
  enrichmentStatus: 'success' | 'not_configured' | 'not_found' | 'error';
  enrichedAt?: ISO8601;
}
```

### ScrapingResult
```typescript
{
  website: WebsiteScrapedData | null; // Null if scraping failed
  team: EnrichedTeamMember[];
  scrapeErrors: Array<{
    type: 'website' | 'linkedin';
    target: string; // URL or member name
    error: string;
  }>;
}
```

### ScrapingJobData
```typescript
extends AiPipelineBaseJobData {
  websiteUrl?: string; // From extracted fields or DB
  teamMembers?: Array<{
    name: string;
    role: string;
    linkedinUrl?: string;
  }>;
}
```

### ScrapingJobResult
```typescript
extends BaseJobResult {
  scrapingResult: ScrapingResult;
}
```

## Detailed Component Specifications

### website-scraper.service.ts

**Package**: `cheerio`

**Extends**: Existing utility at `src/common/utils/web-scraper.util.ts`

**Responsibilities**:
- Go beyond basic metadata extraction
- Discover and scrape up to 20 relevant subpages (5 pages in parallel per batch)
- Extract structured data: team bios, pricing, testimonials
- Handle multi-page navigation
- Respect robots.txt and rate limits

**Subpage Discovery Strategy**:
1. Parse homepage for internal links matching priority patterns and generic internal links (up to 4 path segments deep)
2. Prioritize URLs by category (in order):
   - **Team/People**: `/about`, `/team`, `/leadership`, `/founders`, `/people`
   - **Product**: `/product`, `/products`, `/platform`, `/solution`, `/solutions`, `/features`
   - **Pricing**: `/pricing`, `/plans`
   - **Company**: `/company`, `/careers`, `/jobs`
   - **Social Proof**: `/customers`, `/case-studies`, `/testimonials`
   - **Technical**: `/technology`, `/how-it-works`
   - **News**: `/blog`, `/news`, `/press`
   - **Investment**: `/investors`, `/funding`
   - **Other**: `/contact`, `/demo`
3. Filtering rules:
   - Same hostname only
   - Exclude hash fragments (#)
   - Exclude javascript: and mailto: links
   - Max 4 path segments for non-priority links
4. Select top 20 by priority score, process in batches of 5 pages in parallel

**Content Extraction Patterns**:

**Team Bios**:
```typescript
// Look for common patterns:
- Section headings: "Team", "Our Team", "Leadership", "Founders"
- Structure: <div class="team-member"> with name, role, bio
- Images: Adjacent <img> tags with alt text containing names
- LinkedIn icons: Extract href for profile URLs
```

**Pricing**:
```typescript
// Detect pricing tables:
- Section headings: "Pricing", "Plans", "Packages"
- Common elements: .pricing-card, .plan, .tier
- Extract: plan name, price (with currency), features list
```

**Testimonials**:
```typescript
// Identify social proof:
- Blockquotes with attribution
- .testimonial, .review, .quote classes
- Extract: quote text, author name, role/company
```

**Customer Logos**:
```typescript
// Find logo sections:
- Headings: "Trusted by", "Our Customers", "Partners"
- Extract <img> src from logo grids
- Filter for reasonable image sizes (avoid icons/social badges)
```

**Method Signature**:
```typescript
async deepScrape(url: string): Promise<WebsiteScrapedData>
```

**Scraping Rules**:
- Max 20 subpages per domain
- 1 second delay between requests (rate limiting)
- 30 second timeout per page
- User-Agent: "InsideLine-Bot/1.0"
- Follow redirects (max 3 hops)
- Handle JavaScript-rendered content: extract only static HTML (no browser automation)
- Batch processing: 5 pages in parallel per batch to optimize throughput

**Error Handling**:
- 404/403: Log warning, mark page as unavailable, continue with other pages
- Timeout: Skip page, continue with remaining
- DNS failure: throw `RecoverableError`
- Invalid URL: throw `UnrecoverableError`
- All subpages fail: Return partial data with homepage only

### linkedin-enrichment.service.ts

**Dependencies**: `UnipileService` from `src/modules/integrations/unipile/unipile.service.ts`

**Responsibilities**:
- Batch process team members
- Gracefully handle missing Unipile configuration
- Use `Promise.allSettled()` for parallel fetching
- Map Unipile profile data to `EnrichedTeamMember` format
- Cache results to avoid API quota exhaustion

**Method Signature**:
```typescript
async enrichTeamMembers(
  members: TeamMember[],
  startupContext?: { name?: string; website?: string }
): Promise<EnrichedTeamMember[]>
```

**Batch Processing Strategy**:
1. Check if UnipileService is configured (API key exists)
   - If not configured: Return all members with `enrichmentStatus: 'not_configured'`
2. Filter members with `linkedinUrl`
3. Use `Promise.allSettled()` to fetch all profiles in parallel
4. Map results:
   - Fulfilled: Extract profile data → `enrichmentStatus: 'success'`
   - Rejected (404): `enrichmentStatus: 'not_found'`
   - Rejected (other): `enrichmentStatus: 'error'`
5. Return combined results (enriched + not enriched)

**Unipile API Mapping**:
```typescript
// UnipileService returns profile object:
{
  id: string,
  headline: string,
  summary: string,
  positions: Array<{
    title: string,
    companyName: string,
    startDate: Date,
    endDate?: Date
  }>,
  educations: Array<{
    schoolName: string,
    degreeName: string,
    fieldOfStudy: string
  }>
}

// Map to linkedinProfile:
{
  headline: profile.headline,
  summary: profile.summary,
  experience: profile.positions.map(p => ({
    title: p.title,
    company: p.companyName,
    duration: formatDuration(p.startDate, p.endDate)
  })),
  education: profile.educations.map(e => ({
    school: e.schoolName,
    degree: e.degreeName,
    field: e.fieldOfStudy
  }))
}
```

**Rate Limiting**:
- Unipile has quota limits (typically 100 req/hour)
- Use exponential backoff on 429 responses
- Cache aggressively (7 days) to avoid re-fetching
- Batch size: 10 concurrent requests (configurable)

**Error Handling**:
- Unipile not configured: Return `not_configured` status (NOT an error)
- Profile not found (404): Return `not_found` status
- API error (500): Return `error` status, log details
- Rate limit (429): Throw `RecoverableError` with retry delay
- Network timeout: Return `error` status for that member, continue batch

### scraping-cache.service.ts

**Storage**: Redis

**TTL Strategy**:
- Website cache: 24 hours (websites change frequently)
- LinkedIn cache: 7 days (profiles are relatively stable)

**Key Patterns**:
```typescript
scrape:website:{urlHash} → WebsiteScrapedData
scrape:linkedin:{profileUrlHash} → LinkedInProfile
```

**Hash Function**: Use SHA-256 of normalized URL (lowercase, remove trailing slash)

**Methods**:
```typescript
async getWebsiteCache(url: string): Promise<WebsiteScrapedData | null>
async setWebsiteCache(url: string, data: WebsiteScrapedData): Promise<void>
async getLinkedInCache(profileUrl: string): Promise<LinkedInProfile | null>
async setLinkedInCache(profileUrl: string, data: LinkedInProfile): Promise<void>
```

**Cache Invalidation**:
- Manual: Admin endpoint to clear cache for specific URL
- Automatic: TTL expiration
- Startup update: Clear cache when startup manually updates website URL

**Cache Miss Tracking**:
- Emit metrics on cache hit/miss rate
- Log slow scrapes (> 10s) for monitoring

### scraping.service.ts

**Orchestration Flow**:
1. Extract website URL from job data (from extraction fields or DB)
2. Check website cache
   - Hit: Use cached data
   - Miss: Deep scrape → cache for 24h
3. Extract team members from job data (from extraction fields or DB)
4. Check LinkedIn cache for each member
   - Hit: Use cached data
   - Miss: Enrich via Unipile → cache for 7d
5. Aggregate results into `ScrapingResult`
6. Store in pipeline state under `scraping` key
7. Return result

**Method Signature**:
```typescript
async processScraping(jobData: ScrapingJobData): Promise<ScrapingResult>
```

**Redis Pipeline State Structure**:
```typescript
pipeline:{startupId} = {
  scraping: {
    website: WebsiteScrapedData,
    team: EnrichedTeamMember[],
    scrapeErrors: [...],
    completedAt: ISO8601
  }
}
```

**Error Aggregation**:
- Website scrape fails: Store error, continue with LinkedIn
- LinkedIn enrichment fails for some members: Store partial results
- Both fail: Return empty result with errors array

**Fallback Strategy**:
- No website URL: Skip website scraping, proceed with LinkedIn
- No team members: Skip LinkedIn, proceed with website
- Both missing: Mark job as completed with empty result (not an error)

### scraping.processor.ts

**Queue Name**: `ai-scraping`

**Base Class**: `BaseProcessor` from `src/queue/processors/base.processor.ts`

**Process Method**:
```typescript
async process(job: Job<ScrapingJobData>): Promise<ScrapingJobResult>
```

**Job Lifecycle**:
1. Validate job data (at least one of: websiteUrl or teamMembers)
2. Emit WebSocket `job:status` with `status: 'processing'`
3. Call `scrapingService.processScraping(job.data)`
4. Store result in Redis via `pipelineStateService`
5. Update job progress (0% → 50% → 100%)
6. Emit WebSocket `job:status` with `status: 'completed'`
7. Return `ScrapingJobResult`

**Progress Mapping**:
- 0%: Job started
- 10%: Website cache check
- 30%: Website scraping (if cache miss)
- 50%: Website complete
- 60%: LinkedIn cache check
- 80%: LinkedIn enrichment (if cache miss)
- 100%: Results stored

**WebSocket Events**:
```typescript
{
  event: 'job:status',
  data: {
    jobId: string,
    startupId: string,
    phase: 'scraping',
    status: 'processing' | 'completed' | 'failed',
    progress: number,
    result?: ScrapingResult
  }
}
```

## Acceptance Criteria

### Functional Requirements
- [ ] Scraper follows up to 20 subpage links (prioritized by relevance)
- [ ] Discovers and prioritizes links from homepage matching priority path patterns
- [ ] Discovers generic internal links up to 4 path segments deep
- [ ] Filters for same hostname, excludes fragments/javascript:/mailto: links
- [ ] Processes pages in batches of 5 in parallel
- [ ] Extracts headings, metadata (og:image, keywords, author), and links (up to 100 per page)
- [ ] Team bios extracted from /about, /team pages
- [ ] Pricing data extracted when available
- [ ] LinkedIn enrichment returns `not_configured` when Unipile not set up
- [ ] Cache hit returns data without HTTP request
- [ ] Cache miss triggers scrape and stores result
- [ ] LinkedIn cache: 7-day TTL, website cache: 24h TTL
- [ ] Scraping errors for individual subpages don't crash entire scrape (`Promise.allSettled`)
- [ ] Pipeline state updated with scraped data

### Non-Functional Requirements
- [ ] Website deep scrape completes in < 15 seconds (5 pages × 3s avg)
- [ ] LinkedIn batch enrichment completes in < 10 seconds (10 profiles)
- [ ] Cache hit latency < 50ms
- [ ] Respects robots.txt (do not scrape disallowed paths)
- [ ] Rate limit: 1 req/second per domain
- [ ] User-Agent properly identifies bot

### Error Handling
- [ ] Website 404: Logs warning, continues with other pages
- [ ] All subpages fail: Returns partial data (homepage only)
- [ ] Unipile not configured: Graceful degradation (not an error)
- [ ] LinkedIn profile not found: Returns `not_found` status
- [ ] Unipile rate limit: Throws `RecoverableError` with retry

## Test Plan

### website-scraper.service.spec.ts
**Mock Strategy**: Mock `fetch()` to return HTML fixtures

**Test Cases**:
- [ ] Homepage only: Returns data with empty subpages array
- [ ] Subpage discovery: Finds priority paths (/about, /team, /pricing, /product, /leadership, etc.)
- [ ] Generic link discovery: Discovers internal links matching 4-path-depth rule
- [ ] Max 20 subpages: Ignores 21st+ discovered links
- [ ] Batch processing: Scrapes 5 pages in parallel per batch
- [ ] Same-hostname filter: Rejects external links
- [ ] Fragment/javascript filtering: Skips hash fragments and javascript: links
- [ ] Link extraction: Captures up to 100 links per page
- [ ] Heading extraction: Captures all headings from pages
- [ ] Metadata extraction: Extracts og:image, keywords, author meta tags
- [ ] Team bio extraction: Parses name, role, bio from common patterns
- [ ] Pricing extraction: Detects pricing tables, extracts plans
- [ ] Malformed HTML: Cheerio gracefully handles broken tags
- [ ] 404 subpage: Skips page, continues with others
- [ ] Timeout: Aborts page after 30s, continues
- [ ] Redirect chain: Follows max 3 redirects

### linkedin-enrichment.service.spec.ts
**Mock Strategy**: Mock `UnipileService`

**Test Cases**:
- [ ] Batch success: All profiles enriched
- [ ] Partial success: 1 success, 1 not found, 1 error
- [ ] Unipile not configured: Returns all `not_configured` status
- [ ] No LinkedIn URLs: Returns original members unchanged
- [ ] Rate limit (429): Throws `RecoverableError`
- [ ] Profile mapping: Correctly transforms Unipile data
- [ ] Parallel fetching: Uses `Promise.allSettled()`

### scraping-cache.service.spec.ts
**Mock Strategy**: Mock Redis client

**Test Cases**:
- [ ] Website cache get/set: Stores and retrieves data
- [ ] LinkedIn cache get/set: Stores and retrieves data
- [ ] TTL applied: Website (24h), LinkedIn (7d)
- [ ] Cache miss: Returns `null`
- [ ] URL normalization: Lowercase, no trailing slash
- [ ] Hash collision: Different URLs produce different hashes

### scraping.service.spec.ts
**Mock Strategy**: Mock scraper + LinkedIn enrichment + cache

**Test Cases**:
- [ ] Website cache hit: Skips scraper, uses cached data
- [ ] Website cache miss: Calls scraper, caches result
- [ ] LinkedIn cache hit: Skips enrichment, uses cached data
- [ ] LinkedIn cache miss: Calls enrichment, caches result
- [ ] No website URL: Skips website scraping
- [ ] No team members: Skips LinkedIn enrichment
- [ ] Both fail: Returns empty result with errors
- [ ] Pipeline state: Verifies Redis storage structure

### scraping.processor.spec.ts
**Mock Strategy**: Standard processor test pattern

**Test Cases**:
- [ ] Job lifecycle: Start → processing → completed
- [ ] Progress updates: 0% → 10% → 30% → 50% → 60% → 80% → 100%
- [ ] WebSocket events: Emits at start and completion
- [ ] Recoverable error: Job retries with backoff
- [ ] Unrecoverable error: Job fails immediately
- [ ] Redis state: Verifies scraping data stored
- [ ] Empty job data: Completes with empty result

## Integration Points

### Existing Web Scraper Utility
- `src/common/utils/web-scraper.util.ts`
- Extend with deep scraping capabilities
- Reuse HTTP client, rate limiting, robots.txt checks

### UnipileModule
- `src/modules/integrations/unipile/unipile.service.ts`
- Use existing LinkedIn profile fetching
- Handle `not_configured` gracefully

### Redis (PipelineStateService)
- Store scraping results under `pipeline:{startupId}`
- TTL: 24 hours for pipeline state (separate from cache)

### WebSocket Gateway
- Emit `job:status` events to startup-specific room

### Next Phase Handoff
- Scoring (Phase 5) uses enriched team data for founder experience scoring
- Website content used for product-market fit analysis

## Environment Variables

```bash
UNIPILE_API_KEY=sk-... # Optional (graceful degradation if missing)
UNIPILE_ACCOUNT_ID=acc_...
WEBSITE_SCRAPE_TIMEOUT_MS=30000
LINKEDIN_BATCH_SIZE=10
SCRAPING_RATE_LIMIT_MS=1000 # 1 request/second
SCRAPING_MAX_SUBPAGES=20
SCRAPING_BATCH_SIZE=5 # Pages to scrape in parallel per batch
WEBSITE_CACHE_TTL_HOURS=24
LINKEDIN_CACHE_TTL_DAYS=7
SCRAPING_MAX_LINKS_PER_PAGE=100
SCRAPING_MAX_PATH_DEPTH=4 # Max path depth for non-priority links
```

## Estimated Effort

**Size**: M (Medium)
**Duration**: 2-3 days
**Complexity**: Moderate (HTML parsing, batching, caching, graceful degradation)

## Success Metrics

- 80% of websites successfully scraped (at least homepage)
- 60% of websites yield team bios
- 40% of websites yield pricing data
- LinkedIn enrichment: 70% success rate (when configured)
- Cache hit rate: > 50% after initial warmup period
- P95 latency: < 20 seconds (website + LinkedIn combined)
- Zero crashes on malformed HTML or missing Unipile config

## Future Enhancements (Out of Scope)

- JavaScript rendering (Puppeteer/Playwright) for dynamic content
- GitHub scraping for technical teams (repo stars, commits, languages)
- Crunchbase integration for funding/valuation data
- Social media scraping (Twitter/X, Product Hunt)
- Screenshot capture for visual analysis
