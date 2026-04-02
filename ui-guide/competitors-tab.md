# Competitors Tab — Final UI Specification

## Section 1: Score Card

**Competitive Advantage Score** displayed prominently (e.g., 72/100) with weight percentage in overall evaluation and confidence badge (Low / Mid / High).

> Dev: score → `scoring.overallScore` (number). Confidence → `scoring.confidence` (string: "high", "mid", "low"). Weight % comes from the scoring config/orchestrator, not the eval agent output.

**Scoring Basis One-Liner** — displayed directly under the score in smaller, muted text. Gives immediate context for why the score landed where it did.

> Dev: → `scoring.scoringBasis` (string).

**Sub-Score Breakdown** — mini-bars below the main score, one per weighted sub-dimension. Dimensions and weights vary by stage (e.g., Pre-Seed: Moat Potential / Competitive Landscape & Differentiation). Bar length reflects sub-score (0–100), weight label shown next to the dimension name, bar color reflects score range (green >75, yellow 50–75, red <50).

> Dev: → `scoring.subScores[]` (array of objects, each with dimension/string, weight/number, score/number). Render dynamically — iterate the array, don't hardcode dimension names.

---

## Section 2: Strategic Positioning

**Differentiation Summary** — paragraph text explaining how the startup differentiates from competitors.

> Dev: → `strategicPositioning.differentiation` (string).

**Unique Value Proposition** — paragraph text describing what makes this approach distinct.

> Dev: → `strategicPositioning.uniqueValueProposition` (string).

**Positioning Badges** — two inline badges displayed next to each other:

1. **Differentiation Type** — colored tag showing the classification (e.g., "Technology", "Network Effects", "Data", "Brand", "Cost", "Regulatory", "Other"). Use distinct colors per type.
2. **Durability** — colored badge: green for "strong", yellow for "moderate", red for "weak".

> Dev: differentiationType → `strategicPositioning.differentiationType` (string enum). Durability → `strategicPositioning.durability` (string enum: "strong", "moderate", "weak").

---

## Section 3: Competitive Landscape

The core of the Competitors tab — who the competitors are and where the startup sits among them.

### Direct Competitors

Horizontal scrollable row of competitor cards. Each card shows:

- **Name** — bold, linked to URL if available
- **Description** — two-line summary of what they do
- **Funding Badge** — pill showing amount raised (e.g., "$45M", "$120M", "Undisclosed"). Color-coded: green for <$10M, yellow for $10M–$100M, red for >$100M (signals well-funded threat)

> Dev: → `competitors.direct[]` (array of objects: name/string, description/string, url/string, fundingRaised/string). If array is empty, show "No direct competitors identified" placeholder. URL opens in new tab if present.

### Indirect Competitors

Same card layout as direct, but each card adds:

- **Why Indirect** — one-line explanation of why they're adjacent rather than direct
- **Threat Level Badge** — "High" (red), "Medium" (yellow), "Low" (green)

> Dev: → `competitors.indirect[]` (array of objects: name/string, description/string, whyIndirect/string, url/string, threatLevel/string). Threat level badge colors: "high" → red, "medium" → yellow, "low" → green.

### Competitive Position Summary

Below the competitor cards, a summary strip with three elements side by side:

1. **Current Gap** — large badge: "Leading" (green), "Competitive" (yellow), "Behind" (red), "Unclear" (grey).
2. **Defensible Against Funded Entrant** — yes/no badge: green checkmark for true, red X for false.
3. **Time to Replicate** — gauge or stepped indicator showing: "Months" (red), "1–2 Years" (yellow), "3–5 Years" (light green), "5+ Years" (dark green). Filled up to the current level.

> Dev: currentGap → `competitivePosition.currentGap` (string enum). defensibleAgainstFunded → `competitivePosition.defensibleAgainstFunded` (boolean). timeToReplicate → `moatAssessment.timeToReplicate` (string).

**Gap Evidence** — text explaining why the competitive gap was assessed this way.

> Dev: → `competitivePosition.gapEvidence` (string).

**Defensibility Rationale** — text explaining why the position is or isn't defensible against funded competitors.

> Dev: → `competitivePosition.defensibilityRationale` (string).

**Vulnerabilities** — text describing where competitors are stronger.

> Dev: → `competitivePosition.vulnerabilities` (string).

---

## Section 4: Barriers to Entry

**Barrier Coverage Grid** — four barrier badges in a 2×2 grid. Each badge shows the barrier name, an icon, and a filled (green checkmark) or unfilled (grey X) state. A coverage counter (e.g., "3/4 barriers present" or "1/4 barriers present") displayed as a summary.

| Technical Barriers | Capital Barriers |
|---|---|
| Network Barriers | Regulatory Barriers |

> Dev: → `barriersToEntry.technical` (boolean), `barriersToEntry.capital` (boolean), `barriersToEntry.network` (boolean), `barriersToEntry.regulatory` (boolean). Coverage counter = count of true values out of 4. Same visual pattern as Team Composition capability grid.

---

## Section 5: Strengths & Risks

Two-column layout — green strengths on the left, red risks on the right. Same visual pattern as Market, Product, and Team tabs.

Left column: green checkmark icons with strength labels.
Right column: red/yellow warning icons with risk labels.

> Dev: strengths → `strengths` (string). Risks → `risks` (string). Parse on newlines or bullet delimiters to render as individual list items in each column.

---

## Section 6: Data Gaps & Diligence

**Unified Data Gaps Checklist** — each item rendered as a checklist row with three fields:

- **Gap description** — what information is missing
- **Impact indicator** — tagged as Critical (red badge), Important (yellow badge), or Minor (grey badge)
- **Suggested action** — what diligence step would resolve this gap

> Dev: → `dataGaps[]` (array of objects: gap/string, impact/string, suggestedAction/string). Impact values are "critical", "important", or "minor" — map to red, yellow, and grey badges respectively. Same visual pattern as other tabs.

---

## Fields Not Rendered on Competitors Tab

> Dev: `moatAssessment.moatType`, `moatAssessment.moatStage`, `moatAssessment.moatEvidence`, `moatAssessment.selfReinforcing` → displayed on Product tab (Section 3: Product Maturity & Defensibility). `narrativeSummary` (string) → used on Summary/Memo tabs. `sources` (string) → used on Sources tab. `founderPitchRecommendations[]` (array of objects: deckMissingElement, whyItMatters, recommendation) → used on Recommendations tab. `details` (string) → deprecated, folded into other fields. `advantages` (string) → deprecated, use `strengths` instead. `keyFindings` → removed for consistency with other tabs.

---

## Design Philosophy

The Competitors tab is a **competitive intelligence dashboard** where the most important questions are answered visually:

- **Score card** — how strong is the competitive position overall?
- **Strategic positioning** — what's the differentiation and how durable is it?
- **Competitive landscape** — who are the competitors, how funded are they, and where does the startup sit?
- **Barriers to entry** — how protected is this space?
- **Strengths vs risks balance** — competitive health at a glance
- **Data gaps** — what's missing, how much it matters, what to do about it
