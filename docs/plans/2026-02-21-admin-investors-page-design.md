# Admin Investors Page — Design Document

**Date:** 2026-02-21
**Status:** Approved

## Overview

Read-only admin page to monitor investor profiles, investment thesis, matched startups, and scoring preferences. List + side panel (inbox-style) layout.

## Backend API

### `GET /admin/investors` — List all investors

Response:
```json
{
  "investors": [{
    "userId": "string",
    "fundName": "string | null",
    "aum": "string | null",
    "teamSize": "number | null",
    "website": "string | null",
    "logoUrl": "string | null",
    "industries": "string[]",
    "stages": "string[]",
    "checkSizeMin": "number | null",
    "checkSizeMax": "number | null",
    "thesisSummary": "string | null",
    "hasThesis": "boolean",
    "matchCount": "number",
    "thesisSummaryGeneratedAt": "string | null",
    "createdAt": "string"
  }]
}
```

Joins: `users` (role=investor) + `investorProfile` + `investorThesis` + count from `startupMatch`.

### `GET /admin/investors/:userId` — Full investor detail

Response:
```json
{
  "profile": {
    "fundName": "string | null",
    "aum": "string | null",
    "teamSize": "number | null",
    "website": "string | null",
    "logoUrl": "string | null"
  },
  "thesis": {
    "industries": "string[]",
    "stages": "string[]",
    "checkSizeMin": "number | null",
    "checkSizeMax": "number | null",
    "geographicFocus": "string[]",
    "businessModels": "string[]",
    "mustHaveFeatures": "string[]",
    "dealBreakers": "string[]",
    "thesisNarrative": "string | null",
    "antiPortfolio": "string | null",
    "thesisSummary": "string | null",
    "fundSize": "number | null",
    "notes": "string | null",
    "isActive": "boolean",
    "thesisSummaryGeneratedAt": "string | null"
  },
  "matches": [{
    "startupId": "string",
    "startupName": "string",
    "overallScore": "number",
    "thesisFitScore": "number | null",
    "fitRationale": "string | null",
    "status": "new | reviewing | engaged | closed | passed",
    "statusChangedAt": "string | null",
    "isSaved": "boolean",
    "matchReason": "string | null",
    "createdAt": "string"
  }],
  "scoringPreferences": [{
    "stage": "string",
    "useCustomWeights": "boolean",
    "customWeights": "ScoringWeights | null"
  }]
}
```

Both endpoints live in `AdminInvestorService` within the admin module.

## Frontend

### Route

`frontend/src/routes/_protected/admin/investors.tsx`

### Page Layout

- **Header:** "Investors" title + description + search input
- **Table:** Fund Name, AUM, Industries (badges), Stages (badges), Match Count, Thesis Status
- **Row click → Sheet (right panel)** with 3 tabs:

#### Tab 1: Profile & Thesis
- Fund info card (name, AUM, team size, website)
- AI Thesis Summary block
- Industries, stages, check size range as badges
- Geographic focus, business models
- Deal breakers, must-have features
- Thesis narrative (if present)

#### Tab 2: Matched Startups
- Table: Startup Name, Overall Score, Thesis Fit Score, Status, Date
- Expandable rows showing fit rationale

#### Tab 3: Scoring Preferences
- List of stages with custom vs default indicator
- Weight breakdown per customized stage

### Sidebar Nav

Add "Investors" entry with `UserRoundSearch` icon between "Users" and "Scouts" in admin nav.

### Components Used

- shadcn: Card, Badge, Sheet, Tabs, Skeleton, Input, ScrollArea
- Existing DataTable or hand-written table
- Orval-generated hooks after API creation

## Non-Goals

- No editing/management actions (read-only)
- No activity timeline
- No server-side pagination (investor count expected < 100)
