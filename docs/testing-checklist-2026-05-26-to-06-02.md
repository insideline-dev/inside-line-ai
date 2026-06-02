# Testing Checklist — Tue 2026-05-26 → Tue 2026-06-02

Covers every commit on `dev` from last Tuesday to now, plus the uncommitted
session work (Orval migration, admin thesis lookup fix, AgentMail fix). Grouped
by feature area. Check off as you verify. Commit hashes are in `(…)`.

**Setup before you start**
- [ ] `git checkout dev && git pull`
- [ ] Backend running (`bun dev:backend`), frontend running (`bun dev:frontend`)
- [ ] `cd backend && bunx tsc --noEmit` → clean
- [ ] `cd frontend && bunx tsc --noEmit` → clean
- [ ] Dev DB migrated (`NODE_ENV=development bun db:push`)
- [ ] Have test accounts ready: an **investor** with a thesis, an **admin**, a **founder/scout**, and at least one startup in screening.

---

## 1. Epic #113 — Data Gates / DD sub-stages / Engaged

### 1a. Stage rename & DD sub-tabs (#114 · e63ef3d)
- [ ] Investor sidebar/stage nav: **"Contracting" tab is now labelled "Engaged"** (both investor `contracting.tsx` and admin).
- [ ] Investor DD page shows three sub-tabs: **Data Gates / Analyzed / Engaged**.
- [ ] Admin DD page shows the same sub-tabs; **DD header + stats stay visible above the sub-tabs** on every sub-tab.
- [ ] Switching sub-tabs filters the deal list correctly (no leakage of deals between sub-tabs).

### 1b. Data Gates gate logic (#115 · 82436de)
- [ ] Advancing a deal from **Screening** no longer immediately runs research→eval→synthesis — it lands in **DD / Data Gates** with `data_gate_status = pending`.
- [ ] A `due_diligence.data_gate_entered` deal event is recorded on advance.
- [ ] Data Gates card shows the **missing-materials checklist** + open questions.
- [ ] **Skip** button → DD pipeline starts; deal moves to Analyzed; query invalidates (list updates without manual refresh).
- [ ] Per-card polling only runs on the **active** sub-tab (no background polling on hidden tabs).

### 1c. Auto-advance default (bea6bc7 · 08ce484)
- [ ] Thesis settings → **Data Gates** section: required doc-type multi-select + **auto-advance toggle defaults to ON**.
- [ ] Deal with **both pitch deck + financial** present → on screening advance it **auto-advances** straight into the DD pipeline (no manual skip needed).
- [ ] Deal **missing** one of the two → stays in Data Gates waiting.
- [ ] `advanceFromScreening` response reports whether the deal auto-advanced.

### 1d. Clara doc-request + founder reply ingestion (#116 · 66b57f5)
- [ ] "Request via Clara" button on a Data Gates card → calls `POST /startups/:id/data-gates/request-documents`.
- [ ] Investor with **no founder email on file** → inline founder-email fallback prompt appears (the `no_founder_email` / `400` path), no crash.
- [ ] **Clara actually sends the founder email** (see §5 — this was the AgentMail blocker, now fixed).
- [ ] Founder replies with attachments → docs are classified + saved to the data room → completeness re-checked.

### 1e. Re-extraction on new docs (#117 · c3bdc4d)
- [ ] After new founder docs arrive, **re-extraction runs** (full re-classify + extract) before the DD pipeline starts.
- [ ] `lastExtractionAt` is stamped on the startup after the EXTRACTION phase.
- [ ] `hasNewDocsSinceExtraction` correctly gates whether re-extraction fires.

### 1f. Circular-dependency boot fix (053442f · 56c256f)
- [ ] **Backend boots cleanly** — no `UndefinedModuleException` / `AiModule imports[N] is undefined` at startup.
- [ ] Clara is resolved lazily via the `'CLARA_SERVICE'` string token; data-gate request endpoint still reaches Clara.

---

## 2. Session work (uncommitted — verify before committing)

### 2a. Orval migration — no more ad-hoc customFetch (#3)
- [ ] Data Gates endpoints now use **generated Orval hooks** (`useStartupControllerGetDataGates / …SkipDataGate / …RequestDocuments`), not raw `customFetch`.
- [ ] Get / skip / request-documents all still work end-to-end from the UI.
- [ ] Query invalidation still fires on skip (list refreshes).
- [ ] `CLAUDE.md` + `AGENTS.md` document the "never call customFetch directly / regenerate after new endpoints" rule.

### 2b. Admin thesis lookup fix (#4 · data-gate.service.ts)
- [ ] **Admin** viewing a founder/scout-submitted deal in Data Gates now sees the **correct investor's required doc-types** (resolved via `startup_matches.investorId`), not the default fallback.
- [ ] Investor viewing their own deal → unchanged (uses their own thesis).
- [ ] Deal with no investor match yet → falls back to `['pitch_deck','financial']` (last resort only).

### 2c. AgentMail "Inbox not found" fix (#1 · clara.service.ts + script)
- [ ] `NODE_ENV=development bun run scripts/fix-stale-agentmail-inbox-ids.ts` (audit) → **0 stale rows** on dev (already fixed this session).
- [ ] WhatsApp-channel conversations no longer break the email send path — non-email inbox ids (`"whatsapp"`) fall back to `CLARA_INBOX_ID` via the new `isEmailInboxId` guard.
- [ ] **Prod not yet done** → run `NODE_ENV=production bun run scripts/fix-stale-agentmail-inbox-ids.ts` (audit), add `--fix` if it finds anything.

---

## 3. Screening / Deal Screening (DS)
- [ ] (cb5bf6e) Screening rationale renders as **markdown with citations**; investor thesis no longer appears in DS lenses.
- [ ] (262334f) Screening output **no longer shows open questions, the checkSize axis, or redundant badges**.
- [ ] (03a3755) **New startups appear on the Screening tab**, not Due Diligence.
- [ ] (71b4a5b) Creating/updating a startup with partial data no longer crashes (`.partial()` fix — refinement split from `CreateStartupSchema`).

---

## 4. Calibration
- [ ] (d58f050) Investor **CalibrationCard** is visible again; admin has a **Calibration tab**.
- [ ] (84a6b3b) Moving deals in the **kanban feeds calibration**; auto-trigger now fires at **3 decisions** (lowered threshold).
- [ ] (ef19279) Thesis rematching targets **only the requesting investor**, not all investors.

---

## 5. Drag-drop pitch deck submission
- [ ] (491bc9d) Investor pipeline page: **drag a pitch deck onto the page → AI extraction kicks off**.
- [ ] (a11ed14 · 4826e96) Drag-drop works on **all investor pages** (window-level listeners, hook in investor layout) — not just the pipeline page.
- [ ] (cb934e3) Admin pages: drag-drop pitch deck submission works on **all admin pages**.
- [ ] Dropping a non-PDF / invalid file is handled gracefully (no silent failure).

---

## 6. Distribution / Portal (founder)
- [ ] (26928c8 · 7577758) Founder controls distribution **in-platform** (moved out of the portal): can preview investors and select who receives the deck.
- [ ] (13ea433) Portal shows **clear feedback when distribution preview fields are missing**.
- [ ] New `distributionMode` field flows through create/update/scout-submit DTOs (regenerated API models present).

---

## 7. Investor activity / matching / DD visibility
- [ ] (65d6894) **Activity page** loads; deal events are recorded; BullMQ stall prevention in place (stuck jobs don't wedge the queue).
- [ ] (691ed2c) DD **in-flight pipeline is visible**; a stale/stuck pipeline recovers; UI doesn't break mid-run.
- [ ] (c23e044) Activity feed is **enriched with match details**.
- [ ] (1b8c9ef) Thesis fit rationale text is **no longer truncated**.
- [ ] (94c7582) DD deal view has a **Screening tab**.

---

## 8. Infra / logging (don't skip — these were severity-high)
- [ ] (abaea10) **Log files no longer grow unbounded** (the bug that filled 297G of disk). Confirm log rotation/size cap is active in dev.
- [ ] (2ff8d41) Docker image: **logs directory exists** so debug log services start (check `docker:up` boots clean).

---

## Final gate before merge/deploy
- [ ] Backend `bunx tsc --noEmit` clean · Frontend `bunx tsc --noEmit` clean
- [ ] `cd backend && bun lint` — no NEW errors (one pre-existing `prefer-const` in `screening.processor.ts:177` is known)
- [ ] `cd backend && bun test` — relevant suites pass
- [ ] Run the AgentMail audit on **prod** and apply if needed (§2c)
- [ ] Re-run `cd frontend && bun generate:api` if any backend endpoint changed after this checklist was written
