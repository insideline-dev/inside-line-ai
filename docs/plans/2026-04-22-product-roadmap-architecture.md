# Inside Line — Product Roadmap and High-Level Architecture

## Purpose
This document is a high-level roadmap and architecture view for how Inside Line can evolve from the current diligence support product into a broader multi-module deal platform.

It is meant to support roadmap discussions, product sequencing, and future technical design. It does **not** describe implementation details.

---

## 1. Core architecture direction
Inside Line should evolve as a **shared deal operating system** rather than a set of disconnected tools.

That means building around a small set of shared platform layers:
- **Canonical data layer** for startups, deals, investors, founders, meetings, interactions, and documents
- **Workflow orchestration layer** for staged, trackable, asynchronous jobs
- **Agent runtime layer** for AI agents, specialists, and communication copilots
- **Channel and integration layer** for email, WhatsApp, phone, meetings, CRM, and future external systems
- **Artifact and timeline layer** for transcripts, decks, notes, PDFs, recordings, and generated outputs

Big principle: every future module should read from and write to the same shared context.

---

## 2. Strategic roadmap shape
The product can be framed as a progression:

**screen → analyze → interact → learn → specialize**

### Stage 1 — Screen
Decide whether an incoming deal is worth deeper review.

### Stage 2 — Analyze
Run diligence support, deeper research, scoring, and synthesis.

### Stage 3 — Interact
Coordinate investors, founders, follow-ups, requests, meetings, and communication.

### Stage 4 — Learn
Capture meetings, calls, transcripts, documents, and relationship signals into shared memory.

### Stage 5 — Specialize
Add sector-specific intelligence and ecosystem-level workflows on top of common infrastructure.

---

## 3. Shared platform architecture
Before too many standalone modules are added, the platform should standardize a few common layers.

### A. Canonical entity layer
Everything should revolve around shared core records:
- Startup
- Deal
- Investor
- Founder / Contact
- Interaction
- Meeting / Call
- Document / Artifact
- Analysis Output
- Decision

Every module should enrich these objects rather than create parallel copies.

### B. Shared interaction timeline
All communication and activity should normalize into a common event stream.
Examples:
- email received
- WhatsApp message sent
- phone call happened
- meeting transcript added
- document uploaded
- diligence complete
- screening rejected
- follow-up requested

This lets Clara, diligence support, screening, and meeting intelligence all consume the same history.

### C. Workflow orchestration layer
For deterministic business processes and long-running jobs:
- staged execution
- retries
- progress tracking
- state transitions
- human review checkpoints

This layer should drive screening, diligence support, report generation, and future meeting processing.

### D. Agent runtime layer
For AI behaviors that use tools, prompts, retrieval, and decision support.
This should be shared across:
- screening agents
- diligence agents
- Clara
- meeting copilot behaviors
- sector specialists
- startup ecosystem agent

The goal is one runtime with different configurations, not many unrelated AI systems.

### E. Channel and integration adapter layer
External systems should be wrapped behind stable adapters.
Target channels and systems:
- Email
- WhatsApp / SMS / phone
- Meeting platforms
- Calendar systems
- CRM
- social/contact enrichment

Business logic should not depend directly on one vendor.

---

## 4. Recommended module roadmap

### Module 1 — Deal Screening
**Why it matters**
This should become the new front door to the product. It creates funnel discipline and decides what deserves deeper diligence.

**Role in system**
- accept inbound deals
- normalize inputs
- classify startup
- score fit and readiness
- route to rejection, request-more-info, or diligence support

**Architecture role**
Deal screening should be a lightweight, fast, explainable workflow. It should be separate from deep diligence.

**Key design principle**
It should route into diligence support, not duplicate it.

---

### Module 2 — Diligence Support
**Why it matters**
This is current core product and remains deep-analysis engine.

**Role in system**
- process accepted or escalated deals
- gather source material
- run research and evaluation workflows
- synthesize outputs into investor-facing reports

**Architecture role**
Diligence support should remain heavier, slower, and more evidence-rich than screening. It becomes downstream engine after triage.

**Key design principle**
Outputs from diligence should become reusable structured context for later modules, not isolated reports.

---

### Module 3 — Meeting Intelligence
**Why it matters**
Important meetings and calls generate proprietary context that should feed screening, diligence, and relationship management.

**Role in system**
- join meetings or ingest recordings
- transcribe and summarize conversations
- extract action items, claims, concerns, and next steps
- write outputs back into deal timeline and data room

**Architecture role**
Meeting intelligence should enrich shared context. It should not become its own silo.

**Key design principle**
All meeting outputs should attach to same canonical startup/deal records and interaction timeline.

---

### Module 4 — Clara / Account Manager Agent
**Why it matters**
The product needs an operational relationship layer, not only analysis.

**Role in system**
- communicate with investors and founders
- request missing information
- follow up on tasks and deadlines
- coordinate process progression across channels
- escalate to humans when needed

**Architecture role**
Clara should act as workflow-facing communication agent sitting on top of shared deal state and shared interaction history.

**Key design principle**
Clara should not own source-of-truth business records. It should orchestrate around them.

---

### Module 5 — Sector-Specialist Agents
**Why it matters**
As coverage expands, the platform needs deeper domain expertise without rebuilding architecture each time.

**Role in system**
- add sector-specific reasoning and evaluation
- apply specialized rubrics and retrieval context
- support screening and diligence in vertical-specific ways

Examples:
- AI specialist
- robotics specialist
- hardware specialist
- foodtech specialist

**Architecture role**
These should be thin expert layers on top of one shared agent runtime.

**Key design principle**
Different expertise, same infrastructure.

---

### Module 6 — Startup Ecosystem Agent
**Why it matters**
Long term, the product should not only serve investors evaluating deals, but also support startup engagement and ecosystem intelligence.

**Role in system**
- engage startups
- guide applications and submissions
- provide feedback loops
- surface ecosystem signals and relationships
- support sourcing and market context over time

**Architecture role**
This module should build on shared records, communication channels, and knowledge context already created by the rest of the system.

**Key design principle**
It should extend ecosystem visibility, not create a parallel startup-only platform.

---

## 5. Module-by-module architecture view

## A. Deal Screening
### Objective
Create top-of-funnel decision engine.

### Inputs
- inbound startup submissions
- decks and docs
- email or channel-originated submissions
- basic company metadata
- prior interactions if they exist

### Core subcomponents
- intake normalization
- classification engine
- screening rubric / scoring engine
- routing engine
- explanation layer
- human review queue for edge cases

### Outputs
- rejection
- request for more information
- pass to diligence support
- structured screening record for auditability

### Dependencies on shared platform
- canonical startup/deal model
- artifact storage
- workflow orchestration
- Clara for follow-up if info missing

### Design note
This module should be fast, explainable, and cheaper than diligence support.

---

## B. Diligence Support
### Objective
Run deeper evaluation after screening or manual escalation.

### Inputs
- accepted deals from screening
- uploaded decks, docs, data room artifacts
- external research and enrichment
- meeting outputs when available

### Core subcomponents
- intake and context loader
- research workflows
- evaluation workflows
- synthesis and memo generation
- evidence tracking
- investor-facing report layer

### Outputs
- investment memo
- score breakdowns
- supporting evidence and sources
- follow-up requests
- decision support artifacts

### Dependencies on shared platform
- workflow orchestration
- artifact layer
- shared context records
- notifications
- Clara for outbound requests and follow-ups

### Design note
This remains heavier and more comprehensive than screening, but should gradually align to same shared context model.

---

## C. Meeting Intelligence
### Objective
Turn conversations into structured deal intelligence.

### Inputs
- live meetings
- uploaded recordings
- WhatsApp voice notes
- phone calls
- notes and transcripts

### Core subcomponents
- meeting ingestion layer
- transcription layer
- summarization and extraction layer
- action-item / claim extraction
- context linker to startup/deal entities
- writeback to timeline and data room

### Outputs
- meeting summary
- action items
- extracted claims and concerns
- transcript artifact
- updated relationship and diligence context

### Dependencies on shared platform
- integration adapters
- artifact layer
- shared interaction timeline
- notifications
- optional CRM sync later

### Design note
Meeting intelligence should make rest of system smarter, not become isolated note-taking tool.

---

## D. Clara / Account Manager Agent
### Objective
Keep process moving through communication and coordination.

### Inputs
- deal state
- missing information requests
- investor and founder interactions
- deadlines and workflow triggers
- meeting outputs and diligence findings

### Core subcomponents
- conversation manager
- channel router
- follow-up engine
- reminder/task engine
- escalation and approval layer
- context-aware reply generation

### Outputs
- messages and follow-ups
- reminders
- status nudges
- human escalation prompts
- collected missing information

### Dependencies on shared platform
- interaction timeline
- integration adapters
- shared context layer
- workflow engine
- notification system

### Design note
Clara should be operational glue across product, not only email assistant.

---

## E. Sector-Specialist Agents
### Objective
Add differentiated vertical expertise on top of existing platform.

### Inputs
- startup profile
- sector-specific docs and signals
- shared deal context
- market and company retrieval

### Core subcomponents
- specialist prompt/config pack
- sector retrieval context
- specialized scoring rubric
- common runtime hooks
- common output schema

### Outputs
- specialist perspective
- sector-adjusted assessment
- vertical-specific risks and opportunities
- support for screening and diligence decisions

### Dependencies on shared platform
- shared agent runtime
- shared data model
- retrieval layer
- workflow hooks from screening/diligence

### Design note
Best built as plugins/configurations, not standalone systems.

---

## F. Startup Ecosystem Agent
### Objective
Build external-facing startup intelligence and engagement layer.

### Inputs
- startup interactions
- submission pipelines
- founder communication
- ecosystem data and relationships
- internal deal and market context

### Core subcomponents
- startup communication layer
- submission guidance flow
- feedback and recommendation engine
- ecosystem memory / relationship map
- sourcing support layer

### Outputs
- startup feedback
- guided application progress
- relationship insights
- sourcing suggestions
- ecosystem intelligence signals

### Dependencies on shared platform
- Clara-like communication primitives
- shared context layer
- interaction timeline
- retrieval/knowledge layer
- future CRM and ecosystem graph capabilities

### Design note
This module becomes more powerful after communication, timeline, and knowledge layers mature.

---

## 6. Recommended sequencing
### Phase 1 — Shared foundation
Standardize canonical entities, interaction timeline, artifact model, and workflow patterns.

### Phase 2 — Deal screening
Build front-door routing and funnel discipline.

### Phase 3 — Diligence support alignment
Keep current engine, but align outputs and context to shared model.

### Phase 4 — Clara expansion
Turn Clara into broader relationship orchestration layer.

### Phase 5 — Meeting intelligence
Capture calls, transcripts, and live interaction context.

### Phase 6 — Sector specialists
Add domain expertise on top of stable runtime.

### Phase 7 — Ecosystem intelligence
Expand into startup-facing and network-aware workflows.

---

## 7. Technology direction at high level
### Keep as core
- NestJS backend
- React frontend
- PostgreSQL as source of truth
- Redis/BullMQ for async orchestration
- object storage for artifacts
- realtime notifications and live status updates

### Add over time
- meeting provider adapters
- calendar adapters
- transcription provider abstraction
- CRM sync adapter layer
- search / semantic retrieval only when corpus size justifies it

Important principle: add vendor capabilities behind adapters, not directly into product logic.

---

## 8. Final framing for roadmap discussions
If explained simply, the roadmap is:

- **Near term:** build deal screening as top-of-funnel gate
- **Mid term:** unify diligence, Clara, and meeting intelligence around shared deal context and shared interaction history
- **Long term:** add specialist and ecosystem agents as configuration layers on top of the same platform foundation

This gives a clean product story:

**one platform, one context layer, many workflows and agents**
