import { describe, expect, it } from "bun:test";
import { AI_PROMPT_CATALOG } from "../services/ai-prompt-catalog";
import { LensInputSchema } from "../schemas/lens";

const LENS_KEYS = ["lens.market", "lens.team", "lens.traction"] as const;

describe("Lens v2 prompt wiring", () => {
  it.each(LENS_KEYS)("%s is on activeVersion 2 by default", (key) => {
    const entry = AI_PROMPT_CATALOG[key];
    expect(entry.activeVersion).toBe("2");
  });

  it.each(LENS_KEYS)(
    "%s preserves v1 prompts in versions for historical replay",
    (key) => {
      const entry = AI_PROMPT_CATALOG[key];
      expect(entry.versions?.["1"]).toBeDefined();
      expect(entry.versions?.["1"]?.systemPrompt.length ?? 0).toBeGreaterThan(0);
    },
  );

  it.each(LENS_KEYS)(
    "%s exposes investorThesis as an allowed prompt variable",
    (key) => {
      const entry = AI_PROMPT_CATALOG[key];
      expect(entry.allowedVariables).toContain("investorThesis");
    },
  );

  it("team lens additionally exposes teamMembers", () => {
    const entry = AI_PROMPT_CATALOG["lens.team"];
    expect(entry.allowedVariables).toContain("teamMembers");
  });

  it.each(LENS_KEYS)(
    "%s default prompt is the v2 prompt, not v1",
    (key) => {
      const entry = AI_PROMPT_CATALOG[key];
      const v2 = entry.versions?.["2"];
      expect(v2).toBeDefined();
      expect(entry.defaultSystemPrompt).toBe(v2?.systemPrompt);
      expect(entry.defaultUserPrompt).toBe(v2?.userPrompt);
    },
  );
});

describe("LensInputSchema (v2)", () => {
  it("accepts investorThesis and teamMembers", () => {
    const parsed = LensInputSchema.parse({
      startupId: "s-1",
      startupName: "Acme",
      startupDescription: "AI audio",
      sector: "ai",
      stage: "seed",
      contextNotes: "",
      investorThesis: "AI/software, seed/Series A, US/EU",
      teamMembers: "Alice (CTO), Bob (CEO)",
    });
    expect(parsed.investorThesis).toContain("seed/Series A");
    expect(parsed.teamMembers).toContain("Alice");
  });

  it("defaults investorThesis and teamMembers to empty strings", () => {
    const parsed = LensInputSchema.parse({
      startupId: "s-1",
      startupName: "Acme",
      startupDescription: "AI audio",
      sector: "ai",
      stage: "seed",
      contextNotes: "",
    });
    expect(parsed.investorThesis).toBe("");
    expect(parsed.teamMembers).toBe("");
  });
});
