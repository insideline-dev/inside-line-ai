# Synthesis Exit Scenarios Design

**Goal**

Move `exitScenarios` to the correct ownership boundary: produced by the `exitPotential` evaluation agent, then normalized and validated by synthesis before frontend consumption.

**Current State**

- `exitPotential` owns the raw `exitScenarios` payload.
- `SynthesisAgent` currently copies that array into the final result without a synthesis-stage schema check or normalization pass.
- The final synthesis result therefore inherits ordering, formatting, and completeness risk from evaluation output.

**Design**

1. Keep `exitPotential` as the source of truth for scenario economics.
2. Add a synthesis-side normalization step that:
   - validates structure against the exit-scenario schema
   - enforces the canonical order: `conservative`, `moderate`, `optimistic`
   - sanitizes strings and removes whitespace noise
   - coerces invalid or missing arrays to a safe empty fallback
3. Make synthesis validate the merged final payload, not just the model-only payload.
4. Persist only the normalized synthesis result, so frontend pages consume a page-ready shape.

**Why**

This keeps the analytical responsibility in `exitPotential`, while making synthesis the final presentation-quality gate for all outputs. That matches the role of synthesis in the rest of the pipeline: merge, reconcile, sanitize, and deliver a stable final contract.

