# Module Architecture — Diligence Support

## Objective
Diligence support is the deep-analysis engine of Inside Line.

Its role is to take deals that survive screening and produce structured, evidence-based decision support for investors.

---

## Why this module matters
This is where the platform moves from triage into actual conviction-building.

It should help answer:
- what is true about this company
- what are the major risks
- what are the strongest signals
- what questions remain unresolved
- what does an investor need to know before deciding next step

---

## Position in product flow
Recommended flow:

`screening accepted -> diligence support -> investor review -> next-step decision`

Diligence support should receive structured context from screening, not start from zero each time.

---

## Inputs
- accepted deals from screening
- normalized startup profile
- uploaded decks and data room files
- external research and enrichment
- future meeting intelligence outputs
- investor-specific context later when needed
- prior interactions and follow-up responses

---

## Core subcomponents

## 1. Context loader
### Purpose
Assemble complete deal context before heavy analysis begins.

### Responsibilities
- load screening output
- load startup and deal entities
- load artifacts and uploaded documents
- load prior interactions
- load open questions and missing info

### Why it matters
Deep analysis quality depends on a complete and consistent context package.

---

## 2. Research layer
### Purpose
Gather external and internal evidence relevant to the deal.

### Typical domains
- team
- market
- product
- competitors
- traction
- business model
- legal and commercial concerns
- financing context

### Design principle
This layer should favor evidence gathering and structured signal capture over generic narrative.

---

## 3. Evaluation layer
### Purpose
Turn collected evidence into structured judgments.

### Example dimensions
- team strength
- market attractiveness
- product quality
- go-to-market quality
- financial quality
- legal concerns
- deal terms
- competitive advantage
- exit potential

### Design principle
Evaluations should remain dimension-based so later specialists and investors can inspect reasoning clearly.

---

## 4. Synthesis layer
### Purpose
Produce investor-facing outputs from research and evaluation.

### Typical outputs
- investment memo
- score narrative
- risk summary
- strengths summary
- unresolved questions
- recommended next actions

### Why it matters
Investors need synthesis, not only raw findings.

---

## 5. Evidence and provenance layer
### Purpose
Preserve source linkage behind important claims.

### Responsibilities
- map findings to sources
- link claims to artifacts and research results
- maintain audit trail for generated outputs

### Design principle
Diligence should feel inspectable, not like a black box.

---

## Outputs
- investor memo
- structured score breakdowns
- source-backed findings
- risk and opportunity summary
- recommended follow-up questions
- diligence status and completion signals

---

## Shared dependencies
- canonical startup/deal model
- artifact and data room layer
- workflow orchestration
- interaction timeline
- Clara for follow-up requests
- notifications
- future meeting intelligence outputs
- sector specialists later

---

## Relationship to screening
Screening and diligence support should stay clearly separate.

### Screening
- fast
- lightweight
- triage-focused
- lower cost

### Diligence support
- deeper
- evidence-heavy
- more expensive
- conviction-focused

### Important principle
Diligence should consume structured screening outputs and expand them, not duplicate them.

---

## Future evolution
Over time, diligence support should become a living dossier for each important deal.

That means it should be able to absorb:
- new documents
- new founder responses
- meeting outputs
- updated market evidence
- specialist agent overlays

---

## One-line framing
Diligence support answers: **what do we actually think about this deal after deeper, evidence-backed analysis?**
