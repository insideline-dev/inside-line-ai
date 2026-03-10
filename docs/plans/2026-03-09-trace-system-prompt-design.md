# Trace System Prompt Design

**Goal:** Show the exact per-agent system prompt inside the existing admin pipeline live trace modal, alongside the currently visible user prompt.

## Scope

- Keep the feature inside the existing agent trace dialog in `Pipeline Live`.
- Do not change the surrounding live panel layout or activity list behavior.
- Preserve the current user prompt display as the default view.

## Decisions

### Data model

- Add `systemPrompt` as a first-class trace field.
- Persist it with each `pipeline_agent_runs` row instead of hiding it inside `meta`.
- Expose it through the startup progress response DTO so the frontend gets it with the rest of the trace payload.

### Capture points

- Evaluation agent traces already compute both the composed system prompt and rendered user prompt. Persist both.
- Research traces already pass both `systemPrompt` and `prompt` through the research execution path. Persist both.
- Synthesis traces already have both `promptConfig.systemPrompt` and the rendered user prompt available. Persist both.
- Leave phase-step traces without a system prompt unless one is explicitly available.

### UI

- Keep the current trace modal.
- Replace the single raw `Input` text block with tabs:
  - `User Prompt`
  - `System Prompt`
- Default to `User Prompt`.
- Render a clear empty state when the system prompt was not captured.
- Keep `Output` and `Metadata` unchanged.

## Risks

- Existing trace rows will not have `systemPrompt`; the UI must handle missing data cleanly.
- The composed evaluation system prompt may include runtime guardrails and recovery instructions. That is desirable here because the goal is exact debugging visibility.
- This change touches trace persistence, so schema, DTO, and UI need to stay in sync.

## Test strategy

- Backend: verify `recordRun()` persists `systemPrompt`.
- Frontend: verify the trace input panel renders `User Prompt` and `System Prompt` tabs and defaults to the user prompt while still surfacing the system prompt content path.
