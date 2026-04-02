# Market Tab — Final UI Specification

## Section 1: Score Card

**Market Score** displayed prominently (e.g., 88/100) with weight percentage in overall evaluation and confidence badge (Low / Mid / High).

> Dev: score → `scoring.overallScore` (number). Confidence → `scoring.confidence` (string: "high", "mid", "low"). Weight % comes from the scoring config/orchestrator, not the eval agent output.
**Scoring Basis One-Liner** — displayed directly under the score in smaller, muted text. Gives immediate context for why the score landed where it did without scrolling.

> Dev: → `scoring.scoringBasis` (string).

**Sub-Score Breakdown** — mini-bars below the main score, one per weighted sub-dimension. Dimensions and weights vary by stage (e.g., Seed has 3 dimensions, Series B has 4). Bar length reflects sub-score (0–100), weight label shown next to the dimension name, bar color reflects score range (green >75, yellow 50–75, red <50).

> Dev: → `scoring.subScores[]` (array of objects, each with dimension/string, weight/number, score/number). Render dynamically — iterate the array, don't hardcode dimension names.

---

## Section 2: Market Sizing

**TAM Funnel Visual** — TAM / SAM / SOM rendered as a funnel, concentric circles, or stacked bars that shrink to communicate the step-down relationship. Each layer shows: dollar amount, source name, methodology (top-down vs. bottom-up), and confidence level.

> Dev: TAM → `marketSizing.tam` (object: value, methodology, sources[], confidence). SAM → `marketSizing.sam` (object: value, methodology, sources[], confidence). SOM → `marketSizing.som` (object: value, methodology, confidence). Each source in `sources[]` is an object with name, tier, date, geography.

**Deck vs. Research Bar Chart** — horizontal bar chart with two bars per metric (TAM, SAM, Growth Rate). Left bar = deck claim, right bar = research finding. Gap colored green if deck is conservative or accurate, red if deck is inflated. Source tier badge next to the research bar.

> Dev: TAM comparison → `marketSizing.deckVsResearch` (object: tamClaimed, tamResearched, discrepancyFlag, notes). Growth rate comparison → `marketGrowthAndTiming.growthRate` (object: cagr, deckClaimed, discrepancyFlag).

**Source Attribution Table** — compact table showing each market size estimate with its source, source tier, date, and geography (global/regional):

| Estimate | Source | Tier | Date | Geography |
|----------|--------|------|------|-----------|
| $1.0T | Morgan Stanley | Tier 1 | 2024 | Global |
| $325B | AIA/Avascent | Tier 2 | 2023 | US |

> Dev: iterate `marketSizing.tam.sources[]` and `marketSizing.sam.sources[]`. Each source object has name, tier, date, geography. Pair the source with the parent sizing value to populate the Estimate column.

**Bottom-Up Sanity Check** — rendered as a visible formula: `[# of potential customers] × [average deal size] = [bottom-up TAM]`. Plausibility shown as a green/yellow/red badge with a brief note.

> Dev: → `marketSizing.bottomUpSanityCheck` (object: calculation, plausible, notes). Note: only available for pre_seed, seed, and series_a stages. Series B, C, and D do not produce this field — hide this component for those stages.

---

## Section 3: Growth & Timing

**Growth Trajectory Visual** — CAGR displayed as a prominent number (e.g., "27.8% – 32.7% CAGR") with period and source. Directional arrow or mini indicator showing whether growth is accelerating, stable, or decelerating. Color coded: green arrow up = accelerating, yellow flat = stable, red arrow down = decelerating. Includes deck-claimed growth rate and discrepancy badge.

> Dev: → `marketGrowthAndTiming.growthRate` (object: cagr, period, source, deckClaimed, discrepancyFlag, trajectory). Trajectory is an enum: "accelerating", "stable", "decelerating".

**Why Now** — the eval agent's timing thesis text explaining why this market is relevant now. Includes a "Supported by research" badge (yes/no) and the supporting evidence text.

> Dev: → `marketGrowthAndTiming.whyNow` (object: thesis, supportedByResearch/boolean, evidence).

**Market Lifecycle Curve** — visual S-curve (classic market adoption curve) with a marker showing where this market currently sits along Introduction → Growth → Maturity → Decline. A shaded "sweet spot" zone highlights the ideal entry window.

> Dev: marker position → `marketGrowthAndTiming.marketLifecycle.position`. Evidence → `marketGrowthAndTiming.marketLifecycle.evidence`. Sweet-spot highlighting driven by `marketGrowthAndTiming.timingAssessment` (enum: too_early, slightly_early, right_time, slightly_late, too_late).

---

## Section 4: Market Structure

**Structure Type & Entry Conditions Scorecard** — market structure label (e.g., "emerging", "fragmented", "oligopoly") displayed as a header badge. Below it, a per-barrier scorecard with traffic-light indicators:

| Factor | Severity | Note |
|--------|----------|------|
| Regulatory barriers | low / moderate / high | one-line note |
| Capital requirements | low / moderate / high | one-line note |
| Incumbent lock-in | low / moderate / high | one-line note |
| Distribution access | low / moderate / high | one-line note |
| Technology barriers | low / moderate / high | one-line note |

> Dev: structure label → `marketStructure.structureType` (enum: fragmented, consolidating, emerging, concentrated). Entry conditions → `marketStructure.entryConditions[]` (array of objects: factor, severity, note). Iterate to render one row per barrier.

**Concentration Spectrum** — horizontal spectrum bar from Fragmented to Consolidated with a marker showing current position and an arrow showing direction of movement (fragmenting or consolidating). Direction and evidence text displayed below.

> Dev: → `marketStructure.concentrationTrend` (object: direction, evidence). Marker position inferred from `marketStructure.structureType` (fragmented = left, emerging = left-center, consolidating = mid-right, concentrated = right).

**Tailwinds vs. Headwinds** — two-column layout. Left column: green upward arrows with tailwind labels and sources. Right column: red downward arrows with headwind labels and sources. The visual balance between columns communicates market favorability at a glance.

> Dev: tailwinds → `marketStructure.tailwinds[]` (array of objects: factor, source, impact). Headwinds → `marketStructure.headwinds[]` (array of objects: factor, source, impact).

---

## Section 5: Strengths & Risks

Two-column layout — green strengths on the left, red risks on the right. Same visual pattern as Product, Team, Competitors, and Financials tabs.

Left column: green checkmark icons with strength labels.
Right column: red/yellow warning icons with risk labels.

The visual balance between columns communicates market health at a glance.

> Dev: strengths → `strengths` (string). Risks → `risks` (string). Parse on newlines or bullet delimiters to render as individual list items in each column.

---

## Section 6: Data Gaps & Diligence

**Unified Data Gaps Checklist** — single merged list (previously two duplicate lists: "Data Gaps" and "Diligence Items"). Each item rendered as a checklist row with three fields:

- **Gap description** — what information is missing
- **Impact indicator** — tagged as Critical (would change score/recommendation), Important (would change confidence), or Minor (contextual, nice-to-have). Rendered as a colored badge.
- **Suggested action** — what diligence step would resolve this gap

> Dev: → `dataGaps[]` (array of objects: gap/string, impact/string, suggestedAction/string). Impact values are "critical", "important", or "minor" — map to red, yellow, and grey badges respectively.

---

## Fields Not Rendered on Market Tab

> Dev: `narrativeSummary` (string, 450–650 word VC memo narrative) → used on Summary/Memo tabs. `founderPitchRecommendations[]` (array of objects: deckMissingElement, whyItMatters, recommendation) → used on Recommendations tab. `sources` (string) → used on Sources tab.

---

## Design Philosophy

The Market tab is a **visual intelligence dashboard** where the most important insights are communicated through visuals first, with text as supporting detail:

- **TAM funnel** — market size at a glance
- **Deck vs. research discrepancy** — founder credibility across sizing and growth
- **Growth trajectory** — momentum direction
- **Why Now thesis** — qualitative timing narrative with research backing
- **Lifecycle position** — entry window on S-curve
- **Entry conditions scorecard** — per-barrier assessment
- **Concentration spectrum** — market structure direction
- **Tailwinds/headwinds balance** — market favorability
- **Unified data gaps** — what's missing, how much it matters, what to do about it
