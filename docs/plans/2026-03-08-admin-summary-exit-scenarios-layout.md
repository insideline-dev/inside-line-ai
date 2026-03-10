# Admin Summary Exit Scenarios Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move exit scenarios to sit immediately after the deal snapshot and present them in a fixed conservative-to-optimistic horizontal layout with MOIC as the primary visual metric.

**Architecture:** Keep the existing `AdminSummaryTab` structure intact, but move the exit-scenarios card higher in the render tree and route presentation through small pure helpers for scenario ordering and value formatting. This keeps the layout change localized and gives us a testable seam without introducing new state or API changes.

**Tech Stack:** React 19, TypeScript, Bun test, existing shadcn/ui card primitives

---

### Task 1: Add exit-scenario presentation helpers

**Files:**
- Create: `frontend/src/components/startup-view/admin-summary-tab.helpers.ts`
- Test: `frontend/src/components/startup-view/admin-summary-tab.helpers.test.ts`

**Step 1: Write the failing test**

Write a Bun test that proves:
- scenarios are returned in `conservative`, `moderate`, `optimistic` order regardless of input order
- MOIC is formatted with an uppercase `X`
- IRR is formatted with a `%`

**Step 2: Run test to verify it fails**

Run: `cd frontend && bun test src/components/startup-view/admin-summary-tab.helpers.test.ts`
Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

Add helper functions to:
- sort scenarios into the required display order
- format MOIC for display
- format IRR for display

**Step 4: Run test to verify it passes**

Run: `cd frontend && bun test src/components/startup-view/admin-summary-tab.helpers.test.ts`
Expected: PASS

### Task 2: Update summary tab placement and visual hierarchy

**Files:**
- Modify: `frontend/src/components/startup-view/AdminSummaryTab.tsx`

**Step 1: Write the failing test**

Add or extend a render-level test only if needed. If the helper test is sufficient for the risky logic, keep this task implementation-focused and validate through typecheck plus manual code inspection.

**Step 2: Write minimal implementation**

Update `AdminSummaryTab` so that:
- the `Exit Scenarios` card renders immediately after `Deal Snapshot`
- scenario cards render in the fixed left-to-right order
- MOIC becomes the dominant text treatment
- IRR and exit type are secondary supporting rows
- the layout remains horizontal on desktop and stacked on smaller screens

**Step 3: Run verification**

Run:
- `cd frontend && bun test src/components/startup-view/admin-summary-tab.helpers.test.ts`
- `cd frontend && bunx tsc --noEmit`

Expected:
- helper test passes
- frontend typecheck passes with zero errors

### Task 3: Review and finish

**Files:**
- Review: `frontend/src/components/startup-view/AdminSummaryTab.tsx`
- Review: `frontend/src/components/startup-view/admin-summary-tab.helpers.ts`
- Review: `frontend/src/components/startup-view/admin-summary-tab.helpers.test.ts`

**Step 1: Check diff**

Run: `git diff -- frontend/src/components/startup-view/AdminSummaryTab.tsx frontend/src/components/startup-view/admin-summary-tab.helpers.ts frontend/src/components/startup-view/admin-summary-tab.helpers.test.ts`

**Step 2: Commit**

```bash
git add docs/plans/2026-03-08-admin-summary-exit-scenarios-layout.md frontend/src/components/startup-view/AdminSummaryTab.tsx frontend/src/components/startup-view/admin-summary-tab.helpers.ts frontend/src/components/startup-view/admin-summary-tab.helpers.test.ts
git commit -m "feat: refine admin summary exit scenario layout"
```
