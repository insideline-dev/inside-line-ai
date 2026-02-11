# AI Pipeline Remaining Audit and Remediation Tracker

Last Updated: 2026-02-08
Scope: Active backend runtime code under `backend/src` (AI pipeline, startup/admin integration, Clara, AgentMail webhook path)

## Document Purpose

This document is the execution tracker for unresolved AI/Clara risks found in the backend audit. It is intended to be assignment-ready: each item includes severity, status, owner placeholder, evidence, required changes, acceptance criteria, and verification steps.

## Current Validation Snapshot

- `bunx tsc --noEmit` passed.
- `bun test src/modules/ai/tests` passed (`166` tests).
- `bun test src/modules/clara/tests src/modules/integrations/agentmail/tests src/modules/admin/tests/admin.controller.spec.ts src/modules/startup/tests/startup.service.spec.ts` passed (`236` tests).

## Priority Summary

| ID | Severity | Title | Status | Owner | Risk Area |
| --- | --- | --- | --- | --- | --- |
| A1 | High | Clara cannot be enabled with current config parsing | Open | TBD | Configuration/Runtime |
| A2 | High | Retry/rerun can be contaminated by stale active jobs | Open | TBD | Queue orchestration |
| A3 | High | Duplicate retry ownership (BullMQ + pipeline) | Open | TBD | Reliability/Idempotency |
| A4 | Medium | AgentMail webhook audit update scope is too broad | Open | TBD | Observability/Audit |
| A5 | Medium | Website scraping SSRF exposure | Open | TBD | Security |
| A6 | Medium | Research/evaluation provider routing is partially hardcoded | Open | TBD | Model routing |

## Remediation Items

### A1 High: Clara cannot be enabled with current config parsing

- Status: Open
- Owner: TBD

#### Problem

`ClaraService` reads `CLARA_INBOX_ID` and `CLARA_ADMIN_USER_ID`, but config loader returns only values defined in `envSchema`. Since these keys are not currently in `envSchema`, they are stripped and resolve to `undefined` at runtime.

#### Why It Matters

Clara stays disabled even when env vars exist in `.env`, so incoming Clara webhooks cannot run the intended submission flow.

#### Evidence

- `src/modules/clara/clara.service.ts:33`
- `src/modules/clara/clara.service.ts:35`
- `src/config/configuration.ts:5`
- `src/config/env.schema.ts:3`

#### Required Changes

- Add `CLARA_INBOX_ID` and `CLARA_ADMIN_USER_ID` to `src/config/env.schema.ts`.
- Add both variables to `.env.example` with comments.
- Clarify variable meaning in docs/comments:
  - `CLARA_INBOX_ID` is AgentMail internal inbox id (not inbox email).
  - `CLARA_ADMIN_USER_ID` is Inside Line app admin user UUID (not from AgentMail dashboard).

#### Acceptance Criteria

- Clara reports enabled when both vars are set.
- Startup submissions processed by Clara are created under configured app admin user id.
- Missing one/both values cleanly disables Clara with clear log message.

#### Verification Steps

- Unit tests for Clara enabled/disabled matrix.
- Manual config check in runtime logs.
- Trigger webhook path and confirm startup row `userId` equals configured `CLARA_ADMIN_USER_ID`.

### A2 High: Retry/rerun can be contaminated by stale active jobs

- Status: Open
- Owner: TBD

#### Problem

Pending jobs are removed for rerun/retry, but active jobs cannot be removed. Current guards rely on unchanged `pipelineRunId`, so stale active jobs can still write results into the current pipeline state.

#### Why It Matters

Creates race conditions and nondeterministic outcomes, especially during manual phase/agent retries.

#### Evidence

- `src/queue/queue.service.ts:260`
- `src/modules/ai/services/pipeline.service.ts:175`
- `src/modules/ai/services/pipeline.service.ts:222`
- `src/modules/ai/processors/run-phase.util.ts:42`

#### Required Changes

- Introduce strict run isolation for rerun/retry paths.
- Preferred: issue a new run identifier/token when resetting execution paths.
- Enforce stale-job rejection before writing phase status/results.

#### Acceptance Criteria

- Stale active jobs from pre-rerun cannot mutate new run state.
- Retry/rerun behavior is deterministic under concurrent worker timing.

#### Verification Steps

- Integration tests that simulate active old job + new rerun job overlap.
- Assert final state contains only new-run writes.

### A3 High: Duplicate retry ownership (BullMQ + pipeline)

- Status: Open
- Owner: TBD

#### Problem

Pipeline failure path enqueues retries while job errors are rethrown, allowing BullMQ retry attempts to also retry same work.

#### Why It Matters

Can duplicate execution, produce inconsistent telemetry, and amplify contention.

#### Evidence

- `src/queue/queue.config.ts:25`
- `src/modules/ai/processors/run-phase.util.ts:115`
- `src/modules/ai/processors/run-phase.util.ts:124`
- `src/modules/ai/services/pipeline.service.ts:384`

#### Required Changes

- Choose one retry owner for AI phase jobs.
- Recommended approach: set AI phase job `attempts` to `1` and keep retry orchestration in `PipelineService`.

#### Acceptance Criteria

- A phase failure produces one retry path only.
- No duplicate phase execution due to stacked retry mechanisms.

#### Verification Steps

- Failure-injection tests verifying retry counts and queued jobs.
- Queue-level assertions for single retry lineage per failure.

### A4 Medium: AgentMail webhook audit update scope is too broad

- Status: Open
- Owner: TBD

#### Problem

Webhook post-processing updates currently filter by `source + eventType`, which can update multiple historical rows instead of only the inserted webhook record.

#### Why It Matters

Audit history and replayability become unreliable.

#### Evidence

- `src/modules/integrations/agentmail/agentmail.service.ts:56`
- `src/modules/integrations/agentmail/agentmail.service.ts:69`
- `src/modules/integrations/agentmail/agentmail.service.ts:85`

#### Required Changes

- Capture inserted webhook row id.
- Update success/failure status by that row id only.
- Optional hardening: add provider event-id dedupe key.

#### Acceptance Criteria

- Exactly one webhook audit row is updated per processed event.
- Historical rows remain unchanged.

#### Verification Steps

- Test with multiple existing webhook rows and verify single-row update behavior.

### A5 Medium: Website scraping SSRF exposure

- Status: Open
- Owner: TBD

#### Problem

User-supplied website URLs are fetched server-side without private-network guardrails.

#### Why It Matters

Backend could be used to probe internal services/metadata endpoints.

#### Evidence

- `src/modules/startup/dto/create-startup.dto.ts:26`
- `src/modules/ai/services/scraping.service.ts:87`
- `src/modules/ai/services/website-scraper.service.ts:174`

#### Required Changes

- Block localhost, loopback, link-local, and private CIDR targets.
- Resolve DNS and reject private IP results.
- Enforce allowlisted schemes (`http`, `https`) only.

#### Acceptance Criteria

- Private/internal host targets are rejected before fetch.
- Public valid targets continue to scrape successfully.

#### Verification Steps

- Security tests for blocked host/IP classes.
- Regression tests for known public domains.

### A6 Medium: Research/evaluation provider routing is partially hardcoded

- Status: Open
- Owner: TBD

#### Problem

Research and evaluation paths directly use Gemini provider even though model-per-purpose config supports provider selection abstraction.

#### Why It Matters

Configuring non-Gemini models for these phases can fail unexpectedly and degrade to fallback behavior.

#### Evidence

- `src/modules/ai/services/gemini-research.service.ts:41`
- `src/modules/ai/agents/evaluation/base-evaluation.agent.ts:43`
- `src/modules/ai/services/ai-config.service.ts:47`
- `src/modules/ai/providers/ai-provider.service.ts:63`

#### Required Changes

- Use centralized model resolution for purpose-based provider selection.
- Keep provider logic only in `AiProviderService`.

#### Acceptance Criteria

- Research and evaluation can run with configured Gemini or GPT models via config only.
- No phase-specific provider hardcoding remains in execution paths.

#### Verification Steps

- Tests with evaluation/research model set to Gemini and GPT variants.
- Confirm model/provider selection path is consistent.

## Recommended Execution Order

1. A1 Clara config enablement gap.
2. A2 Run isolation for retry/rerun.
3. A3 Retry ownership cleanup.
4. A4 Webhook row-level update scope fix.
5. A5 SSRF hardening for website scraping.
6. A6 Provider routing unification.

## Cross-Cutting Verification

Run after each remediation batch:

- `bunx tsc --noEmit`
- `bun test src/modules/ai/tests`
- `bun test src/modules/clara/tests src/modules/integrations/agentmail/tests src/modules/admin/tests/admin.controller.spec.ts src/modules/startup/tests/startup.service.spec.ts`

## Assumptions

- All tracker items start at `Status: Open`.
- Owner defaults to `TBD` until explicitly assigned.
- This document is implementation-focused and intentionally keeps unresolved items actionable rather than descriptive only.
