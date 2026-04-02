# Financials Tab — Final UI Specification

## Rendering Strategy: Modular + Dual-Mode

This tab has two layers of conditional rendering:

1. **Section-level modularity** — every section checks whether its data exists before rendering. If the deck doesn't cover capital planning at all, that section collapses to a single "Not covered in deck" note. Missing sections surface automatically in Data Gaps.

2. **Dual-mode gating** — Sections 6–8 only render when a financial model is uploaded (`financialModelProvided: true`). When no model is uploaded, the Upload Prompt becomes the visual centerpiece.

> Dev: Read `financialModelProvided` (boolean) from the agent output. Default to false if missing. For section-level modularity, each section has a `sectionAvailable` check documented in its Dev note — render the full section when true, render the collapsed placeholder when false.

---

## Section 1: Score Card *(always rendered)*

**Financial Plan Score** displayed prominently (e.g., 62/100) with weight percentage in overall evaluation and confidence badge (Low / Mid / High).

> Dev: score → `scoring.overallScore` (number). Confidence → `scoring.confidence` (string: "high", "mid", "low"). Weight % comes from the scoring config/orchestrator, not the eval agent output.

**Scoring Basis One-Liner** — displayed directly under the score in smaller, muted text. Gives immediate context for why the score landed where it did.

> Dev: → `scoring.scoringBasis` (string).

**Sub-Score Breakdown** — mini-bars below the main score, one per weighted sub-dimension. Dimensions and weights vary by stage (e.g., Pre-Seed: Capital Plan / Projection Quality / Financial Planning Quality). Bar length reflects sub-score (0–100), weight label shown next to the dimension name, bar color reflects score range (green >75, yellow 50–75, red <50).

> Dev: → `scoring.subScores[]` (array of objects, each with dimension/string, weight/number, score/number). Render dynamically — iterate the array, don't hardcode dimension names.

**Confidence Context Note** — conditional message below sub-scores based on confidence level:
- "low" → "Limited financial data available — score based on partial deck information."
- "mid" → "Partial financial data — upload a financial model for higher-confidence analysis."
- "high" → do not render any note.

> Dev: Conditional render based on `scoring.confidence`. Only show for "low" or "mid".

---

## Section 2: Key Metrics Strip *(modular — renders if any metrics are extractable)*

A horizontal row of **KPI metric cards** — large numbers with labels, displayed as a prominent strip across the top of the financial data. Each card shows the metric value in large text, the label below in muted text, and optional context annotation.

Possible cards (render only what the agent was able to extract):

- **Raise Amount** — e.g., "$5M" with label "Raising"
- **Monthly Burn** — e.g., "$150K/mo" with label "Burn Rate"
- **Runway** — e.g., "24 months" with label "Post-Raise Runway", color-coded: green (18+ months), yellow (12–18), red (<12)
- **Use of Funds Categories** — e.g., "4 categories" with label "Fund Allocation" (links visually to the donut below if present)

> Dev: → `keyMetrics.raiseAmount` (string or null), `keyMetrics.monthlyBurn` (string or null), `keyMetrics.runway` (string or null), `keyMetrics.runwayMonths` (number or null — used for color coding). Render each card only if the value is non-null. **sectionAvailable check** → render if ANY keyMetrics field is non-null. If ALL are null, do not render this section at all (no collapsed placeholder needed — these are supplementary).

> Dev: Runway color: `runwayMonths` >= 18 → green, 12–17 → yellow, <12 → red. If `runwayMonths` is null but `runway` string exists, render without color coding.

---

## Section 3: Capital Plan Assessment *(modular — renders if any capital plan data exists)*

> Dev: **sectionAvailable check** → render full section if ANY of these booleans are true: `capitalPlan.burnPlanDescribed`, `capitalPlan.useOfFundsDescribed`, `capitalPlan.runwayEstimated`, `capitalPlan.raiseJustified`, `capitalPlan.milestoneTied`, `capitalPlan.capitalEfficiencyAddressed`. If ALL are false, render collapsed placeholder: muted card with icon and text "Capital plan not covered in this deck. This has been flagged in Data Gaps below."

### Coverage Grid + Use of Funds Donut — Side by Side Layout

**Left side: Coverage Grid**

Six indicators displayed as a 3×2 grid of status badges. Each badge shows the element name, an icon, and a filled (green checkmark) or unfilled (grey X) state. A coverage counter (e.g., "4/6 elements described") displayed as a summary line above the grid.

| Burn Plan Described | Use of Funds Breakdown |
|---|---|
| Runway Estimated | Raise Justified |
| Milestones Tied to Capital | Capital Efficiency Addressed |

> Dev: → `capitalPlan.burnPlanDescribed` (boolean), `capitalPlan.useOfFundsDescribed` (boolean), `capitalPlan.runwayEstimated` (boolean), `capitalPlan.raiseJustified` (boolean), `capitalPlan.milestoneTied` (boolean), `capitalPlan.capitalEfficiencyAddressed` (boolean). Coverage counter = count of true values out of 6.

**Right side: Use of Funds Donut Chart** *(conditional — only if allocation data exists)*

A **donut chart** showing how the raise is allocated across categories. Each slice is a category with percentage label. Center of donut shows total raise amount if available. Slices use distinct colors per category.

Example slices: "Engineering 40%", "Sales & Marketing 30%", "Operations 15%", "G&A 15%"

> Dev: → `capitalPlan.useOfFundsBreakdown[]` (array of objects: category/string, percentage/number). Only render the donut if array is non-empty. If empty, the right side of the layout is blank and the coverage grid expands to full width. Use a charting library (Recharts, Chart.js, etc.) for the donut.

### Milestone Alignment Badge

Single badge below the grid/donut row: "Strong" (green), "Partial" (yellow), "Weak" (orange), "None" (red/grey).

> Dev: → `capitalPlan.milestoneAlignment` (string enum: "strong", "partial", "weak", "none").

### Capital Plan Summary

Paragraph text — agent's assessment of the capital plan.

> Dev: → `capitalPlan.summary` (string).

---

## Section 4: Projection Assessment *(modular — always renders but adapts)*

This section has three rendering states:

**State A: No projections, no model** (`projections.provided: false` AND `financialModelProvided: false`)
→ Show Upload Prompt card only. No strip, no summary, no chart.

**State B: Deck projections exist, no model** (`projections.provided: true` AND `financialModelProvided: false`)
→ Show Upload Prompt card + Projection Coverage Strip + Projection Summary.

**State C: Financial model uploaded** (`financialModelProvided: true`)
→ Show Projection Coverage Strip + Projection Summary. No upload prompt (Sections 6–8 handle deep analysis).

### Upload Prompt Card *(States A and B only)*

A **prominent call-to-action card** visually distinct from assessment content:

- **Icon** — large document/chart upload icon (muted blue/grey)
- **Headline** — "Upload Financial Model for Full Analysis"
- **Subtext** — "Upload a financial model or projections spreadsheet to unlock detailed analysis."
- **What You'll Unlock** — four items in a 2×2 icon grid:
  - Revenue & burn projection charts
  - Assumption-by-assumption stress test
  - Scenario comparison visualization
  - Profitability path & margin trajectory
- **Upload action area** — styled drop zone or button (platform upload mechanism)

> Dev: Render when `financialModelProvided` is false. Upload action triggers platform file upload flow and re-runs the financials evaluation.

### Projection Coverage Strip *(States B and C only)*

A horizontal strip of four assessment badges:

1. **Projections Provided** — green checkmark (true) / grey X (false)
2. **Assumptions Stated** — green checkmark (true) / grey X (false)
3. **Internally Consistent** — green checkmark (true) / grey X (false) / greyed out if projections not provided
4. **Credibility** — badge: "Strong" (green), "Moderate" (yellow), "Weak" (orange), "None" (red)

> Dev: → `projections.provided` (boolean), `projections.assumptionsStated` (boolean), `projections.internallyConsistent` (boolean), `projections.credibility` (string enum: "strong", "moderate", "weak", "none"). Only render this strip when `projections.provided` is true OR `financialModelProvided` is true. If `projections.provided` is false, grey out badges 2–3 and show credibility as "None".

### Projection Summary *(States B and C only)*

Paragraph text — the agent's assessment of available projection data.

> Dev: → `projections.summary` (string). Only render when `projections.provided` is true OR `financialModelProvided` is true.

---

## Section 5: Strengths & Risks *(always rendered)*

Two-column layout — green strengths on the left, red risks on the right. Same visual pattern as Market, Product, Team, and Competitors tabs.

Left column: green checkmark icons with strength labels.
Right column: red/yellow warning icons with risk labels.

> Dev: strengths → `strengths` (string). Risks → `risks` (string). Parse on newlines or bullet delimiters to render as individual list items in each column.

---

## Section 6: Data Gaps & Diligence *(always rendered)*

**Unified Data Gaps Checklist** — each item rendered as a checklist row with three fields:

- **Gap description** — what information is missing
- **Impact indicator** — tagged as Critical (red badge), Important (yellow badge), or Minor (grey badge)
- **Suggested action** — what diligence step would resolve this gap

> Dev: → `dataGaps[]` (array of objects: gap/string, impact/string, suggestedAction/string). Impact values are "critical", "important", or "minor" — map to red, yellow, and grey badges respectively. Same visual pattern as other tabs.

**Automatic gap surfacing:** When Section 3 collapses (no capital plan data), the agent will include "No capital plan or use of funds described in deck" as a data gap. When Section 4 shows State A (no projections), the agent will include "No financial projections provided" as a data gap. When `financialModelProvided` is false, "Financial model not uploaded" appears as a data gap. These are generated by the agent, not hardcoded in the UI.

---

## Section 7: Financial Projections — Charts & Data *(Full Analysis Mode only)*

> Dev: Only render when `financialModelProvided` is true.

This is the data-rich section that unlocks with a financial model. It contains up to four chart panels arranged in a 2×2 grid (or stacked on mobile). Each chart panel only renders if its data array is non-empty.

### Revenue Projection Chart *(top-left)*

**Line chart** showing projected revenue over time. X-axis = time periods (months or quarters as provided in the model). Y-axis = revenue ($). Single line for base case, with optional shaded range if scenario data exists.

> Dev: → `charts.revenueProjection[]` (array of objects: period/string, revenue/number). Render as a line chart. If `charts.scenarioComparison[]` exists and has revenue data, overlay as a shaded band (optimistic/pessimistic bounds). Only render if array is non-empty.

### Burn & Cash Runway Chart *(top-right)*

**Dual-axis area chart** showing monthly burn (bar or area, left axis) and cumulative cash balance (line, right axis) over time. A horizontal dashed line marks the zero-cash threshold. The point where the cash line crosses zero is the **runway endpoint** — label it with "Runway: X months".

> Dev: → `charts.burnProjection[]` (array of objects: period/string, burn/number, cashBalance/number). Render burn as bars/area against left Y-axis, cash balance as a line against right Y-axis. Draw a dashed horizontal line at cashBalance = 0. If the cash line crosses zero within the projection window, label the intersection. Only render if array is non-empty.

### Scenario Comparison Chart *(bottom-left, conditional)*

**Multi-line chart** overlaying 2–3 scenarios on revenue (or key metric). Each line is a different scenario (e.g., "Conservative", "Base", "Optimistic") with distinct colors and a legend. This gives investors an immediate visual of the projection range.

> Dev: → `charts.scenarioComparison[]` (array of objects: period/string, scenarios/object where keys are scenario names and values are numbers). Render as multi-line chart with legend. Only render if array is non-empty AND has more than one scenario. If the model has no scenarios, this panel does not render and the grid becomes 2×1 + 1.

### Margin Progression Chart *(bottom-right, conditional — later stages)*

**Stacked area or multi-line chart** showing projected gross margin and operating margin over time. This visualizes the path to profitability — the investor sees whether margins are improving and when operating margin turns positive.

> Dev: → `charts.marginProgression[]` (array of objects: period/string, grossMargin/number, operatingMargin/number). Render as two lines or stacked area. Draw a dashed horizontal line at 0% for operating margin — the crossing point is the profitability inflection. Only render if array is non-empty. Expected to be present primarily at Series B+ when models are sophisticated enough to project margins.

### Chart Rendering Notes

> Dev: All chart arrays may be empty — render only the panels that have data. If only one chart has data, render it full-width. If two charts, render side-by-side. If three or four, use the 2×2 grid. Use a consistent charting library across all panels (Recharts recommended for React). All currency values should be formatted with abbreviations ($1.2M, $500K). Period labels should be consistent (don't mix months and quarters).

---

## Section 8: Assumption Deep Dive *(Full Analysis Mode only)*

> Dev: Only render when `financialModelProvided` is true.

### Assumption Assessment Table

A **structured table** where each row is a key assumption from the model, with the agent's assessment. This replaces the paragraph-style assumption text with a scannable, actionable format.

| Assumption | Value | Agent Assessment | Verdict |
|---|---|---|---|
| Revenue growth rate | 15% MoM | Aggressive for Series A SaaS | ⚠️ Aggressive |
| Gross margin | 75% | Consistent with SaaS benchmarks | ✅ Reasonable |
| Sales cycle length | 30 days | Optimistic for enterprise | ⚠️ Aggressive |
| Churn rate | 2% monthly | Not supported by data | 🔴 Unsupported |

> Dev: → `projections.assumptions[]` (array of objects: assumption/string, value/string, assessment/string, verdict/string). Verdict values: "reasonable" (green checkmark), "aggressive" (yellow warning), "unsupported" (red flag), "conservative" (blue info). Render as a table with verdict badges. Only render if array is non-empty.

### Profitability Path Gauge

A **stepped gauge** showing where the company sits on the profitability spectrum:

```
[Pre-Revenue] → [Revenue, Not Profitable] → [Path Described] → [Path Clear] → [Profitable]
     🔴                   🔴                      🟡               🟢            🟢
```

The gauge fills up to the current level. Each step is a labeled node. Filled steps use the color shown, unfilled steps are grey.

> Dev: → `projections.profitabilityPath` (string enum: "pre-revenue", "revenue-not-profitable", "path-described", "path-clear", "profitable"). Map to gauge position 1–5.

---

## Section 9: Financial Planning Maturity *(Full Analysis Mode only)*

> Dev: Only render when `financialModelProvided` is true.

### Sophistication Gauge

A **stepped maturity gauge** showing the level of financial planning sophistication:

```
[Basic] → [Developing] → [Solid] → [Advanced] → [IPO-Grade]
  🔴          🟠           🟡         🟢           🟢
```

Same visual treatment as the profitability gauge — filled steps with color, unfilled grey.

> Dev: → `financialPlanning.sophisticationLevel` (string enum: "basic", "developing", "solid", "advanced", "ipo-grade"). Map to gauge position 1–5.

### Diligence Flags

A checklist of financial diligence items requiring verification. Each flag shows:

- **Flag description** — what needs verification (e.g., "Audit readiness", "Revenue recognition policy", "Financial controls", "SEC reporting preparedness")
- **Priority badge** — Critical (red), Important (yellow), Routine (grey)

> Dev: → `financialPlanning.diligenceFlags[]` (array of objects: flag/string, priority/string). Priority values: "critical", "important", "routine". Only render if array is non-empty. At pre-seed/seed this array may be empty — that's expected, don't show an empty section.

### Financial Planning Summary

Paragraph text — the agent's overall assessment of financial planning quality.

> Dev: → `financialPlanning.summary` (string).

---

## Fields Not Rendered on Financials Tab

> Dev: `narrativeSummary` (string) → used on Summary/Memo tabs. `sources` (string) → used on Sources tab. `founderPitchRecommendations[]` (array of objects: deckMissingElement, whyItMatters, recommendation) → used on Recommendations tab.

---

## Design Philosophy

The Financials tab is a **modular, data-adaptive financial intelligence view** with three tiers of depth:

**Tier 1 — Minimal data** (deck barely mentions financials):
Score Card with low confidence. Collapsed section placeholders. Upload Prompt as visual centerpiece. Data Gaps listing everything missing. Honest about what can't be assessed.

**Tier 2 — Deck-only with data** (use-of-funds slide, basic projections):
Score Card. Key Metrics strip (raise, burn, runway as KPI cards). Capital Plan coverage grid with Use of Funds donut. Projection coverage strip with credibility badge. Upload Prompt encouraging model upload. Strengths/Risks. Data Gaps.

**Tier 3 — Full analysis** (financial model uploaded):
Everything from Tier 2, plus: Revenue projection line chart. Burn & cash runway chart with zero-crossing marker. Scenario comparison multi-line chart. Margin progression chart (later stages). Assumption table with per-assumption verdicts. Profitability path gauge. Financial planning maturity gauge. Diligence flags checklist.

**Modularity principle:** No section renders when it has zero data — it collapses to a pointer to Data Gaps, or simply doesn't render. Coverage grids only appear with partial or full coverage. Charts only render when their data arrays are non-empty. The page builds itself from the available data.

Key visual elements:

- **KPI metric cards** (Section 2) — large numbers with labels, color-coded runway
- **Coverage grid + donut side-by-side** (Section 3) — boolean grid left, allocation donut right
- **Projection strip** (Section 4) — horizontal badge strip for quick visual scan
- **Upload CTA card** (Section 4) — prominent, with 2×2 "what you'll unlock" preview including chart previews
- **Revenue projection line chart** (Section 7) — with optional scenario shading
- **Burn & runway dual-axis chart** (Section 7) — area + line with zero-crossing marker
- **Scenario comparison multi-line** (Section 7) — overlay of 2–3 projection paths
- **Margin progression chart** (Section 7) — path to profitability with zero-crossing inflection
- **Assumption table with verdicts** (Section 8) — structured rows with color-coded verdict badges
- **Stepped gauges** (Section 8 profitability, Section 9 maturity) — 5-step filled indicators
- **Collapsed section placeholders** — muted cards with "Not covered in deck" + pointer to Data Gaps
