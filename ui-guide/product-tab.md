# Product Tab — Final UI Specification

## Section 1: Score Card

**Product Score** displayed prominently (e.g., 88/100) with weight percentage in overall evaluation and confidence badge (Low / Mid / High).

> Dev: score → `scoring.overallScore` (number). Confidence → `scoring.confidence` (string: "high", "mid", "low"). Weight % comes from the scoring config/orchestrator, not the eval agent output.

**Scoring Basis One-Liner** — displayed directly under the score in smaller, muted text. Gives immediate context for why the score landed where it did.

> Dev: → `scoring.scoringBasis` (string).

**Sub-Score Breakdown** — mini-bars below the main score, one per weighted sub-dimension. Dimensions and weights vary by stage (e.g., Seed: Problem-Solution Clarity / Product-Stage Fit / Claims Credibility / Technical Risk. Series B: Claims Credibility / Product-Stage Fit / Technical Risk). Bar length reflects sub-score (0–100), weight label shown next to the dimension name, bar color reflects score range (green >75, yellow 50–75, red <50).

> Dev: → `scoring.subScores[]` (array of objects, each with dimension/string, weight/number, score/number). Render dynamically — iterate the array, don't hardcode dimension names.

---

## Section 2: Product Overview

**Product Identity Bar** — three inline badges giving the instant snapshot: product category, target user, and tech stage.

> Dev: category → `productOverview.productCategory` (string). Target user → `productOverview.targetUser` (string). Tech stage → `productOverview.techStage` (string enum: concept, prototype, mvp, beta, production, scaling).

**Core Value Prop** — highlighted callout box, visually distinct from the description. One sentence on why this product matters.

> Dev: → `productOverview.coreValueProp` (string).

**Product Description** — rich 3-5 sentence summary of the product: what it is, how it works, what problem it solves, and what makes the approach notable.

> Dev: → `productOverview.description` (string).

**What It Does** — plain-language 2-3 sentence description of the product's core function. Displayed below the description as a simpler "in plain English" summary.

> Dev: → `productOverview.whatItDoes` (string).

---

## Section 3: Product Maturity & Defensibility

**Product Lifecycle Position** — visual progression bar showing where the product sits:

`Concept → Prototype → MVP → Beta → Production → Scaling`

Marker shows current position from `techStage`. Marker color reflects stage-fit: green if it matches or exceeds what's expected for the investment stage, yellow if slightly behind, red if concerning gap.

> Dev: position → `productOverview.techStage` (string enum). Stage-fit color → `stageFitAssessment` (string enum: "ahead", "on_track", "behind"). Map ahead → green, on_track → green, behind → red.

**Claims Credibility Table** — structured comparison of what the deck claims vs what evidence supports. Each row shows a claim area, what the deck says, what evidence was found, and a verdict badge.

| Claim Area | Deck Says | Evidence | Verdict |
|---|---|---|---|
| Working product | "Live platform with 50+ clients" | Website shows functional app, G2 reviews found | Verified |
| AI-powered analytics | "Proprietary ML models" | No technical evidence found | Unverified |

Verdict badges color coded: green = Verified, yellow = Partially Verified, grey = Unverified, red = Contradicted.

> Dev: → `claimsAssessment[]` (array of objects: claim, deckSays, evidence, verdict). Verdict is an enum: "verified", "partially_verified", "unverified", "contradicted".

**Moat Assessment** — Moat Type badge + Moat Stage indicator + evidence text. Shows what makes this product defensible (network effects, proprietary tech, data advantage, etc.).

> Dev: cross-referenced from Competitive Advantage agent output → `moatAssessment.moatType` (string enum), `moatAssessment.moatStage` (string enum: "potential", "emerging", "forming", "established", "dominant"), `moatAssessment.moatEvidence` (string), `moatAssessment.selfReinforcing` (boolean). These fields are NOT in the product agent output — they come from the competitive advantage agent and are displayed here as a cross-reference. Moat Stage maps to a 5-step indicator: potential (grey) → emerging (yellow) → forming (yellow-green) → established (green) → dominant (dark green).

---

## Section 4: Key Features

Feature list with **source attribution badges** per feature. Each feature shows where it was found — a feature verified across multiple sources is more credible than one from the deck only.

- Gate-to-gate autonomous flight `Deck` `Website` `Research`
- Proprietary DAA radar (TSO-C212) `Deck` `Website`
- Remote Ground Control Station `Deck only`

> Dev: → `keyFeatures[]` (array of objects: feature/string, verifiedBy[]/array of strings). Render each feature as a list item with colored source badges. Badge colors: "deck" = neutral/grey, "website" = blue, "research" = green. A feature with only "deck" as source should be visually flagged as unverified.

---

## Section 5: Technology Stack

Tag chips showing technologies, frameworks, languages, APIs, and infrastructure. Each chip shows its source.

> Dev: → `technologyStack[]` (array of objects: technology/string, source/string). Source values: "deck", "website", "research". Render as tag chips. Optionally dim or annotate chips sourced only from the deck.

---

## Section 6: Strengths & Risks

Two-column layout — green strengths on the left, red risks on the right. Same visual pattern as market tab's tailwinds/headwinds.

Left column: green checkmark icons with strength labels.
Right column: red/yellow warning icons with risk labels.

The visual balance between columns communicates product health at a glance.

> Dev: strengths → `strengths` (string). Risks → `risks` (string). Parse on newlines or bullet delimiters to render as individual list items in each column.

---

## Section 7: Data Gaps & Diligence

**Unified Data Gaps Checklist** — each item rendered as a checklist row with three fields:

- **Gap description** — what information is missing
- **Impact indicator** — tagged as Critical (would change score/recommendation), Important (would change confidence), or Minor (contextual, nice-to-have). Rendered as a colored badge.
- **Suggested action** — what diligence step would resolve this gap

> Dev: → `dataGaps[]` (array of objects: gap/string, impact/string, suggestedAction/string). Impact values are "critical", "important", or "minor" — map to red, yellow, and grey badges respectively.

---

## Fields Not Rendered on Product Tab

> Dev: `narrativeSummary` (string, 450–650 word narrative) → used on Summary/Memo tabs. `sources` (string) → used on Sources tab. `founderPitchRecommendations[]` (array of objects: deckMissingElement, whyItMatters, recommendation) → used on Recommendations tab.

---

## Design Philosophy

The Product tab is a **product due diligence dashboard** where the most important questions are answered visually:

- **Score card** — how good is this product overall?
- **Product identity** — what is it, who's it for, what stage?
- **Lifecycle position** — is the product where it should be for this stage?
- **Claims credibility** — does the deck match reality?
- **Moat assessment** — is this product defensible?
- **Features with source attribution** — what's verified vs what's claimed?
- **Strengths vs risks balance** — product health at a glance
- **Data gaps** — what's missing, how much it matters, what to do about it
