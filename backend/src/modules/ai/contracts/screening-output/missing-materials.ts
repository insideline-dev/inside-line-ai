// DS-E7-F4-S1 — define what counts as a "key material" for the
// screening REVIEW hold. The contract surfaces these via
// `overall.missingMaterials[]`; the partner sees a checklist on the
// deal card and DD knows the deal isn't under-resourced.
//
// Stay deterministic and conservative — every entry on this checklist
// must be cheap to verify from the startup row alone, no LLM required.

/** Stable codes — frontend maps to human-readable labels. */
export type MissingMaterialCode =
  | "deck"
  | "product_description"
  | "team"
  | "deal_terms"
  | "website";

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
}

const MIN_DESCRIPTION_CHARS = 60;

function isEmptyString(v: string | null | undefined): boolean {
  return typeof v !== "string" || v.trim().length === 0;
}

/**
 * Returns the list of material codes that are MISSING from the startup.
 * Empty array = fully resourced. Order = checklist order in the UI.
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

  // 4. Deal terms — at least ONE of fundingTarget, valuation, raiseType.
  //    DD can't start without knowing what's being raised.
  const hasFundingTarget =
    typeof input.fundingTarget === "number" && input.fundingTarget > 0;
  const hasValuation =
    typeof input.valuation === "number" && input.valuation > 0;
  const hasRaiseType = !isEmptyString(input.raiseType);
  if (!hasFundingTarget && !hasValuation && !hasRaiseType) {
    missing.push("deal_terms");
  }

  // 5. Website — minimal external footprint check.
  if (isEmptyString(input.website)) {
    missing.push("website");
  }

  return missing;
}
