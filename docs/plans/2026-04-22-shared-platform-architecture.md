# Shared Platform Architecture

## Purpose
This document describes the shared platform layers that should support every major future module in Inside Line.

The goal is to avoid building disconnected tools. Instead, the product should evolve as one shared operating system for deals, diligence, communication, meetings, and ecosystem intelligence.

---

## 1. Canonical entity layer
All modules should operate on the same core records.

### Core entities
- Startup
- Deal
- Investor
- Founder / Contact
- Interaction
- Meeting / Call
- Artifact / Document
- Analysis Output
- Decision

### Role of this layer
- give every module same source of truth
- avoid duplicate records across screening, diligence, Clara, and meeting systems
- make history and state reusable across all workflows

### Principle
If a module learns something important, it should enrich shared entities rather than create private copies.

---

## 2. Shared interaction timeline
All external and internal process events should normalize into one timeline.

### Example events
- startup submitted
- email received
- WhatsApp message sent
- call completed
- meeting transcript added
- document uploaded
- screening rejected
- diligence completed
- follow-up requested
- investor requested information

### Role of this layer
- gives AI agents and humans common history
- supports auditability
- lets modules react to the same event stream
- supports future reporting and CRM sync

### Principle
Channels differ. Interaction history should not.

---

## 3. Artifact and data room layer
This layer stores and links all files and generated outputs.

### Artifact examples
- pitch decks
- financial models
- uploaded documents
- voice notes
- call recordings
- transcripts
- meeting summaries
- investment memos
- generated PDFs

### Role of this layer
- preserve evidence and provenance
- feed screening, diligence, and meeting intelligence
- let Clara and users request or attach additional materials

### Principle
Every artifact should attach to canonical startup/deal context.

---

## 4. Workflow orchestration layer
This layer handles deterministic staged processes.

### Responsibilities
- job scheduling
- retries
- state transitions
- progress tracking
- human checkpoints
- queue-backed async execution

### Main consumers
- deal screening
- diligence support
- meeting post-processing
- report generation
- future onboarding and follow-up workflows

### Principle
Workflow logic should control order and state. Agent logic should handle reasoning inside steps.

---

## 5. Shared agent runtime
This layer supports AI behavior across product.

### Main responsibilities
- prompt/runtime configuration
- tool access
- context assembly
- retrieval hooks
- schema-constrained outputs
- safety and evaluation hooks

### Main consumers
- screening agents
- diligence agents
- Clara
- meeting copilot behaviors
- sector-specialist agents
- startup ecosystem agent

### Principle
Different agents should be configurations on shared runtime, not isolated AI stacks.

---

## 6. Channel and integration adapter layer
This layer abstracts external systems.

### Target systems
- email
- WhatsApp / SMS / phone
- meeting providers
- calendar systems
- CRM systems
- social/contact enrichment systems

### Role of this layer
- normalize inbound and outbound communication
- protect product logic from vendor lock-in
- allow channels to evolve independently from core product design

### Principle
Business logic should depend on stable domain adapters, not vendor-specific details.

---

## 7. Notification and escalation layer
This layer supports user awareness and human-in-loop review.

### Responsibilities
- realtime updates
- task and reminder notifications
- approval requests
- escalation to operators for ambiguous or sensitive cases

### Principle
External-facing or low-confidence actions should be easy to review and override.

---

## 8. Retrieval and knowledge layer
This layer should grow over time as corpus grows.

### Initial scope
- structured retrieval from canonical entities
- artifact metadata retrieval
- prior interaction lookup
- basic context assembly

### Later scope
- deeper search over documents, transcripts, and relationship history
- semantic retrieval when corpus size and complexity justify it
- ecosystem memory across startups, founders, and investors

### Principle
Start structured. Add semantic retrieval only when needed.

---

## 9. Product-wide architecture principle
Inside Line should be built as:

- one shared context layer
- one shared workflow layer
- one shared agent runtime
- one shared interaction timeline
- many modules on top

This makes future modules easier to add while keeping product coherent.
