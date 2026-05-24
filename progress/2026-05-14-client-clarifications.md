# InsideLine Backlog — Clarifications Needed (Open Items Only)

Filtered to **only stories that are not yet shipped** (or shipped partial / stub). Already-Live items are excluded.

Items marked 🔴 are **P0 — block S2 sprint, need answers this week**.

---

## DS — Deal Screening (open items)

- 🔴 **DS-E1-F4-S1** — Versioned canonical `ScreeningInput` schema.
  Q: Confirm in scope for v1? Without it the downstream `ScreeningOutput` contract risks drift. *(We may already have a partial; need go-ahead to formalize.)*

- 🔴 **DS-E1-F4-S2** — Dedup when same deal arrives twice.
  Status: **partial in code** (name + email, 30-day window). Needs:
  - Match key — current is name+email; do you want **+ deck SHA-256** and **+ founder-email domain matching** added?
  - Window — keep 30 days or extend (60/90)?
  - On duplicate — block silently, show founder "we already have this", or accept and link to original?
  - Cross-fund — same founder pitching Fund A + Fund B with same deck = duplicate (spam) or two legitimate deals?

- 🔴 **DS-E1-F8-S1** — Forward founder WhatsApp pitch to fund's InsideLine.
  Status: **not implemented** (sheet was wrong). Need to pick:
  - **(A) Replace** — unknown founders skip Clara, message + deck go straight to fund inbox.
  - **(B) Both** — Clara converses *and* a submission is created when a deck is present.
  - **(C) Clara-driven** *(our recommendation)* — Clara handles chat, "publishes" submission once enough info gathered.
  - Also: one shared inbound number per platform, or one provisioned per fund (Twilio sub-account)? How do we attribute messages to the correct fund — sender phone, fund-specific number, or code prefix?

- **DS-E1-F2-S2** — Founder controls distribution (auto-match all vs selective).
  Q: Does the founder see *which* investors they would match before opting in (privacy concern for investor thesis), or just count? Default mode — opt-in to all, or opt-in per investor?

- **DS-E8-F2-S1** — Deal Agent wakes up on new doc upload.
  Q: "Refresh" = full pipeline rerun, or only re-score lenses touching the new doc type? UI — show "refreshing…" state or notification only after completion?

- **DS-E6-F5-S1** — Tinder-style swipe deal feed with optional AI voice intro.
  Q: Mobile-only or also web? Voice intro — pre-generated per deal (cost), or on-demand TTS (latency)? Length (15s / 30s / 60s)?

- **DS-E6-F5-S2** — Voice-pitch screening mode (30s audio summary per deal).
  Q: Same TTS as above? Per-fund voice clone or single platform voice?

---

## DG — Diligence (open items — full module, only 2 stories shipped)

- 🔴 **DG-E11-F1-S1** — Funding history auto-populated. **Status: providers stubbed.**
  Q: Which canonical source — Crunchbase, PitchBook, Tracxn, Dealroom, or merged view? When sources disagree on a round size, which wins? *Answering this unblocks ~6 other DG stories.*

- 🔴 **DG-E11-F3-S1** — Previous rounds via Crunchbase (Apify bridge today, direct API later).
  Q: Confirm budget for Crunchbase Enterprise API? Until then we stay on Apify scraping (rate-limit + ToS risk acknowledged).

- **DG-E11-F3-S2** — Investor profile bootstrap from Crunchbase.
  Q: Same source question. Bootstrap only on signup, or refresh quarterly? How do we preserve human-edited fields on refresh?

- **DG-E10-F1-S1** — Founder uploads files to a secure room with controlled access.
  Q: (a) Per-deal room or per-fund room? (b) Access controls — view-only / download / NDA-gate? (c) Watermarking on downloads? (d) Storage — R2 only, or dedicated VDR provider (Datasite/Ansarada)?

- **DG-E4-F1-S1** — Parse uploaded cap table to canonical structure.
  Q: Supported formats — Carta export, Pulley, AngelList, generic Excel, PDF? Strict template required or LLM-forgiving?

- **DG-E4-F2-S1** — Round history + lead per round.
  Q: Same source as DG-E11-F1-S1. Display lead even when not publicly disclosed (heuristic), or only verified leads?

- **DG-E5-F1-S1** — Historical + projected P&L standard view.
  Q: Source — founder-uploaded Excel parsed, founder-typed in form, or both? Standard chart of accounts (IFRS-lite, US-GAAP-lite, or InsideLine custom)? Currency normalization required?

- **DG-E5-F2-S1** — Unit economics computed or marked "insufficient data."
  Q: Canonical metric set — CAC, LTV, payback, gross margin, contribution margin, magic number? Required inputs before computation vs. "insufficient data"?

- **DG-E6-F1-S1** — Surface ≥5 similar companies with explanation.
  Q: Similarity source — embedding on description (which model), Crunchbase tag overlap, or vertical rules? Pulled from platform DB or external (Crunchbase universe)?

- **DG-E6-F2-S1** — Comparable recent rounds + valuation multiples.
  Q: How recent is "recent" — 6 / 12 / 24 months? Multiples on revenue, ARR, GMV, or all? When comparable lacks revenue disclosure — estimate or omit?

- **DG-E8-F1-S1** — Time-ordered news feed per deal.
  Q: Source — Google News RSS, NewsAPI, GDELT, paid (Diffbot)? Filter — domain match or NER + company name? Backfill window — 12 / 24 months / unbounded?

- **DG-E9-F1-S1** — Founder-contradicted claims across sources.
  Q: "Contradiction" = strict numeric mismatch with tolerance %, or LLM-judged semantic conflict? Confidence threshold to surface?

- **DG-E14-F3-S1** — "Careful skeptic" panel grounded in evidence.
  Q: Separate agent run on demand, or always pre-generated post-evaluation? How is it different from existing risk/red-flag outputs — what's the unique angle?

- **DG-E15-F1-S1** — Founder prior-exits surfacing.
  Q: Source — LinkedIn (Unipile), Crunchbase founders, or both joined? "Exit" definition — acquisition only, or includes IPO, shutdown, secondary?

- **DG-E15-F2-S1** — Adverse public signals on founder.
  Q: Sources — news (which API), court records (US-only? Lexis/PACER?), social sentiment? Threshold for "adverse" — any negative mention, or aggregate sentiment?

- **DG-E3-F2-S1** — Sort competitors by last funding date / team size.
  Q: Headcount source — LinkedIn (Unipile), Crunchbase, or estimated? How fresh must "last funding" be to count?

- **DG-E7-F1-S1** — Web traffic + search-trend graphs.
  Q: Provider — Similarweb (paid), Semrush, SerpAPI for trends, Google Trends scrape? Time window default? Per-deal cost ceiling?

- **DG-E7-F2-S1** — Product-review + employer-review sentiment.
  Q: Sources — G2, Capterra, TrustPilot, App Store, Glassdoor, Indeed? Scraping (ToS risk) or paid APIs? Aggregate or per-source breakdown?

- **DG-E14-F4-S1** — Country-level context (regulatory + comparables).
  Q: Static curated knowledge base, or live LLM-generated per request? Which countries at MVP — top 10 by deal volume, or all?

- **DG-E14-F1-S2** — Vertical-prompt authoring as controlled artifact.
  Q: Who can author — platform admin only, or fund admins per tenant? Versioning — Git-backed, DB rows with audit, or prompt-management SaaS (Langfuse/PromptLayer)?

- **DG-E12-F1-S1** — 0/1/2 vote per lens with reason.
  Q: Per-lens (11 ratings) or per-section? Required reason min length? Can a reviewer abstain on a lens?

- **DG-E12-F2-S1** — Aggregate team signal + per-lens voter breakdown.
  Q: Aggregation — mean, median, mode, weighted by partner seniority? Tie-break? Anonymize voters in aggregate, or always show identities?

- **DG-E12-F3-S1** — Agent's per-lens recommendation + human-disagreement explanation.
  Q: Show disagreement only when delta > threshold (which?), or always? Auto-generate the "where humans disagree" prose, or just diff numerics?

---

## MI — Meeting Intelligence (29 stories, all open)

These are P4/P5 (later phase). Most share provider/integration ambiguities — grouped:

- 🔵 **Calendar integration** — `MI-E2-F1-S1`, `MI-E2-F1-S2`, `PL-E10-F2-S1`, `PL-E10-F3-S1`.
  Q: Google Calendar in MVP, Outlook/M365 fast-follow? Auto-match — by attendee email matching founder email on deal, or fuzzy company-name in title? Per-user OAuth or fund-wide service account?

- 🔵 **Meeting transcription bot** — `MI-E2-F2-S1`, `MI-E2-F2-S2`.
  Q: Provider — Recall.ai (covers Zoom/Meet/Teams in one API), Otter, Fireflies, or self-hosted? Consent — audible bot announcement, or also founder-must-click-accept link? Recording retention period?

- **Scheduling** — `MI-E2-F3-S1`, `MI-E2-F3-S2`.
  Q: Primitive — Cal.com embed, Calendly API, or in-house slot picker? Sync direction — bi-directional (calendar ↔ deal) or platform-only?

- 🔵 **Voice / phone access** — `MI-E8-F1-S1`, `MI-E8-F1-S2`, `MI-E8-F2-S1`, `MI-E8-F2-S2`, `MI-E8-F3-S1`, `MI-E8-F4-S1`, `MI-E8-F5-S1`.
  Q: Telephony — Twilio Voice (already integrated for WhatsApp), Vonage, Vapi/Retell? Shared-number country coverage at launch (US, UK, MENA?)? OTP fallback when caller-ID doesn't match — SMS or email? Deal-PIN length and rotation policy?

- **MI-E1-F1-S1** — 1-page brief in inbox 15 min before meeting.
  Q: Email only, or also WhatsApp/Slack? "1 page" = strict 1-page PDF or short email? Meeting added <15 min ahead — best-effort send or skip?

- **MI-E1-F2-S1** — Agenda prioritized by conviction-shifting questions.
  Q: "Conviction-shift potential" — agent-judged on the fly, or derived from open-questions weight? Top N items?

- **MI-E1-F3-S1 / MI-E1-F3-S2 / MI-E1-F3-S3** — WhatsApp voice-note brief + share + cross-channel parity.
  Q: TTS provider (ElevenLabs, OpenAI, Polly)? Single platform voice or per-fund custom? "Identical content across channels" — voice-note transcript matching email body verbatim?

- **MI-E3-F1-S1 / MI-E3-F2-S1** — Real-time prompts + contradiction warnings during meeting.
  Q: Where does the partner see prompts — in-app overlay, separate companion screen, browser extension on Zoom/Meet web? Latency budget (sub-2s? sub-5s)?

- **MI-E4-F1-S1 / MI-E4-F2-S1** — Auto-mark answered open-questions; auto-track founder commitments.
  Q: Confidence threshold to auto-mark vs. suggest-for-human-review? Commitments — structured (what / by-when / owner) or free-text snippets with timestamps?

- **MI-E9-F1-S1 / MI-E9-F2-S1 / MI-E9-F3-S1 / MI-E9-F4-S1** — Every conversation feeds evidence graph + invariants + live score-shift + pre-end ping.
  Q: "Every conversation" — includes async (email, WhatsApp text)? Auto-apply policy — apply when confidence > X, or always require human approve before write?

- **MI-E5-F1-S1 / MI-E6-F1-S1** — Meeting claims searchable; cross-meeting search ("did any founder ever mention X").
  Q: Search engine — Postgres FTS, OpenSearch, Pinecone, or pgvector? Permissioning — per-fund only?

- **MI-E7-F1-S1** — Agendas reflect partner style.
  Q: How is style learned — feedback ratings, prior agenda edits, explicit style-profile setup? Per-partner or per-fund?

⚠️ **Strategic flag:** MI is 29 stories, P4/P5, scheduled for Oct 2026 full-fit. **If voice (E8-*) and real-time copilot (E3-*) get cut, MI shrinks to ~12 stories.** Are those negotiable for October?

---

## PL — Platform (open items)

- **PL-E2-F2-S2** — Row-level security policies on the database. *(Marked Live in Dev — needs verification before we close it.)*
  Q: Confirm scope — RLS on all tenant-scoped tables, or only sensitive ones (startup, evaluation, evidence)? Drizzle migration acceptable, or do you want hand-written SQL policies reviewed?

- **PL-E2-F3-S1** — Invite teammate to fund.
  Q: Roles — flat ("fund member"), or RBAC tiers (admin / partner / associate / read-only)? Invite via email link only, or also SSO domain auto-join?

- **PL-E3-F3-S1** — Founder keeps profile current.
  Q: Reminder cadence (monthly nudge?) or fully passive? When founder updates the deck, do existing matched investors get notified, or silent update? *Possible duplicate of `SM-E2-F1-S1` — confirm.*

- **PL-E1-F2-S1** — Google Workspace SSO.
  Q: Workspace-only (verified domain required), or any Google account? Auto-provision new users on first SSO into a fund, or admin-must-pre-invite?

- 🔵 **PL-E4-F1-S1** (subscription) — and likely follow-on stories on usage display + dunning.
  Q: Provider — Stripe (assumed), Paddle, Chargebee? Pricing model — flat seat-based, usage-metered (deals analyzed), or hybrid? Dunning grace period before suspension (3 / 7 / 14 days)?

- **PL-E6-F3-S1 / PL-E6-F4-S1** — Weekly digest email + 1-click unsubscribe.
  Q: Day/time of send (Mon 7am local, or fund-configurable)? Unsubscribe scope — digest only, or all transactional emails?

- **PL-E7-F2-S1 / PL-E7-F3-S1** — Fast deck preview, not publicly shareable.
  Q: Renderer — server-side PDF→image (which lib, which CDN), or `react-pdf` client-side? Signed-URL TTL for previews (5 min / 1 hr)?

- **PL-E7-F1-S1** — Deck malware scan before reaching investors.
  Q: Provider — ClamAV self-hosted, VirusTotal, cloud scanner (Cloudmersive, AWS Macie)? Quarantine UX — silent reject + email founder, or hold-with-admin-review?

- **PL-E8-F1-S1** — Correlation ID across services.
  Q: Tooling — OpenTelemetry + Honeycomb/Datadog/Tempo, or just structured-log correlation IDs in Pino? Frontend instrumentation included?

- **PL-E8-F2-S1** — Live SLO dashboard.
  Q: Which SLOs — pipeline phase latency (each phase), API p95, queue lag, error budget burn? Hosted (Grafana Cloud / Datadog) or self-hosted?

- **PL-E8-F3-S1 / PL-E8-F3-S2** — LLM spend per tenant + budget caps.
  Q: Caps as soft (alert) or hard (block agent execution)? Cap unit — USD/month, tokens/month, or per-deal? On cap-hit — pause queue, fall back to cheaper model, or fail loud?

---

## SM — Supply / Match (9 stories, all open)

- **SM-E3-F2-S1** — Historical investments inform thesis automatically.
  Q: Same source as DG-E11-F3-S2 (Crunchbase) — single source or merged? When fund hand-edits AI thesis, do future imports overwrite or stay manual-locked?

- **SM-E4-F2-S1 / SM-E4-F2-S2 / SM-E4-F2-S3** — Investor-submitted stays private; DB-RLS backing; founder-submitted DOES cross-match.
  Q: When a startup is *both* investor-submitted (privately) AND later founder-submits themselves — does the founder submission "unlock" cross-matching, or do submissions stay isolated by origin?

- **SM-E5-F1-S1** — Founder sees matched funds + requests warm intro.
  Q: Founder sees fund identity always, or only after fund accepts the match? Warm intro — internal in-app message, email forward, or just a request notification to the fund?

- **SM-E2-F2-S1** — 2-min video pitch.
  Q: Hosted upload (Mux, Cloudflare Stream, or R2 + transcoding)? Required transcript for accessibility + indexing? Max file size?

- **SM-E6-F1-S1** — Prioritized morning queue for analysts.
  Q: Prioritization signal — match score, fund-thesis fit, freshness, partner-flagged urgency, or all blended? Daily cap (top 10? top 25?)?

- **SM-E10-F1-S1** — One-click match-quality rating.
  Q: Rating scale — 👍/👎 binary, 1–5 stars, or 3-bucket (relevant / borderline / irrelevant)? Does rating retrain the matching model, or just adjust per-fund weights?

- **SM-E2-F1-S1** — Founder keeps profile updated.
  Q: Possibly duplicate of `PL-E3-F3-S1`. Confirm same story, or define what's distinct.

---

## Cross-cutting decisions (answering these unblocks 30+ stories)

1. **Funding/company data source of truth** — Crunchbase vs PitchBook vs Tracxn vs Dealroom vs merged. Affects DG-E11-*, DG-E4-F2, DG-E6-F2, SM-E3-F2.
2. **TTS / voice provider** — ElevenLabs, OpenAI, Polly. Affects DS-E6-F5-S1/S2, MI-E1-F3-S1, MI-E8-*.
3. **Telephony / meeting-bot stack** — our default recommendation: Twilio + Recall.ai. Confirm.
4. **Calendar / email integration scope at MVP** — Google-only OK, or M365 must ship same release?
5. **Billing provider** — Stripe assumed. Pricing model (seat / metered / hybrid) needs to land before PL-E4-* implementation.
6. **Prompt-management strategy** — who can edit prompts (platform-only vs tenant-admin), and which tool (Git, DB, Langfuse). Affects DG-E14-F1-S2 + future.
7. **"Auto-apply" trust threshold** — single confidence-threshold policy across MI-E9-* and DG-* edit flows would prevent inconsistent UX.

---

**TL;DR for the client:**
- 🔴 Answer the **5 P0 items** this week to unblock S2 sprint.
- Answer the **7 cross-cutting decisions** before story-by-story — they cascade.
- Confirm **MI scope cut** (voice + real-time copilot) so we can hit Oct 2026 full-fit.

baarakAllahu feekum.
