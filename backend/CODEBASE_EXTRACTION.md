# Inside Line AI - Codebase Extraction

> Core APIs, Database Schema, Types, and Third-Party Integrations
> Extracted for migration to NestJS

---

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [Database Schema](#database-schema)
3. [Types & Interfaces](#types--interfaces)
4. [Third-Party Integrations](#third-party-integrations)

---

## API Endpoints

### Auth Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/login` | - | OIDC login redirect |
| GET | `/api/logout` | - | Logout |
| GET | `/api/login/investor` | - | Login redirect (investor) |
| GET | `/api/login/founder` | - | Login redirect (founder) |
| GET | `/api/login/scout` | - | Login redirect (scout) |
| GET | `/api/auth/user` | - | Get current user + role |
| POST | `/api/auth/set-role` | Auth | Set role for new user |
| GET | `/api/profile` | Auth | Get current user's profile |
| PATCH | `/api/profile` | Auth | Update user profile |

### Startup Routes (Founder)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/startups` | Auth | Get founder's startups |
| GET | `/api/startups/:id` | Auth | Get startup with evaluation |
| GET | `/api/startups/:id/progress` | Auth | Get analysis progress |
| POST | `/api/startups` | Auth | Create new startup submission |
| GET | `/api/startups/:id/memo.pdf` | Auth | Download investment memo PDF |
| GET | `/api/startups/:id/report.pdf` | Auth | Download analysis report PDF |

### Draft Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/drafts` | Auth | Get all founder's drafts |
| GET | `/api/drafts/:id` | Auth | Get single draft |
| POST | `/api/drafts` | Auth | Create new draft |
| PATCH | `/api/drafts/:id` | Auth | Update draft |
| DELETE | `/api/drafts/:id` | Auth | Delete draft |

### Upload Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/uploads/request-url` | Auth | Get presigned upload URL |

### Scout Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/scout/apply` | Auth | Submit scout application |
| GET | `/api/scout/application` | Auth | Get user's application status |
| GET | `/api/scout/startups` | Scout | Get scout's submitted startups |
| POST | `/api/scout/startups` | Scout | Scout submits a startup |

### Investor Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/investor/matches` | Investor | Get investor matches |
| GET | `/api/investor/stats` | Investor | Get match statistics |
| GET | `/api/investor/thesis` | Investor | Get investment thesis |
| POST | `/api/investor/thesis` | Investor | Save investment thesis |
| GET | `/api/investor/my-startups` | Investor | Get private submissions |
| POST | `/api/investor/startups` | Investor | Submit private startup |
| GET | `/api/investor/startups/:id` | Investor | Get startup detail |
| GET | `/api/investor/team` | Investor | Get team invites/members |
| POST | `/api/investor/team/invite` | Investor | Create team invite |
| DELETE | `/api/investor/team/invite/:id` | Investor | Cancel team invite |
| DELETE | `/api/investor/team/member/:id` | Investor | Remove team member |
| GET | `/api/investor/scoring-weights` | Investor | Get all scoring weights |
| GET | `/api/investor/scoring-weights/:stage` | Investor | Get stage weights |
| GET | `/api/investor/scoring-preferences` | Investor | Get custom preferences |
| PUT | `/api/investor/scoring-preferences/:stage` | Investor | Save custom preference |
| GET | `/api/investor/portal` | Investor | Get portal settings |
| POST | `/api/investor/portal` | Investor | Create/update portal |
| GET | `/api/investor/portal/check-slug/:slug` | Investor | Check slug availability |

### Public Portal Routes (No Auth)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/portal/:slug` | - | Get public portal info |
| POST | `/api/portal/:slug/submit` | - | Submit startup via portal |

### Admin Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/startups` | Admin | Get all startups |
| GET | `/api/admin/startups/:id` | Admin | Get startup for review |
| POST | `/api/admin/startups/:id/reanalyze` | Admin | Re-run AI analysis |
| POST | `/api/admin/startups/:id/reanalyze/:section` | Admin | Re-analyze single section |
| POST | `/api/admin/startups/:id/approve` | Admin | Approve startup |
| POST | `/api/admin/startups/:id/reject` | Admin | Reject startup |
| PATCH | `/api/admin/startups/:id` | Admin | Update startup details |
| DELETE | `/api/admin/startups/:id` | Admin | Delete startup |
| POST | `/api/admin/startups/:id/run-alignment` | Admin | Run thesis alignment |
| GET | `/api/admin/stats` | Admin | Get dashboard stats |
| GET | `/api/admin/analytics` | Admin | Get analytics data |
| GET | `/api/admin/users` | Admin | Get all users |
| GET | `/api/admin/conversations` | Admin | Get agent conversations |
| DELETE | `/api/admin/conversations/:id` | Admin | Delete conversation |
| GET | `/api/admin/analysis-queue/status` | Admin | Get queue status |
| POST | `/api/admin/normalize-locations` | Admin | Normalize startup locations |
| GET | `/api/admin/scoring-weights` | Admin | Get all scoring weights |
| GET | `/api/admin/scoring-weights/:stage` | Admin | Get stage weights |
| PUT | `/api/admin/scoring-weights/:stage` | Admin | Update stage weights |
| POST | `/api/admin/scoring-weights/seed` | Admin | Seed default weights |
| GET | `/api/admin/agents` | Admin | Get all agent prompts |
| GET | `/api/admin/agents/:agentKey` | Admin | Get single agent prompt |
| PUT | `/api/admin/agents/:agentKey` | Admin | Update agent prompt |
| POST | `/api/admin/agents/seed` | Admin | Seed agent prompts |
| POST | `/api/admin/agents/sync-from-dev` | Admin | Sync prompts from dev |
| GET | `/api/admin/scout-applications` | Admin | Get scout applications |
| PATCH | `/api/admin/scout-applications/:id` | Admin | Approve/reject scout |
| GET | `/api/admin/webhooks/agentmail` | Admin | List AgentMail webhooks |
| DELETE | `/api/admin/webhooks/agentmail/:id` | Admin | Delete webhook |
| POST | `/api/admin/import-data` | Admin | Import data from JSON |
| POST | `/api/setup/make-admin` | Auth | Make trusted user admin |

### Notification Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | Auth | Get user notifications |
| PATCH | `/api/notifications/:id/read` | Auth | Mark as read |
| POST | `/api/notifications/mark-all-read` | Auth | Mark all read |

### Webhook Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/webhooks/agentmail` | - | AgentMail email webhook |
| POST | `/api/webhooks/twilio` | - | Twilio WhatsApp webhook |

### Public Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/scoring-weights` | Auth | Get all scoring weights |

---

## Database Schema

### Enums

```typescript
// User roles
userRoleEnum: "founder" | "investor" | "admin" | "scout"

// Scout application status
scoutApplicationStatusEnum: "pending" | "approved" | "rejected"

// Startup status
startupStatusEnum: "submitted" | "analyzing" | "pending_review" | "approved" | "rejected"

// Funding stage
stageEnum: "pre_seed" | "seed" | "series_a" | "series_b" | "series_c" | "series_d" | "series_e" | "series_f_plus"

// Technology readiness level
trlEnum: "idea" | "mvp" | "scaling" | "mature"

// Raise type
raiseTypeEnum: "safe" | "convertible_note" | "equity" | "safe_equity" | "undecided"

// Valuation type
valuationTypeEnum: "pre_money" | "post_money"

// Team invite status
teamInviteStatusEnum: "pending" | "accepted" | "expired" | "cancelled"

// Notification type
notificationTypeEnum: "analysis_complete" | "startup_approved" | "startup_rejected" | "new_match" | "system"

// Communication agent enums
channelTypeEnum: "email" | "whatsapp" | "sms"
messageDirectionEnum: "inbound" | "outbound"
conversationStatusEnum: "active" | "waiting_response" | "resolved" | "archived"
messageIntentEnum: "question" | "submission" | "follow_up" | "greeting" | "unknown"
```

### Tables

#### 1. users (Auth)
```typescript
{
  id: varchar PK (gen_random_uuid()),
  username: varchar,
  email: varchar UNIQUE,
  firstName: varchar,
  lastName: varchar,
  profileImageUrl: varchar,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

#### 2. sessions (Auth - Replit specific, REMOVE)
```typescript
{
  sid: varchar PK,
  sess: jsonb,
  expire: timestamp,
}
```

#### 3. user_profiles
```typescript
{
  id: serial PK,
  userId: varchar UNIQUE,
  role: userRoleEnum DEFAULT "founder",
  companyName: text,
  title: text,
  linkedinUrl: text,
  bio: text,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

#### 4. startups
```typescript
{
  id: serial PK,
  founderId: varchar,
  submittedByRole: userRoleEnum DEFAULT "founder",
  scoutId: varchar,
  isPrivate: boolean DEFAULT false,
  name: text,
  website: text,
  pitchDeckUrl: text,
  pitchDeckPath: text,
  files: jsonb<{ path: string; name: string; type: string }[]>,
  teamMembers: jsonb<{ name: string; role: string; linkedinUrl: string }[]>,
  description: text,
  stage: stageEnum,
  sector: text,
  sectorIndustryGroup: text,
  sectorIndustry: text,
  location: text,
  normalizedRegion: text,
  roundSize: doublePrecision,
  roundCurrency: text DEFAULT "USD",
  valuation: doublePrecision,
  valuationKnown: boolean DEFAULT true,
  valuationType: valuationTypeEnum,
  raiseType: raiseTypeEnum,
  leadSecured: boolean,
  leadInvestorName: text,
  contactName: text,
  contactEmail: text,
  contactPhone: text,
  contactPhoneCountryCode: text,
  hasPreviousFunding: boolean,
  previousFundingAmount: doublePrecision,
  previousFundingCurrency: text,
  previousInvestors: text,
  previousRoundType: text,
  status: startupStatusEnum DEFAULT "submitted",
  overallScore: real,
  percentileRank: real,
  productDescription: text,
  technologyReadinessLevel: trlEnum,
  productScreenshots: jsonb<string[]>,
  demoVideoUrl: text,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

#### 5. startup_evaluations
```typescript
{
  id: serial PK,
  startupId: integer FK -> startups.id CASCADE,

  // Website Intelligence
  websiteData: jsonb,
  websiteScore: real,
  messagingClarityScore: real,

  // Deck Intelligence
  deckData: jsonb,
  deckScore: real,
  missingSlideFlags: jsonb,

  // 1. Team Analysis
  teamData: jsonb,
  teamMemberEvaluations: jsonb,
  teamScore: real,
  founderMarketFit: real,
  executionRiskNotes: text,
  teamComposition: jsonb,

  // 2. Market Analysis
  marketData: jsonb,
  marketScore: real,
  tamValidation: jsonb,
  marketCredibility: real,

  // 3. Product/Technology
  productData: jsonb,
  productScore: real,
  productSummary: text,
  extractedScreenshots: jsonb,
  extractedDemoVideos: jsonb,
  extractedFeatures: jsonb,
  extractedTechStack: jsonb,

  // 4. Traction Analysis
  tractionData: jsonb,
  tractionScore: real,
  momentumScore: real,
  tractionCredibility: real,

  // 5. Business Model
  businessModelData: jsonb,
  businessModelScore: real,

  // 6. GTM
  gtmData: jsonb,
  gtmScore: real,

  // 7. Financials
  financialsData: jsonb,
  financialsScore: real,

  // 8. Competitive Advantage
  competitiveAdvantageData: jsonb,
  competitiveAdvantageScore: real,

  // 9. Legal
  legalData: jsonb,
  legalScore: real,

  // 10. Deal Terms
  dealTermsData: jsonb,
  dealTermsScore: real,

  // 11. Exit Potential
  exitPotentialData: jsonb,
  exitPotentialScore: real,

  // Section Scores Summary
  sectionScores: jsonb<SectionScores>,

  // Final Scores
  overallScore: real,
  percentileRank: real,
  keyStrengths: jsonb,
  keyRisks: jsonb,
  recommendations: jsonb,
  dataConfidenceNotes: text,
  executiveSummary: text,
  founderReport: jsonb,
  investorMemo: jsonb,
  sources: jsonb,
  adminFeedback: jsonb,

  // Cached data
  webResearchData: jsonb,
  deckContent: text,
  deckFilesHash: text,
  comprehensiveResearchData: jsonb,
  websiteScraped: text,

  // Progress tracking
  analysisProgress: jsonb<AnalysisProgress>,

  createdAt: timestamp,
  updatedAt: timestamp,
}
```

#### 6. admin_reviews
```typescript
{
  id: serial PK,
  startupId: integer FK -> startups.id CASCADE,
  reviewerId: varchar,
  scoreOverride: real,
  memoEdits: jsonb,
  adminNotes: text,
  flaggedConcerns: jsonb,
  investorVisibility: jsonb,
  decision: text,
  reviewedAt: timestamp,
  createdAt: timestamp,
}
```

#### 7. investor_profiles
```typescript
{
  id: serial PK,
  userId: varchar UNIQUE,
  fundName: text,
  fundDescription: text,
  aum: text,
  teamSize: integer,
  website: text,
  logoUrl: text,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

#### 8. investment_theses
```typescript
{
  id: serial PK,
  investorId: integer FK -> investor_profiles.id CASCADE,
  stages: jsonb,
  checkSizeMin: integer,
  checkSizeMax: integer,
  sectors: jsonb,
  geographies: jsonb,
  businessModels: jsonb,
  minRevenue: integer,
  minGrowthRate: real,
  minTeamSize: integer,
  thesisNarrative: text,
  antiPortfolio: text,
  website: text,
  fundSize: doublePrecision,
  thesisSummary: text,
  portfolioCompanies: jsonb,
  thesisSummaryGeneratedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

#### 9. investor_matches
```typescript
{
  id: serial PK,
  investorId: integer FK -> investor_profiles.id CASCADE,
  startupId: integer FK -> startups.id CASCADE,
  thesisFitScore: real,
  fitRationale: text,
  matchedAt: timestamp,
  status: text DEFAULT "new",
  actionTakenAt: timestamp,
  notes: text,
}
```

#### 10. team_invites
```typescript
{
  id: serial PK,
  investorProfileId: integer FK -> investor_profiles.id CASCADE,
  invitedByUserId: varchar,
  email: text,
  role: text DEFAULT "member",
  status: teamInviteStatusEnum DEFAULT "pending",
  inviteCode: varchar(64) UNIQUE,
  expiresAt: timestamp,
  acceptedByUserId: varchar,
  acceptedAt: timestamp,
  createdAt: timestamp,
}
```

#### 11. team_members
```typescript
{
  id: serial PK,
  investorProfileId: integer FK -> investor_profiles.id CASCADE,
  userId: varchar,
  role: text DEFAULT "member",
  joinedAt: timestamp,
}
```

#### 12. agent_prompts
```typescript
{
  id: serial PK,
  agentKey: varchar(50) UNIQUE,
  displayName: text,
  description: text,
  category: text,
  systemPrompt: text,
  humanPrompt: text,
  tools: jsonb<string[]>,
  inputs: jsonb<{ key: string; description: string; required: boolean }[]>,
  outputs: jsonb<{ key: string; type: string; description: string }[]>,
  parentAgent: text,
  executionOrder: integer DEFAULT 0,
  isParallel: boolean DEFAULT true,
  version: integer DEFAULT 1,
  lastModifiedBy: varchar,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

#### 13. stage_scoring_weights
```typescript
{
  id: serial PK,
  stage: stageEnum UNIQUE,
  weights: jsonb<ScoringWeights>,
  rationale: jsonb<ScoringRationale>,
  overallRationale: text,
  lastModifiedBy: varchar,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

#### 14. investor_scoring_preferences
```typescript
{
  id: serial PK,
  investorId: integer FK -> investor_profiles.id CASCADE,
  stage: stageEnum,
  useCustomWeights: boolean DEFAULT false,
  customWeights: jsonb<ScoringWeights>,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

#### 15. linkedin_profile_cache
```typescript
{
  id: serial PK,
  linkedinUrl: text UNIQUE,
  linkedinIdentifier: text,
  profileData: jsonb<LinkedInProfileData>,
  fetchedAt: timestamp,
  expiresAt: timestamp,
  createdAt: timestamp,
}
```

#### 16. notifications
```typescript
{
  id: serial PK,
  userId: varchar,
  type: notificationTypeEnum,
  title: text,
  message: text,
  startupId: integer FK -> startups.id CASCADE,
  isRead: boolean DEFAULT false,
  createdAt: timestamp,
}
```

#### 17. investor_portal_settings
```typescript
{
  id: serial PK,
  investorId: integer FK -> investor_profiles.id CASCADE UNIQUE,
  slug: varchar(100) UNIQUE,
  welcomeMessage: text,
  tagline: text,
  accentColor: varchar(7) DEFAULT "#6366f1",
  requiredFields: jsonb<string[]>,
  isEnabled: boolean DEFAULT false,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

#### 18. startup_drafts
```typescript
{
  id: serial PK,
  founderId: varchar,
  formData: jsonb<DraftFormData>,
  pitchDeckPath: text,
  uploadedFiles: jsonb<{ path: string; name: string; type: string }[]>,
  teamMembers: jsonb<{ name: string; role: string; linkedinUrl: string }[]>,
  productScreenshots: jsonb<string[]>,
  lastSavedAt: timestamp,
  createdAt: timestamp,
}
```

#### 19. agent_conversations
```typescript
{
  id: serial PK,
  investorProfileId: integer FK -> investor_profiles.id,
  senderEmail: text,
  senderPhone: text,
  senderName: text,
  emailThreadId: text,
  whatsappThreadId: text,
  status: conversationStatusEnum DEFAULT "active",
  lastMessageAt: timestamp,
  currentStartupId: integer FK -> startups.id,
  context: jsonb,
  messageCount: integer DEFAULT 0,
  isAuthenticated: boolean DEFAULT false,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

#### 20. agent_messages
```typescript
{
  id: serial PK,
  conversationId: integer FK -> agent_conversations.id CASCADE,
  channel: channelTypeEnum,
  direction: messageDirectionEnum,
  content: text,
  intent: messageIntentEnum,
  extractedEntities: jsonb,
  externalMessageId: text,
  inReplyToMessageId: integer,
  attachments: jsonb,
  aiResponseMetadata: jsonb,
  deliveryStatus: text,
  deliveryError: text,
  createdAt: timestamp,
}
```

#### 21. agent_inboxes
```typescript
{
  id: serial PK,
  agentMailInboxId: text,
  emailAddress: text,
  twilioPhoneNumber: text,
  isActive: boolean DEFAULT true,
  welcomeMessage: text,
  autoReplyEnabled: boolean DEFAULT true,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

#### 22. scout_applications
```typescript
{
  id: serial PK,
  userId: varchar UNIQUE,
  name: text,
  email: text,
  linkedinUrl: text,
  experience: text,
  motivation: text,
  dealflowSources: text,
  status: scoutApplicationStatusEnum DEFAULT "pending",
  reviewedBy: varchar,
  reviewNotes: text,
  reviewedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

#### 23. attachment_downloads (Replit debugging - REMOVE)
```typescript
{
  id: serial PK,
  inboxId: text,
  messageId: text,
  attachmentId: text,
  filename: text,
  contentType: text,
  downloadUrl: text,
  status: text DEFAULT "pending",
  errorMessage: text,
  savedPath: text,
  fileSize: integer,
  createdAt: timestamp,
  completedAt: timestamp,
}
```

#### 24. conversations (Chat - optional)
```typescript
{
  id: serial PK,
  title: text,
  createdAt: timestamp,
}
```

#### 25. messages (Chat - optional)
```typescript
{
  id: serial PK,
  conversationId: integer FK -> conversations.id CASCADE,
  role: text,
  content: text,
  createdAt: timestamp,
}
```

---

## Types & Interfaces

### Scoring Types

```typescript
type ScoringWeights = {
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

type ScoringRationale = {
  team: string;
  market: string;
  product: string;
  traction: string;
  businessModel: string;
  gtm: string;
  financials: string;
  competitiveAdvantage: string;
  legal: string;
  dealTerms: string;
  exitPotential: string;
};

type SectionScores = {
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
```

### LinkedIn Types

```typescript
interface LinkedInProfileData {
  name: string;
  headline: string;
  summary: string;
  location: string;
  currentPosition: string;
  currentCompany: string;
  yearsExperience: number | null;
  education: string[];
  previousCompanies: string[];
  skills: string[];
  profilePictureUrl?: string;
  experienceDetails: {
    company: string;
    position: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    duration: string;
    description: string;
    isCurrent?: boolean;
  }[];
  educationDetails: {
    school: string;
    degree?: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
  }[];
}
```

### Web Research Types

```typescript
interface WebPageContent {
  url: string;
  title: string;
  description: string;
  mainContent: string;
  links: { text: string; href: string }[];
  headings: string[];
  error?: string;
}

interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface TavilySearchResponse {
  query: string;
  results: WebSearchResult[];
  answer?: string;
}

interface StartupResearchContext {
  specificMarket: string;
  targetCustomers: string;
  productDescription: string;
  knownCompetitors: string[];
  claimedTam: string | null;
  claimedGrowth: string | null;
  geographicFocus: string;
  businessModel: string;
  fundingStage: string;
}
```

### Analysis Progress Types

```typescript
interface AnalysisProgress {
  currentStage: number;
  currentStageLabel: string;
  completedAgents: string[];
  currentAgent: string | null;
  startedAt: string;
  lastUpdatedAt: string;
  stageProgress: {
    stage: number;
    label: string;
    status: "pending" | "running" | "completed";
    startedAt?: string;
    completedAt?: string;
  }[];
}
```

### Team Evaluation Types

```typescript
interface TeamMemberEvaluation {
  name: string;
  role: string;
  linkedinUrl: string;
  linkedinAnalysis: {
    currentPosition: string;
    company: string;
    yearsExperience: number;
    education: string[];
    previousCompanies: string[];
    skills: string[];
    relevantExperience: string;
    strengthsForRole: string[];
    potentialConcerns: string[];
    founderFitScore: number;
  } | null;
}

interface TeamComposition {
  hasBusinessLeader: boolean;
  hasTechnicalLeader: boolean;
  hasIndustryExpert: boolean;
  teamBalance: string;
  gapsIdentified: string[];
}
```

---

## Third-Party Integrations

### 1. Unipile (LinkedIn)

**Purpose:** LinkedIn profile fetching and enrichment

**Environment Variables:**
```
UNIPILE_DSN
UNIPILE_API_KEY
UNIPILE_ACCOUNT_ID
```

**Functions:**
- `fetchLinkedInProfile(linkedinUrl, skipCache?)` - Fetch profile by URL
- `searchLinkedInByName(name, companyName?, website?)` - Search by name
- `isUnipileConfigured()` - Check if configured

**Cache:** 7 days in `linkedin_profile_cache` table

---

### 2. OpenAI (Web Search + LLM)

**Purpose:** Web search via OpenAI Responses API + LLM calls

**Environment Variables:**
```
AI_INTEGRATIONS_OPENAI_API_KEY
AI_INTEGRATIONS_OPENAI_BASE_URL (optional)
```

**Functions:**
- `openaiWebSearch(query, options)` - Web search
- `tavilySearch(query, options)` - Wrapper (uses OpenAI)
- `extractResearchContext(...)` - Extract context from deck/website
- `researchCompany(...)` - Full company research pipeline

---

### 3. Cheerio (Web Scraping)

**Purpose:** HTML parsing for website scraping

**Functions:**
- `scrapeWebpage(url)` - Scrape single page
- `scrapeMultiplePages(baseUrl, pagesToScrape)` - Scrape multiple pages

---

### 4. Replit Object Storage (REPLACE with R2)

**Purpose:** File storage for uploads

**Current Implementation:**
- Uses Replit Object Storage SDK
- Presigned URL pattern for uploads

**Migration Target:** Cloudflare R2
- Same presigned URL pattern
- S3-compatible API

---

### 5. AgentMail (Email - Replit Connector - REPLACE)

**Purpose:** Email inbox and sending for communication agent

**Environment Variables:**
```
AGENTMAIL_API_KEY (via Replit connector)
```

**Functions:**
- `sendEmail(inboxId, to, subject, body, inReplyTo?)`
- `getFullMessage(inboxId, messageId)`
- `downloadAttachment(inboxId, messageId, attachmentId, filename, contentType)`
- `createInbox(name, webhookUrl)`
- `listWebhooks()`, `deleteWebhook(id)`

**Migration Target:** Resend
- Email sending + webhooks
- Simpler API

---

### 6. Twilio (WhatsApp - Replit Connector - REPLACE)

**Purpose:** WhatsApp messaging for communication agent

**Environment Variables:**
```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
```

**Functions:**
- `sendWhatsAppMessage(to, body)`
- `validateTwilioWebhook(req)` - Webhook validation

**Migration:** Document for future implementation

---

### 7. PDF Generation (PDFKit)

**Purpose:** Generate investment memos and reports

**Functions:**
- `generateStartupMemoPDF(startup, evaluation, userWatermark)`
- `generateStartupReportPDF(startup, evaluation, userWatermark)`

**Keep:** Works standalone, no migration needed

---

## Summary

**Tables to Keep:** 22 (remove sessions, attachment_downloads)

**API Endpoints:** ~80 routes across 8 categories

**Third-Party Integrations:**
- Unipile (LinkedIn) - Keep
- OpenAI (LLM + Web Search) - Keep
- Cheerio (Scraping) - Keep
- PDFKit (PDF) - Keep
- Replit Object Storage - Replace with R2
- AgentMail - Replace with Resend
- Twilio WhatsApp - Document for future
