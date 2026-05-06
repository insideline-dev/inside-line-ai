# YUSUP PROJECT MEMORY

This file is the running project memory for Inside Line.
It should be updated after meaningful work so context accumulates inside the repo.

## Working agreement
- Keep a running record of what was changed, what was learned, current system understanding, active risks, and next-step context.
- Favor concise, durable notes over raw transcripts.

## 2026-05-05

### Current objective
- Own the `deal-screening` branch end to end and make it practical to develop, test, and validate against existing startups without re-uploading them.

### What I changed
- Cloned and ran `insideline-dev/inside-line-ai` locally with Docker Compose.
- Copied the repo root `.env` into `backend/.env` because the backend compose service reads its env from there.
- Fixed local auth email links by changing `FRONTEND_URL` from `http://localhost:3030` to `http://localhost:3000` in local env.
- Verified login with `yusufisbusy@gmail.com` and confirmed access reaches the admin dashboard.
- Implemented the first pass of deal-screening gating and related fixes on the local `deal-screening` branch.
- Rebuilt the stack from the current branch and tested on an existing approved startup instead of re-uploading a new one.

### What I learned
- Local dev stack runs at:
  - frontend: `http://localhost:3000`
  - backend: `http://localhost:8080`
- Admin login uses magic-link email flow and works in local dev after the `FRONTEND_URL` fix.
- Existing approved startup used for testing: `Path Robotics`
  - startup id: `51c16a55-70d8-4fdb-9de2-88d9a7fc0602`
- The original branch intent is that screening should act as a gate before evaluation, not a parallel sibling.
- For old startups after a restart, reusable pipeline state may be missing; in that case, the new screening action should still be useful by falling back to a full pipeline restart.

### Backend understanding from current pass
- Screening now gates evaluation in pipeline ordering.
- Founder timeline leakage and client-supplied triage snapshot issues were addressed.
- Screening rerun on an existing approved startup now falls back to a full pipeline restart when no reusable pipeline state exists.

### Frontend understanding from current pass
- Logout/login needed explicit clearing of investor-scoped UI state like thesis-axis filters.
- Investor onboarding website submission needed a pending local state so the "generating thesis" banner appears immediately on first run.
- Admin rerun UI now exposes screening as a rerun entry and supports clearer dev testing from an existing startup.

### Live validation status
- A real rerun was triggered on `Path Robotics` from the admin UI flow.
- Verified trigger path behavior and Pipeline Live progression on an existing startup.
- Confirmed one important failure mode first: screening produced a `reject` decision while evaluation still ran, which proved the original first-pass gating work was incomplete.
- Patched the pipeline so screening results are carried into runtime state and a `review`/`reject` outcome skips both evaluation and synthesis.
- Re-tested on `Path Robotics` after the patch.
- Final verified outcome on run `b1ad3add-190b-4d19-9aa2-8b17f1904679`:
  - screening completed
  - decision classification: `reject`
  - reason code: `low_overall_score`
  - startup status moved to `pending_review`
  - evaluation: `skipped`
  - synthesis: `skipped`
  - pipeline status: `completed`

### Evidence captured
- Admin dashboard screenshot after login.
- Existing startup Pipeline Live screenshot after rerun trigger.
- Pipeline Live screenshot showing the corrected gate behavior with evaluation and synthesis skipped.
- Additional login/dashboard screenshots from local validation.

### Open risks / things still to verify
- Whether `advance` deals continue cleanly into evaluation under the new gating semantics.
- Whether `review` classification should land in a distinct startup status versus the current `pending_review` handling.
- Whether screening reason codes / decision detail should be surfaced more explicitly in Pipeline Live instead of requiring API inspection.
- Any remaining controller-spec / repo-level typecheck issues not directly caused by these edits.

### Additional milestone — screening lens root-cause fix
- Found the concrete reason the screening verdict was not trustworthy: all three lenses were falling back because the shared `LensEvidenceSchema.source` field generated an invalid structured-output schema for the model/API.
- Fixed the shared schema so `source` is `optional().nullable()` in `backend/src/modules/ai/schemas/lens/lens-output.schema.ts`.
- Re-ran the targeted lens tests and they passed.
- This should let screening produce real lens outputs instead of zero-score fallback outputs, which is required before screening verdicts are trustworthy.

### Additional milestone — screening UI / phase-order fixes
- Added `screening` to the canonical frontend pipeline phase order so it renders between `research` and `evaluation` instead of being appended at the end.
- Added a reusable screening summary card to the admin startup view so users can see:
  - screening classification
  - score
  - reason codes
  - missing materials
  - lens summaries
  - downstream phase status
- Verified frontend typecheck and build after these UI changes.
- This closes the visibility gap where the gate behavior was correct but users could not easily understand why a startup was advanced, reviewed, or rejected.

### Additional milestone — screening lenses now produce meaningful output
- Rebuilt and re-ran `Path Robotics` after the shared lens schema fix.
- Latest screening decision for `Path Robotics` now returns a real `advance` outcome instead of the earlier fallback-driven `reject`.
- Current live decision snapshot:
  - classification: `advance`
  - overallScore: `79`
  - reasonCodes: none
  - lens scores:
    - market: 78 / advance
    - team: 82 / advance
    - traction: 78 / advance
- This confirms the screening lenses are no longer collapsing into the old zero-score fallback path.
- Important remaining inconsistency: the screening output contract still reports `overall.signal = review` and `missingMaterials = [team]` for the same run while the triage decision says `advance`. That likely means the contract builder and triage layer are not fully aligned yet.

### Current end-to-end verification snapshot
- We now validated both sides of the gate on a real existing startup in dev:
  1. Earlier run: screening `reject` -> evaluation skipped -> synthesis skipped.
  2. Latest run: screening `advance` -> evaluation started as expected.
- This means the core gate mechanics are behaving correctly in both directions.

### Additional milestone — screening contract alignment
- Implemented a canonical screening outcome model shared across triage and the public screening output contract.
- Added canonical next actions like `continue_evaluation`, `manual_review`, `request_materials`, and `stop`.
- Updated the output contract and UI to consume the aligned outcome/next-action shape.
- Fixed the deck-material parity issue in triage by including `pitchDeckPath` alongside `pitchDeckUrl` when computing missing materials.
- Re-ran the targeted screening contract + triage tests and they passed.

### Remaining work focus
- Clara/email notifications for relevant admins / investors / startup relationships when screening concludes
- Clara reply-to-email backfill loop for missing materials

### Additional milestone — backlog workbook extraction
- Downloaded the shared roadmap workbook into the repo-local `.claude` directory for repeatable analysis.
- Parsed the workbook structure directly from the `.xlsx` file and confirmed the relevant tabs:
  - `README`
  - `Product Map`
  - `Roadmap Summary`
  - `Backlog`
  - `A1 Deal Screening`
- Extracted the full `A1 Deal Screening` worksheet into a local JSON file for mapping work.
- Initial mapping against the `deal-screening` branch commit history shows a substantial overlap between branch work and A1 backlog story IDs.

### Additional milestone — A1 Deal Screening backlog mapping
- Mapped the A1 backlog into four buckets:
  - implemented and live-verified
  - implemented in code but not yet live-verified
  - partially implemented / inconsistent
  - not implemented yet
- Strongest completed area: screening gate semantics, verdict/output shaping, and the new screening UI surfaces.
- Biggest remaining gaps from the backlog view: canonical intake normalization, DD handoff seeding, and calibration automation.
- Important partial areas identified by the mapper:
  - Clara email/deck forwarding intake path still needs reliability work
  - screening contract alignment still has at least one live inconsistency to resolve fully
- Wrote a first-pass validation layer back into the shared workbook on the `A1 Deal Screening` sheet by adding non-destructive columns for:
  - `Yusup Validation`
  - `Yusup Notes`
  - `Yusup How To Test`
- Marked the key deal-screening story rows with implemented / partial / not implemented status and short notes based on branch work plus live validation.

### Additional milestone — Clara screening follow-up first pass
- Added Clara conversation memory for screening follow-up state.
- Added Clara outbound follow-up requests for missing materials during screening review holds.
- Added reply-to-email routing so screening follow-up replies can bypass the normal founder/scout gate and be handled as a materials backfill flow.
- Added the first text-only resume path that can restart analysis from screening when the missing materials are satisfied by reply.
- Re-ran targeted Clara and pipeline notification tests and they passed.
- This gives the project a first working communication loop for screening-related missing materials.

### Additional milestone — real Clara recipient-path verification
- Verified the different-recipient email path end to end using a Gmail plus-address alias on the accessible inbox.
- Startup used: `Path Robotics`.
- Contact email temporarily set to `yusufisbusy+clara-screening-test@gmail.com` for validation.
- Fresh screening run produced a canonical `review` + `request_materials` outcome.
- Clara sent a visible new follow-up email with subject `Action Needed: Missing materials for Path Robotics` to the plus-address recipient.
- Replied in-thread with missing team details and verified the backend started the backfill/resume path.
- Backend logs confirmed restart from enrichment after the missing-info reply.
- Important caveat: the follow-up arrived with a Gmail `SPAM` label, so deliverability/reputation may still need product/ops work even though the flow is functionally correct.

### Current blocker before shutdown
- The live Clara backfill persistence mismatch is still the next thing to close fully.
- Real evidence from Yusuf's screenshot showed Clara acknowledged the reply and restarted analysis, but the startup data still did not reflect the submitted team info on a later screening run.
- A subagent implemented a parser/persistence fix and targeted tests pass, but the final live proof of `teamMembers` being written on the real Path Robotics startup still needs to be completed tomorrow.
- Clara screening follow-up, recipient-path behavior, and hold-notification semantics were otherwise validated enough to continue from that blocker.

### Additional milestone — webhook reachability investigation
- Investigated the remaining blocker for the *true* external end-to-end Clara reply proof.
- Confirmed the local backend is still running with `APP_URL=http://localhost:8080`.
- AgentMail webhooks require a publicly reachable URL, but there is no in-repo automatic webhook registration and no public local endpoint by default.
- This means the remaining real-world gap is not only app logic — it is inbound webhook reachability from AgentMail back to this machine.
- Fastest path identified: temporary public tunnel (e.g. Tailscale Funnel) or another public webhook target, then point AgentMail at `/integrations/agentmail/webhook`.
- Important nuance: internal code paths for screening follow-up, in-app warning notifications, and reply routing were all improved and tested locally; the main remaining blocker for full external proof is now infrastructure reachability.

### Next-step context
- Resume from the live Clara backfill persistence mismatch first.
- Re-run the real reply flow and confirm `teamMembers` persists on the startup row after the email reply.
- Then continue backlog mapping / progress writing for A1 Deal Screening.
- After each meaningful milestone, append here.
