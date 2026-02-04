# Inside Line AI - Frontend Architecture Extraction

Complete map of pages, modals, dialogs, and components for migration reference.

---

## Router Structure (App.tsx)

### Routes Overview
```
/                          → Landing (public)
/role-select               → Role Selection (authenticated, no role)
/founder                   → Founder Dashboard
/founder/submit            → Founder Startup Submission
/founder/startup/:id       → Founder Startup Detail
/investor                  → Investor Dashboard
/investor/thesis           → Investment Thesis Form
/investor/portal           → White-label Portal Config
/investor/scoring          → Custom Scoring Weights
/investor/submit           → Private Analysis Submission
/investor/startup/:id      → Investor Startup Detail
/admin                     → Admin Dashboard
/admin/startup/:id         → Admin Review Page
/admin/analytics           → Platform Analytics
/admin/users               → User Management
/admin/agents              → Agent Prompt Editor
/admin/scoring             → Platform Scoring Weights
/admin/conversations       → AI Conversations
/admin/scouts              → Scout Applications
/scout                     → Scout Dashboard
/scout/apply               → Scout Application Form
/scout/submit              → Scout Startup Submission
/apply/:slug               → Public Portal Submission
/profile                   → User Profile
```

### Layout Structure
Each role has its own authenticated layout with role-specific sidebar:
- `AuthenticatedLayout` - Wraps all authenticated pages
- `RoleSidebar` - Role-specific navigation based on `role` prop

---

## Page-by-Page Documentation

### Public Pages

#### 1. Landing Page (`landing.tsx`)
**Route:** `/`
**Purpose:** Marketing homepage for unauthenticated users

**Features:**
- Hero section with CTAs for founders and investors
- Value propositions section
- Investor benefits section
- Scout recruitment section
- Auto-redirects authenticated users to their dashboard

**Key Components:**
- ThemeToggle
- Button (CTAs)
- Card (feature cards)

**Data Dependencies:** None (static content)

---

#### 2. Role Selection (`role-select.tsx`)
**Route:** `/role-select`
**Purpose:** New user chooses their role after first login

**Features:**
- Two cards: Founder and Investor options
- On selection, calls `POST /api/auth/set-role`
- Redirects to respective dashboard

**Data Dependencies:**
- `GET /api/auth/user` - Check if user exists
- `POST /api/auth/set-role` - Set selected role

---

### Founder Pages

#### 3. Founder Dashboard (`founder-dashboard.tsx`)
**Route:** `/founder`
**Purpose:** List of founder's startups (drafts and submitted)

**Features:**
- Stats cards: Drafts, Submitted, Analyzing, Completed
- Drafts section with resume/delete actions
- Submitted startups with status badges
- Search and filters (SearchAndFilters component)
- Real-time analysis progress tracking
- Toast notifications when analysis completes

**Key Components:**
- ScoreRing - Overall score display
- StatusBadge - Startup status indicator
- AnalysisProgressBar - Progress during analysis
- SearchAndFilters - Search/filter controls
- StartupListSkeleton - Loading state

**Data Dependencies:**
- `GET /api/startups` - List founder's startups
- `DELETE /api/startups/:id/draft` - Delete draft

---

#### 4. Founder Submit (`founder-submit.tsx`)
**Route:** `/founder/submit`
**Purpose:** Multi-step startup submission form

**Features:**
- Uses shared StartupSubmitForm component
- Draft saving enabled
- Redirects to dashboard on submit

**Key Components:**
- StartupSubmitForm (shared component)

**Data Dependencies:**
- `POST /api/startups` - Submit startup
- `PUT /api/startups/:id/draft` - Save draft
- `GET /api/startups/drafts` - Load existing draft

---

### Investor Pages

#### 5. Investor Dashboard (`investor-dashboard.tsx`)
**Route:** `/investor`
**Purpose:** Deal flow management for investors

**Features:**
- Private analysis section (investor's own submissions)
- Stats cards: Total Matches, Reviewing, Interested, Passed
- Tabs for match status filtering
- Custom scoring weights integration
- Thesis alignment scores displayed
- Real-time polling for analyzing startups

**Key Components:**
- ScoreRing - Overall/personalized score
- StatusBadge - Startup status
- AnalysisProgressBar - Progress indicator
- SearchAndFilters - Search/filter controls

**Data Dependencies:**
- `GET /api/investor/startups` - Private analyses
- `GET /api/investor/matched-startups` - Matched deals
- `GET /api/investor/stats` - Dashboard stats
- `GET /api/investor/scoring-preferences` - Custom weights
- `PUT /api/investor/matched-startups/:id/status` - Update match status

---

#### 6. Investment Thesis (`investor-thesis.tsx`)
**Route:** `/investor/thesis`
**Purpose:** Define investment thesis for matching

**Features:**
- Stage preferences (Pre-Seed through Series F+)
- Check size range configuration
- Sector/industry selection (multi-select)
- Geographic focus selection
- Business model preferences
- Fund information fields
- Thesis narrative textarea
- Anti-portfolio definition

**Key Components:**
- Custom multi-select components
- Industry selector
- TwoLevelIndustrySelector

**Data Dependencies:**
- `GET /api/investor/thesis` - Load existing thesis
- `PUT /api/investor/thesis` - Save thesis
- Triggers InvestorThesisAgent on save

---

#### 7. Investor Portal (`investor-portal.tsx`)
**Route:** `/investor/portal`
**Purpose:** Configure white-label submission portal

**Features:**
- Portal URL slug configuration
- Enable/disable toggle
- Branding customization:
  - Tagline
  - Welcome message
  - Accent color picker
- Copy link functionality
- Preview button (opens portal in new tab)

**Data Dependencies:**
- `GET /api/investor/portal` - Load portal config
- `PUT /api/investor/portal` - Save config

---

#### 8. Investor Scoring (`investor-scoring.tsx`)
**Route:** `/investor/scoring`
**Purpose:** Configure custom scoring weights per stage

**Features:**
- Tabs for each funding stage
- Toggle between platform defaults and custom weights
- 11 section weight sliders:
  - Team, Market, Product, Traction
  - Business Model, GTM, Financials
  - Competitive Advantage, Legal
  - Deal Terms, Exit Potential
- Weights must sum to 100%

**Key Components:**
- Tabs for stage selection
- Slider components for weights
- Switch for custom weights toggle

**Data Dependencies:**
- `GET /api/scoring-weights` - Platform defaults
- `GET /api/investor/scoring-preferences` - Investor's custom
- `PUT /api/investor/scoring-preferences` - Save preferences

---

#### 9. Investor Submit (`investor-submit.tsx`)
**Route:** `/investor/submit`
**Purpose:** Submit startup for private analysis

**Features:**
- Uses shared StartupSubmitForm component
- Labels analysis as "private" for investor

**Key Components:**
- StartupSubmitForm (shared)

**Data Dependencies:**
- `POST /api/investor/startups` - Submit for private analysis

---

### Admin Pages

#### 10. Admin Dashboard (`admin-dashboard.tsx`)
**Route:** `/admin`
**Purpose:** Review queue for startup submissions

**Features:**
- Stats cards: Pending, Analyzing, Approved, Rejected, Investors, Matches
- Tabs for status filtering
- Search and filters
- Real-time polling for analyzing startups
- Toast notifications on analysis completion

**Key Components:**
- ScoreRing, StatusBadge
- AnalysisProgressBar
- SearchAndFilters
- StatsGridSkeleton, StartupListSkeleton

**Data Dependencies:**
- `GET /api/admin/startups` - All startups
- `GET /api/admin/stats` - Dashboard stats

---

#### 11. Admin Review (`admin-review.tsx`)
**Route:** `/admin/startup/:id`
**Purpose:** Detailed review page with approve/reject actions

**Features:**
- Comprehensive startup detail view
- Editable fields (inline editing):
  - Name, website, description
  - Stage, sector, location
  - Round details, valuation
  - Contact information
  - Previous funding history
- Score override capability
- Admin notes field
- Approve/reject actions with confirmation dialogs
- Re-analyze button (triggers new analysis)
- PDF download (Memo and Report)
- All 11 evaluation sections displayed

**Dialogs/Modals:**
- AlertDialog for approve confirmation
- AlertDialog for reject confirmation
- Industry selector dialog (TwoLevelIndustrySelector)

**Key Components:**
- ScoreRing, StatusBadge
- AnalysisProgress
- MemoSection (11 sections)
- TeamGrid
- CompetitorAnalysis
- TeamCompositionSummary
- ProductTabContent
- FundingRoundCard

**Data Dependencies:**
- `GET /api/admin/startups/:id` - Startup details
- `PUT /api/admin/startups/:id` - Update startup
- `POST /api/admin/startups/:id/approve` - Approve
- `POST /api/admin/startups/:id/reject` - Reject
- `POST /api/admin/startups/:id/analyze` - Re-analyze
- `GET /api/startups/:id/memo.pdf` - Download memo
- `GET /api/startups/:id/report.pdf` - Download report

---

#### 12. Admin Analytics (`admin-analytics.tsx`)
**Route:** `/admin/analytics`
**Purpose:** Platform-wide metrics and insights

**Features:**
- Stats cards:
  - Total Startups
  - Pending Review
  - Approved
  - Rejected
  - Total Users (breakdown by role)
  - Average Score
  - Approval Rate

**Data Dependencies:**
- `GET /api/admin/analytics` - Analytics data

---

#### 13. Admin Users (`admin-users.tsx`)
**Route:** `/admin/users`
**Purpose:** View all platform users

**Features:**
- User list with avatars
- Role badges (admin, investor, founder, scout)
- Company/title display
- Join date

**Data Dependencies:**
- `GET /api/admin/users` - All user profiles

---

#### 14. Admin Agents (`admin-agents.tsx`)
**Route:** `/admin/agents`
**Purpose:** Edit AI agent prompts

**Features:**
- Visual 5-stage pipeline diagram
- Agent boxes grouped by stage:
  - Stage 1: Data Extraction (visual only)
  - Stage 2: LinkedIn Research (visual only)
  - Stage 3: Research agents (4)
  - Stage 4: Evaluation agents (11 + orchestrator + synthesis)
  - Stage 5: Investor matching agents (2)
- Click agent to open editor panel

**Dialogs/Modals:**
- Sheet (side panel) for agent editing:
  - System prompt textarea
  - Human prompt textarea
  - Description field
  - Variable highlighting
  - Inputs/Outputs view
  - Preview tab

**Key Components:**
- AgentBox - Clickable agent representation
- AgentEditorPanel - Sheet for editing
- VariableHighlighter - Highlights {variables}

**Data Dependencies:**
- `GET /api/admin/agents` - All agent prompts
- `PUT /api/admin/agents/:key` - Update agent
- `POST /api/admin/agents/seed` - Initialize defaults

---

#### 15. Admin Scoring (`admin-scoring.tsx`)
**Route:** `/admin/scoring`
**Purpose:** Configure platform-wide scoring weights

**Features:**
- Tabs for each funding stage (8 stages)
- Weight editor per stage:
  - 11 section weights (must sum to 100%)
  - Rationale field for each section
  - Overall philosophy textarea
- Initialize defaults button

**Key Components:**
- WeightEditor - Weight/rationale form
- Table for section weights

**Data Dependencies:**
- `GET /api/admin/scoring-weights` - All weights
- `PUT /api/admin/scoring-weights/:stage` - Update weights
- `POST /api/admin/scoring-weights/seed` - Initialize defaults

---

#### 16. Admin Conversations (`admin-conversations.tsx`)
**Route:** `/admin/conversations`
**Purpose:** Manage AI agent conversation threads

**Features:**
- Conversations grouped by startup
- Channel indicator (Email/WhatsApp)
- Message count and last message preview
- Delete conversation with confirmation

**Dialogs/Modals:**
- AlertDialog for delete confirmation

**Data Dependencies:**
- `GET /api/admin/conversations` - All conversations
- `DELETE /api/admin/conversations/:id` - Delete

---

#### 17. Admin Scouts (`admin-scouts.tsx`)
**Route:** `/admin/scouts`
**Purpose:** Review scout applications

**Features:**
- Stats cards: Pending, Approved, Rejected
- Tabs for status filtering
- Application cards with details
- Review dialog with approve/reject

**Dialogs/Modals:**
- Dialog for reviewing applications:
  - Application details display
  - Review notes textarea
  - Approve/Reject buttons

**Data Dependencies:**
- `GET /api/admin/scout-applications` - All applications
- `PATCH /api/admin/scout-applications/:id` - Review decision

---

### Scout Pages

#### 18. Scout Apply (`scout-apply.tsx`)
**Route:** `/scout/apply`
**Purpose:** Application form to become a scout

**Features:**
- Application form fields:
  - Name, Email
  - LinkedIn URL
  - Experience textarea
  - Motivation textarea
  - Deal sources textarea
- Shows existing application status if already applied
- Redirects to dashboard if already approved

**Data Dependencies:**
- `GET /api/scout/application` - Existing application
- `POST /api/scout/apply` - Submit application

---

#### 19. Scout Dashboard (`scout-dashboard.tsx`)
**Route:** `/scout`
**Purpose:** List of scout's submitted startups

**Features:**
- Stats cards: Total, In Review, Approved, Rejected
- Startup list with status badges
- Submit new startup button

**Data Dependencies:**
- `GET /api/scout/startups` - Scout's submissions

---

#### 20. Scout Submit (`scout-submit.tsx`)
**Route:** `/scout/submit`
**Purpose:** Submit startup as a scout

**Features:**
- Uses shared StartupSubmitForm component
- Configured for scout role

**Data Dependencies:**
- `POST /api/scout/startups` - Submit startup

---

### Shared Pages

#### 21. Startup Detail (`startup-detail.tsx`)
**Route:** `/founder/startup/:id`, `/investor/startup/:id`
**Purpose:** Detailed view of a startup with evaluation

**Features:**
- Reusable component with `basePath` prop
- Header with status, website link, sector badge
- Score ring with percentile (investors only)
- Tabbed content:
  - Summary: Deal info, thesis alignment, strengths/risks
  - Memo (investors): All 11 evaluation sections
  - Insights (founders): Founder-focused feedback
  - Product: Product analysis details
  - Team: LinkedIn-enriched profiles
  - Competitors (investors): Competitive landscape
  - Sources (investors): Data sources list
- Sidebar:
  - Quick stats
  - Document list with preview
  - Links section
  - Pitch deck preview

**Dialogs/Modals:**
- DocumentPreviewDialog - PDF/image preview

**Key Components:**
- ScoreRing, StatusBadge
- AnalysisProgress
- MemoSection (11 sections)
- TeamGrid, TeamCompositionSummary
- CompetitorAnalysis
- ProductTabContent, InsightsTabContent

**Data Dependencies:**
- `GET /api/startups/:id` (founder)
- `GET /api/investor/startups/:id` (investor)
- `GET /api/scoring-weights` - For section weights
- `GET /api/investor/scoring-preferences` - Custom weights

---

#### 22. Public Apply (`public-apply.tsx`)
**Route:** `/apply/:slug`
**Purpose:** White-label submission portal (public)

**Features:**
- Loads portal branding from investor config
- Displays investor logo, fund name, tagline
- Shows welcome message
- Uses StartupSubmitForm with portal config
- Success confirmation after submission
- No authentication required

**Data Dependencies:**
- `GET /api/portal/:slug` - Portal configuration
- `POST /api/portal/:slug/apply` - Submit startup

---

#### 23. Profile (`profile.tsx`)
**Route:** `/profile`
**Purpose:** User profile management

**Features:**
- Display user info (avatar, name, email, role)
- Editable profile fields:
  - Company name
  - Title
  - LinkedIn URL
  - Bio
- Team management (investors only):
  - Invite team members by email
  - View pending invites
  - Remove team members

**Key Components:**
- TeamInviteSection - Team management for investors

**Data Dependencies:**
- `GET /api/auth/user` - Current user
- `GET /api/profile` - User profile
- `PATCH /api/profile` - Update profile
- `GET /api/investor/team` - Team data (investors)
- `POST /api/investor/team/invite` - Send invite
- `DELETE /api/investor/team/invite/:id` - Cancel invite
- `DELETE /api/investor/team/member/:id` - Remove member

---

#### 24. Not Found (`not-found.tsx`)
**Route:** `*`
**Purpose:** 404 error page

**Features:**
- Simple 404 display
- Developer-oriented message

---

## Core Components

### Visualization Components

#### ScoreRing (`ScoreRing.tsx`)
Circular score visualization with color coding.
- Props: `score`, `size`, `showLabel`
- Color ranges: 0-40 (red), 40-60 (orange), 60-80 (yellow), 80-100 (green)

#### StatusBadge (`StatusBadge.tsx`)
Badge displaying startup status with appropriate colors.
- Props: `status`
- Statuses: draft, submitted, analyzing, pending_review, approved, rejected

#### AnalysisProgress (`AnalysisProgress.tsx`)
Full analysis progress display with agent-level tracking.
- Props: `startupId`, `isAnalyzing`, `weights`
- Shows stage progress, current agent, time elapsed

#### AnalysisProgressBar (`AnalysisProgressBar.tsx`)
Compact progress bar for list views.
- Props: `startupId`
- Shows percentage and current stage

---

### Form Components

#### StartupSubmitForm (`StartupSubmitForm.tsx`)
Reusable multi-step startup submission form.
- Props: `userRole`, `redirectPath`, `apiEndpoint`, `enableDraftSaving`, `portalSlug`, `portalRequiredFields`, `onSuccess`
- Steps:
  1. Company basics (name, website, description)
  2. Industry & stage
  3. Team members
  4. Deal terms (round size, valuation, raise type)
  5. Documents (pitch deck, files)
- Features: Draft saving, file upload, validation

#### TwoLevelIndustrySelector (`TwoLevelIndustrySelector.tsx`)
Hierarchical industry selection.
- Props: `selectedGroup`, `selectedIndustry`, `onGroupChange`, `onIndustryChange`
- Groups: Software, Consumer, Healthcare, Fintech, etc.

#### CurrencyInput (`CurrencyInput.tsx`)
Formatted currency input with selector.
- Props: `value`, `currency`, `onChange`

#### ObjectUploader (`ObjectUploader.tsx`)
File upload component using Uppy.
- Props: `onUploadComplete`, `maxFiles`, `allowedFileTypes`
- Supports: PDF, images, documents

---

### Analysis Display Components

#### MemoSection (`MemoSection.tsx`)
Expandable memo section with score.
- Props: `title`, `icon`, `score`, `weight`, `summary`, `evaluationNote`, `details`, `animateOnMount`

#### TeamGrid (`TeamProfile.tsx`)
Grid display of team members with LinkedIn data.
- Props: `members`, `showTimelines`
- Shows: Name, role, photo, headline, experience timeline, education

#### TeamCompositionSummary (`TeamCompositionSummary.tsx`)
Team analysis summary card.
- Props: `teamScore`, `teamComposition`, `keyStrengths`, `keyRisks`, `weight`

#### CompetitorAnalysis (`CompetitorAnalysis.tsx`)
Comprehensive competitor landscape display.
- Props: `directCompetitors`, `indirectCompetitors`, `hyperscalers`, etc.
- Sections: Product definition, direct/indirect competitors, barriers to entry

#### ProductTabContent (`startup-view/ProductTabContent.tsx`)
Product analysis tab content.
- Props: `startup`, `evaluation`, `productWeight`
- Shows: Product data, market fit, differentiation

#### InsightsTabContent (`startup-view/InsightsTabContent.tsx`)
Founder-focused insights display.
- Props: `evaluation`
- Shows: Actionable recommendations, improvement areas

---

### Filter & Search Components

#### SearchAndFilters (`SearchAndFilters.tsx`)
Search input with filter dropdowns.
- Props: `filters`, `onFiltersChange`, `showScoreFilter`, `placeholder`
- Filters: Search, stage, score range, status

---

### Layout Components

#### ThemeProvider (`ThemeProvider.tsx`)
Theme context provider for light/dark mode.

#### ThemeToggle (`ThemeToggle.tsx`)
Light/dark mode toggle button.

#### NotificationCenter (`NotificationCenter.tsx`)
Notification dropdown for user notifications.

---

## shadcn/ui Components Used

All from `/client/src/components/ui/`:
- **Layout:** Card, Dialog, Sheet, Tabs, Accordion, Collapsible
- **Forms:** Input, Textarea, Select, Checkbox, Switch, RadioGroup, Slider
- **Feedback:** Alert, AlertDialog, Toast, Progress, Skeleton
- **Navigation:** Button, DropdownMenu, NavigationMenu, Menubar
- **Display:** Badge, Avatar, Tooltip, HoverCard, Popover
- **Data:** Table, ScrollArea, Separator

---

## Hooks

### Custom Hooks (`/client/src/hooks/`)

#### useToast
Toast notification system.
```typescript
const { toast } = useToast();
toast({ title: "Success", description: "..." });
```

#### useFilteredStartups
Filters startup list based on filter state.
```typescript
const filtered = useFilteredStartups(startups, filters);
```

---

## Data Fetching Pattern

All pages use TanStack Query (React Query):

```typescript
// Basic query
const { data, isLoading, error } = useQuery<DataType>({
  queryKey: ["/api/endpoint"],
  refetchInterval: (query) => {
    // Conditional polling (e.g., during analysis)
    return data?.status === "analyzing" ? 5000 : false;
  },
});

// Mutation
const mutation = useMutation({
  mutationFn: async (data) => {
    return apiRequest("POST", "/api/endpoint", data);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/endpoint"] });
    toast({ title: "Success" });
  },
});
```

---

## Migration Notes

### Keep As-Is
- TanStack Query setup
- shadcn/ui components
- Score visualization components
- Form validation with zod

### Update for Migration
1. **Routing:** Replace Wouter with TanStack Router
2. **Auth:** Replace Replit Auth checks with new auth context
3. **API Calls:** Update endpoints for NestJS structure
4. **File Upload:** Update to use R2 presigned URLs

### Component Reuse
Most components can be migrated directly:
- Copy `/components/ui/` entirely
- Copy custom components (ScoreRing, StatusBadge, etc.)
- Update imports for new structure

### Page Migration Priority
1. Auth pages (login, callback)
2. Role selection
3. Founder flow (dashboard, submit, detail)
4. Investor flow (dashboard, thesis, detail)
5. Admin flow (dashboard, review, agents, scoring)
6. Scout flow (apply, dashboard, submit)
7. Profile and settings
