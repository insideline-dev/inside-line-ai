# Team Tab — Final UI Specification

## Section 1: Score Card

**Team Score** displayed prominently (e.g., 88/100) with weight percentage in overall evaluation and confidence badge (Low / Mid / High).

> Dev: score → `scoring.overallScore` (number). Confidence → `scoring.confidence` (string: "high", "mid", "low"). Weight % comes from the scoring config/orchestrator, not the eval agent output.

**Scoring Basis One-Liner** — displayed directly under the score in smaller, muted text. Gives immediate context for why the score landed where it did.

> Dev: → `scoring.scoringBasis` (string).

**Sub-Score Breakdown** — mini-bars below the main score, one per weighted sub-dimension. Dimensions and weights vary by stage (e.g., Seed: Founder Quality / Team Composition / Co-Founder Dynamics. Series D: Public Company Readiness / Board Composition / Key Person Risk). Bar length reflects sub-score (0–100), weight label shown next to the dimension name, bar color reflects score range (green >75, yellow 50–75, red <50).

> Dev: → `scoring.subScores[]` (array of objects, each with dimension/string, weight/number, score/number). Render dynamically — iterate the array, don't hardcode dimension names.

---

## Section 2: Team Composition

**Capability Coverage Grid** — four capability badges in a 2×2 grid. Each badge shows the capability name, an icon, and a filled (green checkmark) or unfilled (grey X) state. A coverage counter (e.g., "4/4 covered" or "3/4 covered") displayed as a summary.

| Business Leadership | Technical Capability |
|---|---|
| Domain Expertise | GTM Capability |

> Dev: → `teamComposition.businessLeadership` (boolean), `teamComposition.technicalCapability` (boolean), `teamComposition.domainExpertise` (boolean), `teamComposition.gtmCapability` (boolean). Coverage counter = count of true values out of 4.

**Composition Summary** — two-sentence summary of the overall team composition displayed below the grid.

> Dev: → `teamComposition.sentence` (string).

**Composition Reason** — one-line explanation of the key gap or strength.

> Dev: → `teamComposition.reason` (string).

---

## Section 3: Founder-Market Fit

**Founder-Market Fit Score** — prominent score card (0–100) with a visual indicator (color-coded: green >75, yellow 50–75, red <50).

> Dev: → `founderMarketFit.score` (number).

**Fit Explanation** — two-sentence narrative explaining why the founders are (or aren't) a strong fit for this specific problem and stage.

> Dev: → `founderMarketFit.why` (string).

---

## Section 4: Team Member Cards

**Collapsible Member Cards** — one card per team member, collapsed by default.

**Collapsed state** shows: name, role, and a one-line relevance summary from the eval agent.

**Expanded state** shows two sections:

1. **Eval Agent Assessment** — relevance (why this person matters), key strengths, key risks/gaps. All from the eval agent output.

2. **LinkedIn Profile** (from Unipile API, not eval agent) — bio, experience timeline, education. This data is joined by name/role match at the frontend layer.

> Dev: eval agent data → `teamMembers[]` (array of objects: name/string, role/string, relevance/string, strengths/string, risks/string). LinkedIn data comes from Unipile API separately — join by name/role. Default state: collapsed. No source badges on cards.

---

## Section 5: Strengths & Risks

Two-column layout — green strengths on the left, red risks on the right. Same visual pattern as market and product tabs.

Left column: green checkmark icons with strength labels.
Right column: red/yellow warning icons with risk labels.

> Dev: strengths → `strengths` (string). Risks → `risks` (string). Parse on newlines or bullet delimiters to render as individual list items in each column.

---

## Section 6: Data Gaps & Diligence

**Unified Data Gaps Checklist** — each item rendered as a checklist row with three fields:

- **Gap description** — what information is missing
- **Impact indicator** — tagged as Critical (would change score/recommendation), Important (would change confidence), or Minor (contextual, nice-to-have). Rendered as a colored badge.
- **Suggested action** — what diligence step would resolve this gap

> Dev: → `dataGaps[]` (array of objects: gap/string, impact/string, suggestedAction/string). Impact values are "critical", "important", or "minor" — map to red, yellow, and grey badges respectively.

---

## Fields Not Rendered on Team Tab

> Dev: `narrativeSummary` (string, 450–650 word narrative) → used on Summary/Memo tabs. `sources` (string) → used on Sources tab. `founderPitchRecommendations[]` (array of objects: deckMissingElement, whyItMatters, recommendation) → used on Recommendations tab. `founderRecommendations[]` (array of objects: action, recommendation) → used on Recommendations tab.

---

## Design Philosophy

The Team tab is a **team due diligence dashboard** where the most important questions are answered visually:

- **Score card** — how strong is this team overall?
- **Capability coverage** — are the key roles filled?
- **Founder-market fit** — are these the right founders for this problem?
- **Team member assessments** — who are they, and what does the eval say about each?
- **Strengths vs risks balance** — team health at a glance
- **Data gaps** — what's missing, how much it matters, what to do about it
