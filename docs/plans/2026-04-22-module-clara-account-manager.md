# Module Architecture — Clara / Account Manager

## Objective
Clara should evolve into the operational relationship and coordination layer of Inside Line.

Its role is not only to answer messages, but to keep deals moving by communicating, following up, collecting information, and triggering the right next steps across channels.

---

## Why this module matters
Analysis alone does not move deals forward.

The platform also needs a persistent coordination agent that can:
- request missing information
- remind stakeholders
- keep timelines active
- reduce manual operational burden
- connect screening, diligence, and meetings into one process loop

---

## Position in product flow
Clara is cross-cutting.

It should support:
- pre-screening intake follow-up
- screening clarification requests
- diligence support requests for more material
- meeting scheduling and recap follow-up
- ongoing investor and founder communication

---

## Inputs
- deal state
- startup and investor context
- prior interaction history
- missing information lists
- screening and diligence outputs
- meeting outputs
- workflow triggers and deadlines

---

## Core subcomponents

## 1. Conversation manager
### Purpose
Handle persistent relationship threads across channels.

### Channels
- email
- WhatsApp
- future SMS / phone follow-up
- future CRM-linked communication tasks

### Design principle
Conversation state should be unified even when channel changes.

---

## 2. Context builder
### Purpose
Assemble the right context before Clara acts.

### Context examples
- current deal stage
- latest investor or founder message
- missing information requests
- open diligence questions
- upcoming deadlines
- prior promises and commitments

### Why it matters
Clara quality depends on acting from real context, not generic chat behavior.

---

## 3. Follow-up engine
### Purpose
Drive next actions proactively.

### Typical behaviors
- request documents
- remind stakeholders about deadlines
- confirm next steps
- nudge on unanswered questions
- provide progress updates

### Design principle
Clara should be event-triggered and workflow-aware, not only reactive.

---

## 4. Escalation and approval layer
### Purpose
Decide when human review is needed.

### Typical escalation cases
- ambiguous requests
- sensitive investor communication
- high-stakes rejection or exception handling
- low-confidence external responses

### Why it matters
Operational agents need strong guardrails for trust and control.

---

## 5. Action bridge
### Purpose
Connect communication to system actions.

### Potential actions
- mark requested information as received
- open human review task
- update workflow state
- schedule follow-up
- attach new artifacts
- trigger next module step

### Design principle
Clara should be connected to process state, not isolated in communication silo.

---

## Outputs
- messages and follow-ups
- reminders and nudges
- updated communication timeline
- collected missing information
- escalations to human users
- workflow updates driven by communication events

---

## Shared dependencies
- canonical startup/deal/contact entities
- shared interaction timeline
- integration adapters
- workflow orchestration layer
- notification layer
- artifact store
- screening, diligence, and meeting outputs

---

## Strategic evolution
Near term, Clara is process assistant.

Mid term, Clara becomes full account-manager operating layer across investors and founders.

Long term, Clara can coordinate many workflows while still relying on shared context and human review for sensitive decisions.

---

## Design warning
Clara should not become a second system of record.

It should orchestrate around core records, not own them.

---

## One-line framing
Clara answers: **who needs to do what next, and how do we keep process moving across channels?**
