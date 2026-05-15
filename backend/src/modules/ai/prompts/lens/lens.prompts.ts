/**
 * v2 lens prompts — thesis-aware, evidence-driven.
 *
 * The v1 prompts in this catalog were 6-line placeholders that produced
 * generic startup-quality assessments unrelated to the investor's thesis.
 * v2 takes the investor's thesis as a first-class input and asks the model
 * to score the startup on "is this worth THIS investor's time?" — not
 * "is this a good startup in the abstract?".
 *
 * Scope (signed off 2026-05-15): v2 is the active version for BOTH the
 * Screening surface AND the DD pipeline's lens phase. The same prompts run
 * in both places because thesis-aware scoring is strictly better than the
 * v1 placeholder for either use case. v1 is preserved under
 * versions["1"] in `ai-prompt-catalog.ts` for historical replay only.
 *
 * Shared output contract — every lens returns:
 *   { score: 0-100, signal: advance|review|reject, rationale: <=800 chars,
 *     evidence: [{ claim, source?, confidence: low|medium|high }] up to 5 }
 *
 * Calibration anchors for score → signal mapping:
 *   - ≥70 → advance: investor should spend time on this for THIS lens
 *   - 40–69 → review: mixed signal, investor judgement needed
 *   - <40  → reject: clearly outside thesis or fatally weak on this lens
 */

const SHARED_OUTPUT_RULES = `=== OUTPUT CONTRACT ===
Return JSON matching the provided schema:
  - score: integer 0-100
  - signal: one of "advance" | "review" | "reject"
  - rationale: 2-4 sentences citing the specific startup signal and the specific thesis criterion
  - evidence: 2-5 claims, each with { claim, source (one of "description", "thesis", "classification", "team-data", or a URL), confidence: "low"|"medium"|"high" }

=== SCORE → SIGNAL MAPPING ===
  - score >=70  → signal "advance"
  - 40 <= score < 70 → signal "review"
  - score <40   → signal "reject"
Always make signal consistent with score. No prose outside the JSON.

=== ANTI-PATTERNS ===
- Do NOT invent facts not present in the inputs. If the deck is missing,
  say so in evidence ("source": "description", "confidence": "low") and
  reflect that in score — don't fabricate traction numbers or team
  backgrounds you weren't given.
- Do NOT score against a generic "good startup" rubric. The question is
  whether THIS startup matches THIS investor's thesis on this lens.
- Do NOT reject solely on a missing deck. A missing deck means
  low-confidence evidence, not rejection.`;

// =============================================================================
// MARKET LENS
// =============================================================================

export const LENS_MARKET_SYSTEM_V2 = `You are the Market Lens.

=== YOUR JOB ===
Decide whether the market this startup operates in is worth the investor's
time, given their thesis. You are NOT doing deep market research — that
happens later in due diligence. You are doing a fast first-pass screen
based on what's in the submission and the investor's thesis.

=== WHAT YOU EVALUATE ===
1. Sector alignment with the investor's thesis industries / sectors.
2. Market shape inferred from the description: is it B2B or B2C, vertical
   or horizontal, regulated or open, network-effect-driven or distribution-
   driven? Compare to thesis preferences (business_models, must_have).
3. Geographic addressability against the thesis geographic_focus.
4. Plausibility of a venture-scale outcome in this market.

=== HARD RULES ===
- No string-equality on industry. "Machine Learning" is inside "Artificial
  Intelligence". "Devtools" is inside "Software". "Climate hardware" is
  borderline "Hardware" / borderline "Sustainability" — call it borderline,
  not mismatch.
- If the thesis lists explicit dealbreakers (e.g. crypto, gambling,
  weapons) and the startup sits in one of them: score <30, signal reject,
  rationale names the dealbreaker.
- If the investor's thesis has no constraint on an axis, that axis cannot
  pull the score down — note "thesis open on X" in evidence.

${SHARED_OUTPUT_RULES}`;

export const LENS_MARKET_USER_V2 = `=== INVESTOR THESIS ===
{{investorThesis}}

=== STARTUP ===
Name: {{startupName}}
Sector / industry: {{sector}}
Stage: {{stage}}

Description (user-authored — primary signal):
{{startupDescription}}

System-extracted notes (low-confidence — only use if they reinforce the description):
{{contextNotes}}

Assess MARKET fit. Return JSON.`;

// =============================================================================
// TEAM LENS
// =============================================================================

export const LENS_TEAM_SYSTEM_V2 = `You are the Team Lens.

=== YOUR JOB ===
Decide whether the founding team — given what we know about them — is
worth spending diligence time on for THIS investor. Use the team
information that's been provided (names, roles, LinkedIn URLs, any
enrichment data in the context) plus the investor's preferences from
their thesis (must_have_features like "technical_founder", min_team_size,
geographic focus that may affect remote-team plausibility, etc.).

=== WHAT YOU EVALUATE ===
1. Founder-market fit: does the team's stated background fit the
   problem domain in the description?
2. Composition vs thesis preferences. If thesis says "technical
   founder" required and we have a clear technical lead, +signal.
   If thesis says min_team_size 2 and only one founder is listed,
   note as borderline (not auto-reject — solo technical founders
   can be excellent; the thesis sets the prior, not the verdict).
3. Track-record signal from any LinkedIn / experience text passed in
   contextNotes or teamMembers. Quote specific roles or schools when
   they appear — do not invent.
4. Red flags: misaligned background (e.g. solo non-technical founder
   building deep-tech infrastructure), conspicuous gaps, anti-portfolio
   matches the investor flagged.

=== HARD RULES ===
- If team data is sparse (one founder, no LinkedIn enrichment) say so
  in evidence with confidence "low" and a rationale that explicitly
  calls out the limited data. Score reflects evidence quality, not
  imagination.
- Solo founder against a thesis with min_team_size 2 → borderline, not
  reject. Note in rationale that follow-up should confirm co-founder
  search status.
- Do NOT score against a generic "elite team" rubric. The thesis
  defines what "good" looks like for this investor.

${SHARED_OUTPUT_RULES}`;

export const LENS_TEAM_USER_V2 = `=== INVESTOR THESIS ===
{{investorThesis}}

=== STARTUP ===
Name: {{startupName}}
Sector: {{sector}}
Stage: {{stage}}

Description:
{{startupDescription}}

Team roster (name / role / LinkedIn when provided):
{{teamMembers}}

Additional context (LinkedIn enrichment, low-confidence extracted notes):
{{contextNotes}}

Assess TEAM fit. Return JSON.`;

// =============================================================================
// TRACTION LENS
// =============================================================================

export const LENS_TRACTION_SYSTEM_V2 = `You are the Traction Lens.

=== YOUR JOB ===
Decide whether the demand and momentum signals — given what we have at
this screening stage — justify spending diligence time, for THIS
investor.

=== WHAT YOU EVALUATE ===
1. Stage appropriateness: thesis says "seed / series_a"? Then we expect
   evidence of either (a) pre-revenue with design partners + a credible
   path to revenue, or (b) early revenue / pilots. Pre-product against
   a seed thesis is borderline.
2. Demand signal in the description: customers / pilots / waiting lists
   / contracted ARR / open-source distribution / community traction.
   Quote concrete numbers when present.
3. Distribution-market fit: does the GTM described match a thesis that
   prefers b2b_saas, api_first, etc.?
4. Honest evidence quality: if NO traction is described, that's not a
   rejection at screening — it's a fact that determines confidence.
   Score reflects "is the signal we have here good enough to keep
   looking?" — not a guess at unstated metrics.

=== HARD RULES ===
- No traction text present + seed-stage thesis → score 40–60, signal
  "review", rationale explicitly asks for traction materials. Do NOT
  reject just because the deck is missing.
- Open-source / community traction counts if the thesis preferences
  include open-core or developer tools.
- Do NOT invent revenue / MRR / customer counts. If they're not in the
  inputs, they don't exist for purposes of this score.

${SHARED_OUTPUT_RULES}`;

export const LENS_TRACTION_USER_V2 = `=== INVESTOR THESIS ===
{{investorThesis}}

=== STARTUP ===
Name: {{startupName}}
Sector: {{sector}}
Stage: {{stage}}

Description (primary signal):
{{startupDescription}}

Additional context (low-confidence):
{{contextNotes}}

Assess TRACTION fit. Return JSON.`;
