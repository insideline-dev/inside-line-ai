import { describe, expect, it } from "bun:test";
import { StartupStage } from "../../../startup/entities/startup.schema";
import {
  extractStageFromText,
  extractWebsiteFromText,
  getMissingCriticalFields,
  isLikelyPlaceholderStage,
  isLikelyPlaceholderText,
  isMissingWebsiteValue,
  mapStageToEnum,
  normalizeWebsiteCandidate,
  type StartupFieldRecord,
} from "../startup-field-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function record(overrides: Partial<StartupFieldRecord> = {}): StartupFieldRecord {
  return {
    website: "https://acme.com",
    stage: "seed",
    industry: "SaaS",
    location: "San Francisco",
    fundingTarget: 1_000_000,
    teamSize: 5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isMissingWebsiteValue
// ---------------------------------------------------------------------------

describe("isMissingWebsiteValue", () => {
  it("returns true for null", () => {
    expect(isMissingWebsiteValue(null)).toBe(true);
  });

  it("returns true for undefined", () => {
    expect(isMissingWebsiteValue(undefined)).toBe(true);
  });

  it("returns true for empty string", () => {
    expect(isMissingWebsiteValue("")).toBe(true);
  });

  it("returns true for the placeholder host", () => {
    expect(isMissingWebsiteValue("https://pending-extraction.com")).toBe(true);
  });

  it("returns true for the placeholder host with www prefix", () => {
    expect(isMissingWebsiteValue("https://www.pending-extraction.com")).toBe(true);
  });

  it("returns true for an invalid URL string", () => {
    expect(isMissingWebsiteValue("not a url")).toBe(true);
  });

  it("returns false for a valid URL", () => {
    expect(isMissingWebsiteValue("https://acme.com")).toBe(false);
  });

  it("returns false for a valid URL with a path", () => {
    expect(isMissingWebsiteValue("https://acme.com/about")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isLikelyPlaceholderText
// ---------------------------------------------------------------------------

describe("isLikelyPlaceholderText", () => {
  it("returns true for null", () => {
    expect(isLikelyPlaceholderText(null)).toBe(true);
  });

  it("returns true for undefined", () => {
    expect(isLikelyPlaceholderText(undefined)).toBe(true);
  });

  it("returns true for empty string", () => {
    expect(isLikelyPlaceholderText("")).toBe(true);
  });

  it("returns true for whitespace-only string", () => {
    expect(isLikelyPlaceholderText("   ")).toBe(true);
  });

  it('returns true for "pending extraction"', () => {
    expect(isLikelyPlaceholderText("pending extraction")).toBe(true);
  });

  it("returns true for mixed-case pending-extraction phrase", () => {
    expect(isLikelyPlaceholderText("Pending-Extraction stuff")).toBe(true);
  });

  it('returns true for "unknown"', () => {
    expect(isLikelyPlaceholderText("unknown")).toBe(true);
  });

  it('returns true for lowercase "n/a"', () => {
    expect(isLikelyPlaceholderText("n/a")).toBe(true);
  });

  it('returns true for uppercase "N/A"', () => {
    expect(isLikelyPlaceholderText("N/A")).toBe(true);
  });

  it('returns false for "San Francisco"', () => {
    expect(isLikelyPlaceholderText("San Francisco")).toBe(false);
  });

  it('returns false for "SaaS"', () => {
    expect(isLikelyPlaceholderText("SaaS")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mapStageToEnum
// ---------------------------------------------------------------------------

describe("mapStageToEnum", () => {
  it("returns null for null", () => {
    expect(mapStageToEnum(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(mapStageToEnum(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(mapStageToEnum("")).toBeNull();
  });

  it('maps "seed" → SEED', () => {
    expect(mapStageToEnum("seed")).toBe(StartupStage.SEED);
  });

  it('maps "Seed" (mixed case) → SEED', () => {
    expect(mapStageToEnum("Seed")).toBe(StartupStage.SEED);
  });

  it('maps "pre-seed" → PRE_SEED', () => {
    expect(mapStageToEnum("pre-seed")).toBe(StartupStage.PRE_SEED);
  });

  it('maps "pre_seed" → PRE_SEED', () => {
    expect(mapStageToEnum("pre_seed")).toBe(StartupStage.PRE_SEED);
  });

  it('maps "preseed" → PRE_SEED', () => {
    expect(mapStageToEnum("preseed")).toBe(StartupStage.PRE_SEED);
  });

  it('maps "Series A" → SERIES_A', () => {
    expect(mapStageToEnum("Series A")).toBe(StartupStage.SERIES_A);
  });

  it('maps "series_a" → SERIES_A', () => {
    expect(mapStageToEnum("series_a")).toBe(StartupStage.SERIES_A);
  });

  it('maps "series-a" → SERIES_A', () => {
    expect(mapStageToEnum("series-a")).toBe(StartupStage.SERIES_A);
  });

  it('maps "Series F+" → SERIES_F_PLUS', () => {
    expect(mapStageToEnum("Series F+")).toBe(StartupStage.SERIES_F_PLUS);
  });

  it('maps "series_f_plus" → SERIES_F_PLUS', () => {
    expect(mapStageToEnum("series_f_plus")).toBe(StartupStage.SERIES_F_PLUS);
  });

  it('maps "series f" → SERIES_F_PLUS', () => {
    expect(mapStageToEnum("series f")).toBe(StartupStage.SERIES_F_PLUS);
  });

  it('returns null for "Series G" (unmapped)', () => {
    expect(mapStageToEnum("Series G")).toBeNull();
  });

  it('returns null for arbitrary random string', () => {
    expect(mapStageToEnum("random")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isLikelyPlaceholderStage
// ---------------------------------------------------------------------------

describe("isLikelyPlaceholderStage", () => {
  it("returns true when stage cannot be mapped to any enum value", () => {
    expect(isLikelyPlaceholderStage(record({ stage: "Series G" }))).toBe(true);
  });

  it("returns false for a non-seed stage regardless of field quality", () => {
    // series_a never triggers the seed heuristic
    expect(
      isLikelyPlaceholderStage(
        record({
          stage: "series_a",
          website: null as unknown as string,
          industry: "unknown",
          location: "unknown",
          fundingTarget: 0,
          teamSize: 1,
        }),
      ),
    ).toBe(false);
  });

  it("returns false for seed with all valid fields (insufficient signals)", () => {
    expect(
      isLikelyPlaceholderStage(
        record({
          stage: "seed",
          website: "https://acme.com",
          industry: "SaaS",
          location: "San Francisco",
          fundingTarget: 1_000_000,
          teamSize: 5,
        }),
      ),
    ).toBe(false);
  });

  it("returns true for seed + missing website + teamSize 1 (1 structural + 1 secondary)", () => {
    expect(
      isLikelyPlaceholderStage(
        record({
          stage: "seed",
          website: null as unknown as string,
          teamSize: 1,
          industry: "SaaS",
          location: "San Francisco",
          fundingTarget: 1_000_000,
        }),
      ),
    ).toBe(true);
  });

  it("returns true for seed + placeholder industry + zero funding (1 structural + 1 secondary)", () => {
    expect(
      isLikelyPlaceholderStage(
        record({
          stage: "seed",
          website: "https://acme.com",
          industry: "unknown",
          location: "San Francisco",
          fundingTarget: 0,
          teamSize: 5,
        }),
      ),
    ).toBe(true);
  });

  it("returns false for seed + only teamSize 1 with no structural signal", () => {
    // secondary-only: teamSize <= 1 but no structural signal fires
    expect(
      isLikelyPlaceholderStage(
        record({
          stage: "seed",
          website: "https://acme.com",
          industry: "SaaS",
          location: "San Francisco",
          fundingTarget: 1_000_000,
          teamSize: 1,
        }),
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeWebsiteCandidate
// ---------------------------------------------------------------------------

describe("normalizeWebsiteCandidate", () => {
  it("returns null for null", () => {
    expect(normalizeWebsiteCandidate(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeWebsiteCandidate("")).toBeNull();
  });

  it('prepends https:// for bare "acme.com"', () => {
    expect(normalizeWebsiteCandidate("acme.com")).toBe("https://acme.com/");
  });

  it("lowercases hostname and strips hash fragment", () => {
    expect(normalizeWebsiteCandidate("https://ACME.COM/path#hash")).toBe(
      "https://acme.com/path",
    );
  });

  it("returns null for an invalid candidate", () => {
    expect(normalizeWebsiteCandidate("not a url at all !!")).toBeNull();
  });

  it("preserves an already-valid https URL", () => {
    const result = normalizeWebsiteCandidate("https://acme.com/");
    expect(result).toBe("https://acme.com/");
  });
});

// ---------------------------------------------------------------------------
// extractWebsiteFromText
// ---------------------------------------------------------------------------

describe("extractWebsiteFromText", () => {
  it("returns null for null", () => {
    expect(extractWebsiteFromText(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(extractWebsiteFromText(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractWebsiteFromText("")).toBeNull();
  });

  it("extracts a simple inline URL", () => {
    const result = extractWebsiteFromText("check out https://acme.com");
    expect(result).toMatch(/^https:\/\/acme\.com/);
  });

  it("extracts a labeled bare domain", () => {
    const result = extractWebsiteFromText("website: acme.com");
    expect(result).toContain("acme.com");
  });

  it("does not return a signature URL; returns the body URL instead", () => {
    const text =
      "Our site is https://acme.com\n-- \nJohn\nhttps://linkedin.com/in/john";
    const result = extractWebsiteFromText(text);
    expect(result).toBe("https://acme.com/");
  });

  it("returns null when only social URLs are present (no real site)", () => {
    const text = "Hi\nhttps://linkedin.com/in/john\nhttps://twitter.com/john";
    expect(extractWebsiteFromText(text)).toBeNull();
  });

  it("returns the first valid URL when multiple are present", () => {
    const result = extractWebsiteFromText(
      "See https://acme.com and https://backup.com",
    );
    expect(result).toContain("acme.com");
  });

  it("strips trailing punctuation from URL", () => {
    const result = extractWebsiteFromText("Visit https://acme.com.");
    expect(result).toContain("acme.com");
    // The trailing period from the sentence must not be part of the returned URL
    expect(result).not.toMatch(/\.$/);
  });

  it("returns null for a placeholder URL in the text", () => {
    expect(
      extractWebsiteFromText("Site: https://pending-extraction.com"),
    ).toBeNull();
  });

  it("skips a social URL that appears before a real company URL", () => {
    const result = extractWebsiteFromText(
      "check https://linkedin.com/company/foo and https://acme.com",
    );
    expect(result).toContain("acme.com");
  });
});

// ---------------------------------------------------------------------------
// extractStageFromText
// ---------------------------------------------------------------------------

describe("extractStageFromText", () => {
  it("returns null for null", () => {
    expect(extractStageFromText(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(extractStageFromText(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractStageFromText("")).toBeNull();
  });

  it('detects "pre-seed stage" → PRE_SEED', () => {
    expect(extractStageFromText("We are pre-seed stage")).toBe(
      StartupStage.PRE_SEED,
    );
  });

  it('detects "Series A" → SERIES_A', () => {
    expect(extractStageFromText("Currently at Series A")).toBe(
      StartupStage.SERIES_A,
    );
  });

  it('detects "seed round" → SEED', () => {
    expect(extractStageFromText("We just closed our seed round")).toBe(
      StartupStage.SEED,
    );
  });

  it("pre-seed wins over seed when both words appear", () => {
    // "pre-seed" contains the word seed but PRE_SEED regex fires first
    expect(extractStageFromText("We are in pre-seed")).toBe(
      StartupStage.PRE_SEED,
    );
  });

  it("returns null when no stage keyword is found", () => {
    expect(extractStageFromText("No stage info here")).toBeNull();
  });

  it('detects "Series F+" → SERIES_F_PLUS', () => {
    expect(extractStageFromText("Series F+")).toBe(StartupStage.SERIES_F_PLUS);
  });

  it('detects "Series B" → SERIES_B', () => {
    expect(extractStageFromText("Raised our Series B last year")).toBe(
      StartupStage.SERIES_B,
    );
  });
});

// ---------------------------------------------------------------------------
// getMissingCriticalFields
// ---------------------------------------------------------------------------

describe("getMissingCriticalFields", () => {
  it("returns empty array for a fully valid record", () => {
    expect(
      getMissingCriticalFields(
        record({
          stage: "series_a",
          website: "https://acme.com",
        }),
      ),
    ).toEqual([]);
  });

  it("reports website missing when it is null and stage is valid non-seed", () => {
    const result = getMissingCriticalFields(
      record({
        stage: "series_a",
        website: null as unknown as string,
      }),
    );
    expect(result).toContain("website");
    expect(result).not.toContain("stage");
  });

  it("reports stage missing when seed heuristic fires", () => {
    const result = getMissingCriticalFields(
      record({
        stage: "seed",
        website: null as unknown as string,
        teamSize: 1,
      }),
    );
    expect(result).toContain("stage");
  });

  it("reports both website and stage when both are missing", () => {
    const result = getMissingCriticalFields(
      record({
        stage: "seed",
        website: null as unknown as string,
        industry: "unknown",
        fundingTarget: 0,
        teamSize: 1,
      }),
    );
    expect(result).toContain("website");
    expect(result).toContain("stage");
  });
});
