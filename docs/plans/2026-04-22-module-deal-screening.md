# Module Architecture — Deal Screening

## Objective
Deal screening should become the top-of-funnel decision engine for Inside Line.

Its role is to quickly determine whether an incoming deal should be rejected, held for more information, escalated for human review, or passed into deeper diligence support.

---

## Why this module matters
This module creates funnel discipline.

Without it:
- too many weak or incomplete deals reach diligence
- analysis cost rises unnecessarily
- first-pass decisions become inconsistent
- follow-up workflows become reactive instead of intentional

With it:
- the platform gets a clear front door
- routing becomes structured
- diligence resources go to stronger opportunities
- user trust improves through explainable outcomes

---

## Position in product flow
Recommended flow:

`ingest -> normalize -> classify -> screen -> route`

Possible outcomes:
- reject
- request more information
- send to diligence support
- escalate to human review
- later: fast-track exceptional opportunities

---

## Inputs
- startup submissions
- pitch decks and uploaded documents
- email-originated deals
- referral notes
- founder-provided metadata
- future CRM-imported opportunities
- prior startup interaction history if it exists

---

## Core subcomponents

## 1. Intake layer
### Purpose
Accept deals from multiple sources and create canonical records.

### Responsibilities
- create or match startup/deal entity
- attach source channel
- register artifacts
- deduplicate when startup already exists
- preserve provenance of submission source

### Why it matters
Everything downstream depends on a clean canonical deal object.

---

## 2. Normalization layer
### Purpose
Turn messy, incomplete submission data into standard structured fields.

### Example outputs
- startup name
- founding team
- geography
- sector
- stage
- business model
- fundraising ask
- traction indicators
- completeness level

### Design principle
Use deterministic extraction first where possible, then AI extraction for ambiguity, with confidence tracking.

---

## 3. Classification layer
### Purpose
Map startup into internal categories used by rest of system.

### Typical dimensions
- sector
- stage
- business model
- geography
- thesis bucket
- specialist-agent routing category

### Why it matters
Later specialist architecture depends on this layer being reliable.

---

## 4. Screening engine
### Purpose
Run fast first-pass judgment.

### Evaluation concerns
- thesis fit
- completeness
- quality of submission
- obvious red flags
- initial signal strength
- uncertainty level

### Design principle
This layer should be structured, fast, explainable, and much cheaper than diligence support.

---

## 5. Routing engine
### Purpose
Translate screening output into next process state.

### Example routes
- low fit and high confidence -> reject
- insufficient information -> request more information
- strong enough fit -> diligence support
- uncertain or strategic edge case -> human review

### Design principle
Routing should be explicit and auditable.

---

## 6. Explanation layer
### Purpose
Make every outcome understandable.

### Example explanation outputs
- decision rationale
- key signals used
- missing information list
- confidence score
- recommended next step

### Why it matters
Trust depends on transparent reasoning, especially for rejections and borderline decisions.

---

## Outputs
- normalized startup profile
- classification output
- screening score
- screening rationale
- confidence level
- missing information request list
- route decision
- route explanation
- specialist recommendation later when relevant

---

## Shared dependencies
- canonical startup/deal model
- artifact layer
- interaction timeline
- workflow orchestration layer
- Clara or future communication layer for follow-up
- notification system
- future specialist registry

---

## Human-in-loop design
Human review should exist for:
- low-confidence classification
- borderline deals
- strategic exceptions
- sensitive or high-value rejections

This prevents over-automation at top of funnel.

---

## Strategic role over time
Deal screening should become the product's operating gate.

Near term, it controls intake quality.
Later, it becomes smarter by using:
- specialist agents
- prior interaction history
- meeting intelligence outputs
- investor-specific thesis context

---

## One-line framing
Deal screening answers: **should we spend deeper time on this deal, and why?**
