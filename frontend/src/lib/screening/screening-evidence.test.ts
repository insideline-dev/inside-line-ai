// @ts-nocheck
import { describe, expect, it } from "bun:test";
import {
  collectScreeningEvidenceSeeds,
  collectScreeningFollowUpSeeds,
  formatScreeningLensLabel,
  getScreeningEvidencePreview,
} from "./screening-evidence";
import type { ScreeningOutputV1 } from "./useScreeningOutput";
import type { TriageDecision } from "./useTriageDecision";

const screeningOutput: ScreeningOutputV1 = {
  version: 1,
  startupId: "123e4567-e89b-12d3-a456-426614174000",
  pipelineRunId: "run-1",
  generatedAt: "2026-05-06T00:00:00.000Z",
  overall: {
    score: 78,
    signal: "review",
    nextAction: "manual_review",
    missingMaterials: ["deck", "team"],
  },
  handoff: {
    evidenceSeeds: [
      {
        lensKey: "team",
        lensLabel: "Team",
        claim: "Canonical handoff claim from the team lens.",
        source: "https://example.com/handoff/team",
        confidence: "high",
        lensScore: 84,
        signal: "advance",
      },
      {
        lensKey: "gtm",
        lensLabel: "Go-to-Market",
        claim: "Canonical handoff claim from the gtm lens.",
        confidence: "medium",
        lensScore: 72,
        signal: "review",
      },
    ],
    openIssues: [
      {
        key: "handoff:market",
        label: "Market",
        summary: "Canonical market follow-up from the screening handoff.",
        source: "screening-output",
      },
      {
        key: "handoff:team",
        label: "Team",
        summary: "Canonical team follow-up from the screening handoff.",
        source: "triage-decision",
      },
    ],
  },
  lenses: [
    {
      key: "team",
      score: 84,
      signal: "advance",
      rationale: "Strong founder-market fit.",
      evidence: [
        {
          claim: "Founders have prior domain experience and complementary technical and commercial backgrounds.",
          source: "https://example.com/team",
          confidence: "high",
        },
        {
          claim: "Founders have prior domain experience and complementary technical and commercial backgrounds.",
          source: "https://example.com/team",
          confidence: "high",
        },
      ],
      modelId: "gpt-5.4",
      promptKey: "team-lens",
      latencyMs: 1200,
      usedFallback: false,
    },
    {
      key: "gtm",
      score: 72,
      signal: "review",
      rationale: "Early channel validation.",
      evidence: [
        {
          claim: "Customer interviews show a repeatable outbound motion but limited conversion history.",
          confidence: "medium",
        },
      ],
      modelId: "gpt-5.4",
      promptKey: "gtm-lens",
      latencyMs: 900,
      usedFallback: false,
    },
  ],
};

const legacyScreeningOutput: ScreeningOutputV1 = {
  ...screeningOutput,
  handoff: undefined,
};

const triageDecision: TriageDecision = {
  classification: "review",
  nextAction: "manual_review",
  overallScore: 78,
  reasonCodes: ["borderline_overall_score", "lens.gtm.low_evidence", "missing_materials"],
  lensSnapshot: [],
  createdAt: "2026-05-06T00:00:00.000Z",
};

describe("screening evidence helpers", () => {
  it("formats common lens keys into DD-friendly labels", () => {
    expect(formatScreeningLensLabel("businessModel")).toBe("Business Model");
    expect(formatScreeningLensLabel("competitive-advantage")).toBe("Competitive Advantage");
  });

  it("prefers canonical handoff evidence seeds over local lens composition", () => {
    const rows = collectScreeningEvidenceSeeds(screeningOutput);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        lensKey: "team",
        lensLabel: "Team",
        claim: "Canonical handoff claim from the team lens.",
        source: "https://example.com/handoff/team",
        confidence: "high",
        lensScore: 84,
        signal: "advance",
      }),
    );
    expect(rows[1]).toMatchObject({
      lensKey: "gtm",
      lensLabel: "Go-to-Market",
      claim: "Canonical handoff claim from the gtm lens.",
      confidence: "medium",
      lensScore: 72,
      signal: "review",
    });
  });

  it("limits preview rows without mutating the source order", () => {
    const preview = getScreeningEvidencePreview(screeningOutput, 1);

    expect(preview).toHaveLength(1);
    expect(preview[0]?.claim).toBe("Canonical handoff claim from the team lens.");
  });

  it("prefers canonical handoff open issues over local screening derivations", () => {
    const rows = collectScreeningFollowUpSeeds(screeningOutput, triageDecision);

    expect(rows).toEqual([
      expect.objectContaining({
        key: "handoff:market",
        label: "Market",
        summary: "Canonical market follow-up from the screening handoff.",
        source: "screening-output",
      }),
      expect.objectContaining({
        key: "handoff:team",
        label: "Team",
        summary: "Canonical team follow-up from the screening handoff.",
        source: "triage-decision",
      }),
    ]);
  });

  it("falls back to legacy lens-derived data when no handoff is available", () => {
    expect(collectScreeningEvidenceSeeds(legacyScreeningOutput)).toEqual([
      expect.objectContaining({
        lensKey: "team",
        lensLabel: "Team",
        claim: "Founders have prior domain experience and complementary technical and commercial backgrounds.",
        source: "https://example.com/team",
        confidence: "high",
      }),
      expect.objectContaining({
        lensKey: "gtm",
        lensLabel: "Go-to-Market",
        claim: "Customer interviews show a repeatable outbound motion but limited conversion history.",
        source: undefined,
        confidence: "medium",
      }),
    ]);

    expect(collectScreeningFollowUpSeeds(legacyScreeningOutput, triageDecision)).toEqual([
      expect.objectContaining({
        key: "missing:deck",
        label: "Pitch deck",
        summary: "Pitch deck is still missing from screening.",
        source: "screening-output",
      }),
      expect.objectContaining({
        key: "missing:team",
        label: "Team info",
        summary: "Team info is still missing from screening.",
        source: "screening-output",
      }),
      expect.objectContaining({
        key: "decision:borderline_overall_score",
        label: "Borderline scores",
        summary: "The overall screening score is still in the review band.",
        source: "triage-decision",
      }),
      expect.objectContaining({
        key: "decision:lens.gtm.low_evidence",
        label: "Go-to-Market needs more evidence",
        summary: "Go-to-Market needs more evidence before DD can rely on it.",
        source: "triage-decision",
      }),
    ]);
  });
});
