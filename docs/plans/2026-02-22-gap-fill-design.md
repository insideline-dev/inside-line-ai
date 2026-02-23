# Gap Fill Redesign (Agentic + Per-Field Priority)

## Goals
- Make Gap Fill agentic and accurate while minimizing irrelevant external search.
- Apply per-field priority: stop searching once a field is resolved by a higher-priority source.
- Align AI flow canvas order with real pipeline order.
- Ensure Gap Fill consumes all uploaded docs (pitch deck + data room), website scraping, and email context.
- Update DB only for missing or corrected fields, with provenance tracked.

## Non-Goals
- Redesigning the broader AI pipeline beyond flow ordering/representation.
- Changing downstream research/evaluation logic.

## Current Issues
- Flow canvas shows Gap Fill first, but real pipeline runs extraction first.
- Gap Fill is labeled as a system node, though it is AI-driven.
- Gap Fill searches for irrelevant info; it doesn’t constrain search to missing fields.
- Gap Fill doesn’t use uploaded docs beyond deck extraction or email context in a structured way.

## Proposed Approach (Recommended)
Hybrid deterministic resolution + agentic synthesis:
- Deterministic per-field resolver steps through sources in priority order and fills what it can.
- AI synthesis runs only for remaining gaps and suspicious fields.
- Web search runs only for remaining gaps.

### Source Priority (Per Field)
1. Submitted DB + form data (ground truth unless contradicted by multiple sources)
2. Pitch deck extraction + data room document extraction (same tier)
3. Website scraping
4. Email context
5. External web search

If a field is resolved at a higher tier, lower tiers are not consulted for that field unless it is flagged suspicious.

## Flow / Pipeline Alignment
- Pipeline order should be reflected in the AI flow canvas:
  - `EXTRACTION` + `SCRAPING` (parallel)
  - `ENRICHMENT (Gap Fill)`
  - `RESEARCH` → `EVALUATION` → `SYNTHESIS`
- Gap Fill node should be `prompt` (agentic), not `system`.

## Gap Fill Logic
- Compute missing fields and suspicious fields.
- Resolve per-field from internal sources in priority order:
  - DB/form
  - Deck extraction + data room extraction
  - Website scraping
  - Email context
- Only remaining gaps trigger web search.
- AI synthesis sees:
  - Current DB/form data
  - Deck + data room extraction
  - Website scraping summary
  - Email context
  - Resolved internal fields
  - Remaining gaps
  - Web search results
- Corrections are only applied when:
  - Multiple sources agree
  - Existing value is demonstrably wrong
  - Confidence >= 0.85

## Output + DB Writes
- Keep `EnrichmentResult` structure, add/ensure:
  - `dataProvenance` per field
  - `fieldsEnriched`, `fieldsCorrected`, `fieldsStillMissing`
  - `sources` list with URLs (exclude irrelevant sources)
- DB updates:
  - Only fill missing fields or apply validated corrections
  - Track updates in `dbFieldsUpdated` for audit

## Testing
- Update existing enrichment tests to cover:
  - Per-field priority stopping
  - Web search only for remaining gaps
  - Email context usage
  - Data room extraction inclusion
  - Flow order alignment in catalog

