# Module Architecture — Sector-Specialist Agents

## Objective
Sector-specialist agents add domain expertise to the shared platform without requiring separate systems for each vertical.

Their role is to bring stronger sector judgment into screening, diligence, meetings, and future ecosystem workflows.

---

## Why this module matters
General reasoning is useful, but category-specific diligence often depends on domain context.

Examples:
- AI companies need different evaluation lenses than foodtech companies
- robotics companies have hardware, deployment, and manufacturing concerns
- hardware companies face supply chain and certification issues
- vertical-specific signals influence thesis fit, defensibility, and risk

---

## Position in product flow
Sector specialists should not be standalone products.

They should plug into:
- deal screening
- diligence support
- meeting prep and meeting interpretation
- future founder guidance and ecosystem workflows

---

## Inputs
- startup profile and classification
- shared deal context
- uploaded artifacts
- market and interaction history
- sector-specific retrieval context

---

## Core subcomponents

## 1. Specialist configuration pack
### Purpose
Define what makes one specialist different from another.

### Typical contents
- sector taxonomy
- domain prompts
- specialized scoring dimensions
- red-flag patterns
- key diligence questions
- retrieval rules

### Design principle
Specialists should mostly differ by configuration and expertise packs, not by runtime architecture.

---

## 2. Shared runtime hooks
### Purpose
Ensure all specialists run on same core infrastructure.

### Shared needs
- common context loading
- common output schemas
- common tool interfaces
- common evaluation and guardrail framework

### Why it matters
This makes specialists easy to add, compare, and maintain.

---

## 3. Sector retrieval layer
### Purpose
Bring in relevant context for each domain.

### Examples
- market structures
- common risk patterns
- technical constraints
- sector-specific diligence templates

### Design principle
Retrieval context should vary by sector while base workflow remains stable.

---

## 4. Specialist output layer
### Purpose
Feed expert judgment back into product workflows.

### Example outputs
- sector-adjusted fit view
- specialized risks
- specialized opportunities
- deeper domain questions
- recommendation for downstream diligence focus

### Why it matters
Specialists should strengthen platform decisions, not create disconnected reports.

---

## Example specialist types
- AI specialist
- robotics specialist
- hardware specialist
- foodtech specialist
- future fintech, climate, healthtech, or enterprise software specialists

---

## Shared dependencies
- shared agent runtime
- canonical startup/deal model
- screening classification layer
- diligence support workflows
- artifact and retrieval layers
- interaction history

---

## Why this should come later
Sector specialists become valuable after base platform is stable.

They depend on:
- good classification
- good shared schemas
- stable workflow hooks
- mature context layer

Without those, specialists create complexity too early.

---

## Strategic role over time
Sector-specialist agents become one of the clearest product differentiators once core workflows are mature.

They allow the platform to scale depth of judgment without rebuilding architecture each time.

---

## One-line framing
Sector-specialist agents answer: **what does expert vertical judgment add to this deal beyond the general platform view?**
