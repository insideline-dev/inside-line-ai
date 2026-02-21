# Bug Fixes Batch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 7 reported issues across the AI pipeline output, scraping, and frontend display.

**Architecture:** Backend fixes for synthesis schema (structured investorMemo/founderReport), scraping team filter relaxation, scraper page coverage improvements, and prompt tweaks. Frontend fixes for score rounding and team member editing UI in admin panel.

**Tech Stack:** NestJS, Zod schemas, React/TypeScript frontend, Drizzle ORM, Bun test runner

---

## Task 1: Score Rounding — Add Math.round() to 9 frontend locations

**Priority:** MEDIUM | **Effort:** 10 min | **Risk:** None

This is the simplest fix — 9 locations displaying raw decimal scores need `Math.round()`.

**Files:**
- Modify: `frontend/src/components/ProductScoreSummary.tsx:72,141`
- Modify: `frontend/src/components/MemoSection.tsx:126`
- Modify: `frontend/src/components/startup-view/AdminReviewSidebar.tsx:60,143`
- Modify: `frontend/src/components/startup-view/AdminSummaryTab.tsx:102,222`
- Modify: `frontend/src/components/startup-view/SummaryCard.tsx:105,217`

**Step 1: Apply all rounding fixes**

In `ProductScoreSummary.tsx`:
- Line 72: `{productScore}` → `{Math.round(productScore)}`
- Line 141: `{normalizedMoatStrength}/100` → `{Math.round(normalizedMoatStrength)}/100`

In `MemoSection.tsx`:
- Line 126: `Score: {score}/100` → `Score: {Math.round(score)}/100`

In `AdminReviewSidebar.tsx`:
- Line 60: `` `Top ${100 - startup.percentileRank}%` `` → `` `Top ${Math.round(100 - startup.percentileRank)}%` ``
- Line 143: `` `${score}/100` `` → `` `${Math.round(score)}/100` ``

In `AdminSummaryTab.tsx`:
- Line 102: `` `Top ${100 - startup.percentileRank}%` `` → `` `Top ${Math.round(100 - startup.percentileRank)}%` ``
- Line 222: `{row.score}` → `{Math.round(row.score)}`

In `SummaryCard.tsx`:
- Line 105: `Top {100 - startup.percentileRank}%` → `Top {Math.round(100 - startup.percentileRank)}%`
- Line 217: `{sectionScore}` → `{Math.round(sectionScore)}`

**Step 2: Type-check frontend**

Run: `cd frontend && bunx tsc --noEmit`
Expected: zero errors

**Step 3: Commit**

```bash
git add frontend/src/components/ProductScoreSummary.tsx frontend/src/components/MemoSection.tsx frontend/src/components/startup-view/AdminReviewSidebar.tsx frontend/src/components/startup-view/AdminSummaryTab.tsx frontend/src/components/startup-view/SummaryCard.tsx
git commit -m "fix(ui): round all score and percentile displays to integers"
```

---

## Task 2: Memo Score Leakage — Add prompt instruction to exclude scores from narratives

**Priority:** MEDIUM | **Effort:** 15 min | **Risk:** Low

AI evaluation agents are embedding "score is X with confidence Y" inside narrative text. Fix: add explicit instruction to all 11 evaluation prompts in the catalog.

**Files:**
- Modify: `backend/src/modules/ai/services/ai-prompt-catalog.ts`

**Step 1: Add "no scores in narratives" instruction to shared narrative section**

In `ai-prompt-catalog.ts`, find the `## Narrative Fields` section that exists in each of the 11 evaluation agent entries (`evaluation.team` through `evaluation.exitPotential`). Add this line at the end of each `## Narrative Fields` block, before the closing `].join("\n")`:

```typescript
"",
"## IMPORTANT: Narrative Purity",
"Do NOT mention the numeric score, confidence level, or any 'X/100' rating in narrativeSummary, memoNarrative, or feedback fields.",
"These are separate structured fields displayed as badges in the UI. Narratives must contain only qualitative analysis.",
```

This must be added to ALL 11 evaluation agents:
- `evaluation.team` (~line 405)
- `evaluation.market`
- `evaluation.product`
- `evaluation.traction`
- `evaluation.businessModel`
- `evaluation.gtm`
- `evaluation.financials`
- `evaluation.competitiveAdvantage`
- `evaluation.legal`
- `evaluation.dealTerms`
- `evaluation.exitPotential`

**Step 2: Type-check backend**

Run: `cd backend && bunx tsc --noEmit`
Expected: zero errors

**Step 3: Commit**

```bash
git add backend/src/modules/ai/services/ai-prompt-catalog.ts
git commit -m "fix(prompts): instruct evaluation agents to exclude scores from narrative text"
```

**Note:** After deploying, run the reseed endpoint `POST /api/admin/ai-prompts/reseed-from-code` to push updated prompts to DB.

---

## Task 3: Team Member Filter — Relax verification to keep members without LinkedIn enrichment

**Priority:** HIGH | **Effort:** 20 min | **Risk:** Low

Currently `scraping.service.ts:322-335` drops ALL discovered team members unless `enrichmentStatus === "success"`. This means if Unipile is not configured, only submitted members survive. Fix: keep members from trusted sources (deck extraction, website bios) even without LinkedIn verification.

**Files:**
- Modify: `backend/src/modules/ai/services/scraping.service.ts:322-335`
- Test: `backend/src/modules/ai/tests/services/scraping.service.spec.ts`

**Step 1: Update the verification filter**

In `scraping.service.ts`, replace lines 322-335:

```typescript
// OLD CODE (lines 322-335):
const droppedUnverifiedTeamMembers = enrichedTeam.filter((member) => {
  const isSubmittedMember = submittedNames.has(member.name.trim().toLowerCase());
  if (isSubmittedMember) {
    return false;
  }
  return member.enrichmentStatus !== "success";
});
const verifiedTeamMembers = enrichedTeam.filter((member) => {
  const isSubmittedMember = submittedNames.has(member.name.trim().toLowerCase());
  if (isSubmittedMember) {
    return true;
  }
  return member.enrichmentStatus === "success";
});
```

Replace with:

```typescript
// Keep members from trusted sources even without LinkedIn verification
const trustedSources = new Set(["submitted", "deck", "website", "enrichment"]);
const droppedUnverifiedTeamMembers = enrichedTeam.filter((member) => {
  const isSubmittedMember = submittedNames.has(member.name.trim().toLowerCase());
  if (isSubmittedMember) return false;
  if (member.enrichmentStatus === "success") return false;
  // Keep members from trusted discovery sources
  if (member.teamMemberSource && trustedSources.has(member.teamMemberSource)) return false;
  return true;
});
const verifiedTeamMembers = enrichedTeam.filter((member) => {
  const isSubmittedMember = submittedNames.has(member.name.trim().toLowerCase());
  if (isSubmittedMember) return true;
  if (member.enrichmentStatus === "success") return true;
  // Keep members from trusted discovery sources
  if (member.teamMemberSource && trustedSources.has(member.teamMemberSource)) return true;
  return false;
});
```

**Important dependency:** This relies on `teamMemberSource` being set on `EnrichedTeamMember`. Check `backend/src/modules/ai/interfaces/phase-results.interface.ts` — this field was added in WS1 of the previous plan. If it's there, this works. If not, add:

```typescript
teamMemberSource?: "submitted" | "website" | "linkedin" | "deck" | "enrichment";
```

And ensure the merging logic in `scraping.service.ts` sets this field when merging team sources (lines ~179-268).

**Step 2: Type-check**

Run: `cd backend && bunx tsc --noEmit`
Expected: zero errors

**Step 3: Run existing scraping tests**

Run: `cd backend && bun test src/modules/ai/tests/services/scraping.service.spec.ts`
Expected: all pass

**Step 4: Commit**

```bash
git add backend/src/modules/ai/services/scraping.service.ts backend/src/modules/ai/interfaces/phase-results.interface.ts
git commit -m "fix(scraping): keep team members from trusted sources even without LinkedIn enrichment"
```

---

## Task 4: Synthesis Schema — Change investorMemo and founderReport from strings to structured objects

**Priority:** HIGH | **Effort:** 45 min | **Risk:** Medium (affects persistence)

The synthesis schema defines `investorMemo` and `founderReport` as `z.string()` but the frontend expects structured objects. The DB columns are JSONB so they can store objects. Fix: change schema to structured objects and update synthesis prompt.

**Files:**
- Modify: `backend/src/modules/ai/schemas/synthesis.schema.ts`
- Modify: `backend/src/modules/ai/services/synthesis.service.ts:234-235`
- Modify: `backend/src/modules/ai/services/ai-prompt-catalog.ts` (synthesis.final prompt)

**Step 1: Update synthesis schema**

Replace `backend/src/modules/ai/schemas/synthesis.schema.ts`:

```typescript
import { z } from "zod";

const MemoSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  highlights: z.array(z.string()).optional(),
  concerns: z.array(z.string()).optional(),
});

const InvestorMemoSchema = z.object({
  executiveSummary: z.string(),
  summary: z.string().optional(),
  sections: z.array(MemoSectionSchema).default([]),
  recommendation: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  dealHighlights: z.array(z.string()).default([]),
  keyDueDiligenceAreas: z.array(z.string()).default([]),
});

const FounderReportSchema = z.object({
  summary: z.string(),
  sections: z.array(MemoSectionSchema).default([]),
  actionItems: z.array(z.string()).default([]),
});

export const SynthesisSchema = z.object({
  overallScore: z.number().min(0).max(100),
  recommendation: z.enum(["Pass", "Consider", "Decline"]),
  executiveSummary: z.string().min(1),
  strengths: z.array(z.string()).min(1),
  concerns: z.array(z.string()).min(1),
  investmentThesis: z.string().min(1),
  nextSteps: z.array(z.string()),
  confidenceLevel: z.enum(["High", "Medium", "Low"]),
  percentileRank: z.number().min(0).max(100).optional(),
  investorMemo: InvestorMemoSchema,
  founderReport: FounderReportSchema,
  dataConfidenceNotes: z.string().min(1),
});

export type Synthesis = z.infer<typeof SynthesisSchema>;
export type InvestorMemo = z.infer<typeof InvestorMemoSchema>;
export type FounderReport = z.infer<typeof FounderReportSchema>;
```

**Step 2: Update synthesis.final prompt in ai-prompt-catalog.ts**

Find the `synthesis.final` entry (~line 987). Update the `## investorMemo Format` and `## founderReport Format` sections to produce structured JSON:

Replace lines ~1027-1038:

```typescript
"## investorMemo Format (MUST be a JSON object, not a string)",
"Return investorMemo as a structured object with these fields:",
"- `executiveSummary`: 3-5 paragraph IC-grade executive summary (350-550 words)",
"- `summary`: 1-2 sentence recommendation summary",
"- `sections`: Array of {title, content, highlights?, concerns?} — one per evaluation dimension",
"  Each section.content uses the narrativeSummary from the corresponding evaluation agent",
"- `recommendation`: 'Pass', 'Consider', or 'Decline' with brief rationale",
"- `riskLevel`: 'low', 'medium', or 'high'",
"- `dealHighlights`: 3-5 top reasons to invest (string array)",
"- `keyDueDiligenceAreas`: 2-4 areas requiring further investigation (string array)",
"",
"## founderReport Format (MUST be a JSON object, not a string)",
"Return founderReport as a structured object with these fields:",
"- `summary`: 2-3 paragraph constructive summary for the founder",
"- `sections`: Array of {title, content, highlights?, concerns?} — key areas of feedback",
"- `actionItems`: 3-5 specific actionable suggestions (string array)",
```

**Step 3: Verify synthesis.service.ts persistence still works**

Lines 234-235 in `synthesis.service.ts` do:
```typescript
investorMemo: synthesis.investorMemo,
founderReport: synthesis.founderReport,
```

Since the DB columns are JSONB and we're now passing objects instead of strings, Drizzle will serialize them correctly. **No change needed** in synthesis.service.ts — the objects will be stored as JSONB automatically.

**Step 4: Type-check**

Run: `cd backend && bunx tsc --noEmit`
Expected: zero errors

**Step 5: Run synthesis tests**

Run: `cd backend && bun test src/modules/ai/tests/services/synthesis.service.spec.ts`
Expected: all pass (may need test fixture updates if tests mock synthesis output)

**Step 6: Commit**

```bash
git add backend/src/modules/ai/schemas/synthesis.schema.ts backend/src/modules/ai/services/ai-prompt-catalog.ts
git commit -m "fix(synthesis): change investorMemo/founderReport to structured objects matching frontend types"
```

---

## Task 5: Scraper Improvements — Sitemap parsing, expanded scoring, higher page limit

**Priority:** HIGH | **Effort:** 60 min | **Risk:** Low

The scraper misses 30-50% of important pages because it only discovers links from the homepage, caps at 20 pages, and doesn't score categories like `/research`, `/integrations`, `/security`.

**Files:**
- Modify: `backend/src/modules/ai/services/website-scraper.service.ts`
- Test: `backend/src/modules/ai/tests/services/website-scraper.service.spec.ts`

**Step 5a: Expand priority scoring (lines 599-614)**

Replace the `getPriorityScore()` method:

```typescript
private getPriorityScore(pathname: string): number {
  const priorities: Array<{ score: number; pattern: RegExp }> = [
    { score: 100, pattern: /\/(about|team|leadership|founders|people|our-team)/ },
    { score: 95, pattern: /\/(product|products|platform|solution|solutions|features|how-it-works)/ },
    { score: 90, pattern: /\/(pricing|plans)/ },
    { score: 85, pattern: /\/(customers|case-studies|testimonials|success-stories|use-cases)/ },
    { score: 80, pattern: /\/(company|mission|values|story|culture)/ },
    { score: 75, pattern: /\/(integrations|partners|marketplace|ecosystem)/ },
    { score: 70, pattern: /\/(security|compliance|privacy|trust|certifications)/ },
    { score: 65, pattern: /\/(technology|architecture|infrastructure)/ },
    { score: 60, pattern: /\/(research|insights|white-?papers?|reports?)/ },
    { score: 55, pattern: /\/(resources|guides|faq|help|knowledge)/ },
    { score: 50, pattern: /\/(careers|jobs|hiring)/ },
    { score: 45, pattern: /\/(blog|news|press|media|announcements)/ },
    { score: 40, pattern: /\/(investors|funding|ipo)/ },
    { score: 35, pattern: /\/(enterprise|industries|for-[a-z]+)/ },
    { score: 30, pattern: /\/(contact|demo|request|get-started|signup|trial)/ },
  ];

  const match = priorities.find((priority) => priority.pattern.test(pathname));
  return match?.score ?? 0;
}
```

**Step 5b: Add sitemap.xml parsing**

Add a new method to `WebsiteScraperService` before `deepScrape()`:

```typescript
private async fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  const sitemapUrl = new URL("/sitemap.xml", baseUrl).toString();
  try {
    const response = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": this.userAgent },
    });
    if (!response.ok) return [];
    const xml = await response.text();
    // Extract <loc> URLs from sitemap XML
    const urls: string[] = [];
    const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
    let match: RegExpExecArray | null;
    while ((match = locRegex.exec(xml)) !== null) {
      if (match[1]) urls.push(match[1]);
    }
    return urls.filter((url) => {
      try {
        const parsed = new URL(url);
        return parsed.hostname === new URL(baseUrl).hostname;
      } catch {
        return false;
      }
    });
  } catch {
    this.logger.debug(`[Scrape] No sitemap.xml found at ${sitemapUrl}`);
    return [];
  }
}
```

**Step 5c: Integrate sitemap into deepScrape()**

In `deepScrape()` at line 77, after `const subpageCandidates = this.discoverSubpages(...)`, add sitemap URLs:

```typescript
// After line 77: const subpageCandidates = this.discoverSubpages(homepage.links, homepageUrl);
const sitemapUrls = await this.fetchSitemapUrls(homepageUrl);
if (sitemapUrls.length > 0) {
  this.logger.debug(`[Scrape] Found ${sitemapUrls.length} URLs from sitemap.xml`);
}
// Merge sitemap URLs into candidates, deduped, preserving priority order
const allCandidates = [...new Set([...subpageCandidates, ...sitemapUrls.map((u) => this.normalizeUrl(u, false))])]
  .filter((url) => url !== homepageUrl && url !== homepageUrl + "/")
  .slice(0, this.maxSubpages);
const subpages = await this.scrapeSubpages(allCandidates);
```

Replace the existing `const subpages = await this.scrapeSubpages(subpageCandidates);` (line 81) with the merged version above.

**Step 5d: Increase default max subpages**

In the constructor (line 45), change default from 20 to 40:

```typescript
this.maxSubpages = this.validatePositiveInt(
  this.config?.get<number>("SCRAPING_MAX_SUBPAGES", 40) ?? 40, 1, 200,
);
```

**Step 5e: Add exclusion patterns for noise pages**

Add a private method:

```typescript
private isExcludedPath(pathname: string): boolean {
  const excludePatterns = [
    /\/(admin|dev|test|staging|wp-admin|wp-content)\//,
    /\.(pdf|zip|mp4|json|xml|csv|png|jpg|jpeg|gif|svg|ico)$/,
    /\/(changelog|releases|download|cdn)\b/,
    /\/(tag|tags|category|categories|archive|page)\/\d/,
    /\/\d{4}\/\d{2}\/\d{2}\//,  // Date-based blog archives
  ];
  return excludePatterns.some((p) => p.test(pathname));
}
```

Then in `discoverSubpages()` (line 171-186), add to the filter:

```typescript
// After line 183: return entry.score > 0 || entry.depth <= this.maxPathDepth;
// Add this check inside the filter:
const pathname = parsed.pathname.toLowerCase();
if (this.isExcludedPath(pathname)) return false;
```

**Step 5f: Type-check and test**

Run: `cd backend && bunx tsc --noEmit`
Expected: zero errors

Run: `cd backend && bun test src/modules/ai/tests/services/website-scraper.service.spec.ts`
Expected: all pass

**Step 5g: Commit**

```bash
git add backend/src/modules/ai/services/website-scraper.service.ts
git commit -m "feat(scraping): add sitemap parsing, expand priority scoring, increase page limit to 40"
```

---

## Task 6: Admin Team Member Editing UI

**Priority:** LOW | **Effort:** 45 min | **Risk:** Low

Currently admins cannot edit team members after submission. The backend already supports `teamMembers` in the admin update DTO (`PATCH /admin/startups/:id`). We just need to add the UI to `AdminEditTab.tsx`.

**Files:**
- Modify: `frontend/src/components/startup-view/AdminEditTab.tsx`

**Step 1: Add teamMembers to the form values type**

In `AdminEditTab.tsx`, update the `AdminEditFormValues` type (~line 32) to add:

```typescript
teamMembers?: Array<{ name: string; role: string; linkedinUrl: string }>;
```

**Step 2: Add state and handlers for team member CRUD**

After the form initialization, add team member management state. Use `useFieldArray` from `react-hook-form` or simple state management to allow add/edit/remove of team members.

Add a new Card section after the existing form fields (before the submit button) with:
- Header: "Team Members"
- For each member: inline inputs for name, role, linkedinUrl + delete button
- "Add Team Member" button at the bottom
- Each row uses the same `TeamMemberSchema` validation (name max 200, role max 200, linkedinUrl max 500)

**Step 3: Include teamMembers in submit payload**

In the form submit handler, include `teamMembers` in the DTO sent to `PATCH /admin/startups/:id`.

**Step 4: Initialize form with existing team members**

In the form `useEffect` that populates default values from `startup`, add:
```typescript
teamMembers: startup.teamMembers ?? [],
```

**Step 5: Type-check**

Run: `cd frontend && bunx tsc --noEmit`
Expected: zero errors

**Step 6: Commit**

```bash
git add frontend/src/components/startup-view/AdminEditTab.tsx
git commit -m "feat(admin): add team member editing to admin startup edit tab"
```

---

## Task 7: Docs Preview/Download — Frontend component for backend-generated PDFs

**Priority:** MEDIUM | **Effort:** 45 min | **Risk:** Low

Backend generates PDFs and stores `pdfUrl`/`pdfKey` in analysis job results, but no frontend component displays them. Admin already has client-side PDF generation. We need to surface backend-generated PDFs for all roles.

**Files:**
- Modify: `frontend/src/components/startup-view/MemoTabContent.tsx` (add download buttons to existing memo tab)

**Step 1: Add download buttons to the MemoTabContent header**

Rather than creating a whole new tab, add download buttons to the existing MemoTabContent card header. Import the backend PDF endpoints:

```typescript
// At top of MemoTabContent.tsx
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
```

In the CardHeader of the Investment Memo card (~line 192-197), add download buttons:

```typescript
<CardHeader className="pb-4 flex flex-row items-center justify-between">
  <div>
    <CardTitle className="text-lg">Investment Memo</CardTitle>
    <CardDescription>Comprehensive analysis across 11 evaluation dimensions</CardDescription>
  </div>
  <div className="flex gap-2">
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.open(`/api/startups/${evaluation.startupId}/memo.pdf`, "_blank")}
    >
      <Download className="w-4 h-4 mr-1" /> Memo PDF
    </Button>
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.open(`/api/startups/${evaluation.startupId}/report.pdf`, "_blank")}
    >
      <Download className="w-4 h-4 mr-1" /> Report PDF
    </Button>
  </div>
</CardHeader>
```

**Step 2: Verify the backend endpoints exist**

Confirm `GET /startups/:id/memo.pdf` and `GET /startups/:id/report.pdf` are in the startup controller. These were confirmed by the investigation.

**Step 3: Type-check**

Run: `cd frontend && bunx tsc --noEmit`
Expected: zero errors

**Step 4: Commit**

```bash
git add frontend/src/components/startup-view/MemoTabContent.tsx
git commit -m "feat(ui): add PDF download buttons to memo tab"
```

---

## Execution Order

Tasks are mostly independent. Recommended parallel groups:

```
Group 1 (parallel, all independent):
├── Task 1: Score rounding (frontend)
├── Task 2: Memo score leakage (backend prompts)
└── Task 3: Team member filter (backend scraping)

Group 2 (parallel, independent):
├── Task 4: Synthesis schema restructure (backend)
└── Task 5: Scraper improvements (backend)

Group 3 (parallel, independent):
├── Task 6: Admin team editing UI (frontend)
└── Task 7: PDF download buttons (frontend)
```

## Verification

After all tasks:
1. `cd backend && bunx tsc --noEmit` — zero TS errors
2. `cd frontend && bunx tsc --noEmit` — zero TS errors
3. `cd backend && bun lint` — zero lint errors
4. `cd backend && bun test` — all tests pass
5. Hit reseed endpoint to push updated prompts: `POST /api/admin/ai-prompts/reseed-from-code`
6. Re-run a pipeline on a test startup to verify structured investorMemo/founderReport output
