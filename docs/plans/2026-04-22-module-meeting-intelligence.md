# Module Architecture — Meeting Intelligence

## Objective
Meeting intelligence turns conversations into structured deal intelligence.

Its role is to capture meetings, calls, voice notes, and discussion artifacts, then feed that information back into the shared product context.

---

## Why this module matters
A large part of investment insight comes from conversations, not only decks and research.

This module should help preserve and structure:
- founder claims
- investor concerns
- action items
- contradictions
- commitments
- evolving sentiment and relationship context

---

## Position in product flow
Meeting intelligence can operate at multiple stages:
- before screening
- during diligence
- after investor meetings
- during founder follow-up
- as ongoing relationship memory

This makes it cross-cutting rather than a single one-time workflow.

---

## Inputs
- live meetings later
- uploaded meeting recordings
- phone calls
- WhatsApp voice notes
- transcripts
- manual notes
- deal and startup context
- prior interaction history

---

## Core subcomponents

## 1. Ingestion layer
### Purpose
Bring conversations into system regardless of source.

### Example sources
- meeting platforms
- telephony systems
- uploaded audio/video files
- voice notes
- manually attached notes

### Design principle
Ingestion should normalize source differences and route all conversations into a common meeting artifact model.

---

## 2. Transcription layer
### Purpose
Convert recorded speech into text for downstream reasoning.

### Design principle
This should be provider-abstracted so transcription quality can improve without changing module boundaries.

---

## 3. Live context layer
### Purpose
Support future live-copilot experiences.

### Potential use cases
- surface startup summary during meeting
- show investor-specific context
- show open diligence questions
- retrieve relevant claims or prior interactions in real time

### Design principle
Live assistance should read shared context rather than build its own memory silo.

---

## 4. Post-meeting extraction layer
### Purpose
Turn transcript and conversation data into structured outputs.

### Typical outputs
- summary
- action items
- concerns raised
- commitments made
- follow-up requirements
- contradictions with prior materials
- key claims needing validation

### Why it matters
This is the step that turns recordings into usable product intelligence.

---

## 5. Writeback layer
### Purpose
Attach meeting outputs back to core product state.

### Writeback targets
- interaction timeline
- meeting entity
- artifact store
- diligence follow-up queue
- Clara task/follow-up engine
- future CRM sync layer

### Design principle
Meeting intelligence creates value only if its outputs flow back into rest of system.

---

## Outputs
- transcript artifact
- meeting summary
- action items
- extracted claims and concerns
- follow-up tasks
- enriched deal and relationship context

---

## Shared dependencies
- canonical startup/deal/contact entities
- artifact layer
- interaction timeline
- integration adapters
- notification system
- Clara follow-up workflows
- diligence support for downstream evidence use

---

## Strategic value over time
This module creates proprietary memory that compounds.

As platform matures, meeting intelligence can become source for:
- better diligence context
- better follow-up automation
- improved investor relationship management
- stronger specialist-agent reasoning
- ecosystem intelligence later

---

## Design warning
This should not become a standalone note-taking tool.

Its value comes from enriching the shared deal system and feeding decision workflows.

---

## One-line framing
Meeting intelligence answers: **what happened in this conversation, and how should it change our understanding of the deal?**
