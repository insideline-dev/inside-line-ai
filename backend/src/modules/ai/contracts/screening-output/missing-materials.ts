// Legacy DS-E7-F4-S1 helper for non-gating screening material diagnostics.
// Epic 113 Data Gates are now the only required-document gate before DD.
//
// Stay deterministic and conservative — every entry on this checklist
// must be cheap to verify from the startup row alone, no LLM required.

/** Stable codes — frontend maps to human-readable labels. */
export type MissingMaterialCode =
  | "deck"
  | "product_description"
  | "team"
  | "deal_terms" // legacy persisted value; no longer emitted by DS
  | "website"
  | "evidence_claims"
  // DS-E7-F4 part (c): "traction data stated". Flagged when the deck
  // structured-extraction step produced no traction signals (no customers,
  // users, churn rate, or notable traction claims) AND the startup record
  // doesn't carry traction-like text in productDescription.
  | "traction_data";

/**
 * Lightweight projection of the startup row used to compute the
 * checklist. We don't take a Drizzle-typed startup so this stays usable
 * from any caller that has the same fields (e.g. an admin replay tool).
 */
export interface MaterialsInput {
  pitchDeckUrl?: string | null;
  pitchDeckPath?: string | null;
  productDescription?: string | null;
  description?: string | null;
  teamMembers?: ReadonlyArray<{ name: string; role: string; linkedinUrl?: string }> | null;
  fundingTarget?: number | null;
  valuation?: number | null;
  raiseType?: string | null;
  website?: string | null;
  // DS-E7-F4 — optional traction snapshot from the deck extraction step.
  // Any populated field counts as "traction stated"; all-null → missing.
  tractionSnapshot?: {
    customers?: string | null;
    users?: string | null;
    churnRate?: string | null;
    notableClaims?: ReadonlyArray<string> | null;
  } | null;
}

const MIN_DESCRIPTION_CHARS = 60;

function isEmptyString(v: string | null | undefined): boolean {
  return typeof v !== "string" || v.trim().length === 0;
}

/**
 * Returns the list of material codes that are MISSING from the startup.
 * Empty array = no legacy diagnostic gaps. Order = historical checklist order.
 */
export function detectMissingMaterials(
  input: MaterialsInput,
): MissingMaterialCode[] {
  const missing: MissingMaterialCode[] = [];

  // 1. Pitch deck — the foundational artifact.
  if (isEmptyString(input.pitchDeckUrl) && isEmptyString(input.pitchDeckPath)) {
    missing.push("deck");
  }

  // 2. Product description — separate from generic `description`. We
  //    accept either, but require enough body for screening prompts to
  //    have something to chew on.
  const desc = input.productDescription || input.description || "";
  if (desc.trim().length < MIN_DESCRIPTION_CHARS) {
    missing.push("product_description");
  }

  // 3. Team — must have at least one named member with a role.
  const team = input.teamMembers ?? [];
  const validTeam = team.filter(
    (m) => !isEmptyString(m?.name) && !isEmptyString(m?.role),
  );
  if (validTeam.length === 0) {
    missing.push("team");
  }

  // 4. Website — minimal external footprint check.
  if (isEmptyString(input.website)) {
    missing.push("website");
  }

  // 6. DS-E7-F4 part (c) — traction data stated. Only flag when we have
  //    deck-extraction coverage AND every traction field is empty.
  //    `tractionSnapshot === undefined` means we didn't get to inspect the
  //    deck (e.g. historical run with no cached extraction); we say nothing
  //    rather than false-flagging the deal as missing traction.
  if (input.tractionSnapshot !== undefined && !hasTractionSignal(input.tractionSnapshot)) {
    missing.push("traction_data");
  }

  return missing;
}

function hasTractionSignal(
  snapshot: MaterialsInput["tractionSnapshot"],
): boolean {
  if (!snapshot) return false;
  if (!isEmptyString(snapshot.customers)) return true;
  if (!isEmptyString(snapshot.users)) return true;
  if (!isEmptyString(snapshot.churnRate)) return true;
  const claims = snapshot.notableClaims ?? [];
  return claims.some((c) => !isEmptyString(c));
}
