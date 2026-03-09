# Synthesis Exit Scenarios Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure synthesis revalidates and normalizes `exitScenarios` from `exitPotential` before final persistence and frontend use.

**Architecture:** The model-generated synthesis payload remains focused on memo/report content. After generation, synthesis will merge in `exitPotential.exitScenarios`, normalize and validate the merged payload through a final synthesis schema, and persist only the normalized result.

**Tech Stack:** NestJS, TypeScript, Zod, Bun test

---

### Task 1: Add failing regression test for synthesis-side exit-scenario normalization

**Files:**
- Create: `backend/src/modules/ai/tests/agents/synthesis-exit-scenarios.spec.ts`
- Modify: `backend/src/modules/ai/agents/synthesis/synthesis.agent.ts`

**Step 1: Write the failing test**

Add a test that proves synthesis:
- reads `exitScenarios` from `evaluation.exitPotential`
- returns them in canonical order
- preserves valid values
- drops to a safe empty array when the raw payload is invalid

**Step 2: Run test to verify it fails**

Run: `cd backend && bun test src/modules/ai/tests/agents/synthesis-exit-scenarios.spec.ts`

**Step 3: Write minimal implementation**

Add synthesis-side normalization and final merged-result schema validation.

**Step 4: Run test to verify it passes**

Run: `cd backend && bun test src/modules/ai/tests/agents/synthesis-exit-scenarios.spec.ts`

### Task 2: Tighten final synthesis schema contract

**Files:**
- Modify: `backend/src/modules/ai/schemas/synthesis.schema.ts`
- Modify: `backend/src/modules/ai/interfaces/phase-results.interface.ts`

**Step 1: Align the final schema**

Define a final synthesis schema that includes normalized `exitScenarios`.

**Step 2: Use the final schema in synthesis**

Parse the merged result after synthesis appends the normalized scenario payload.

### Task 3: Verify targeted backend correctness

**Files:**
- Review: `backend/src/modules/ai/agents/synthesis/synthesis.agent.ts`
- Review: `backend/src/modules/ai/schemas/synthesis.schema.ts`
- Review: `backend/src/modules/ai/tests/agents/synthesis-exit-scenarios.spec.ts`

**Step 1: Run focused tests**

Run:
- `cd backend && bun test src/modules/ai/tests/agents/synthesis-exit-scenarios.spec.ts`

**Step 2: Run backend typecheck**

Run:
- `cd backend && bunx tsc --noEmit`

