import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PrintScreening } from "../src/components/print/PrintScreening";
import type { ScreeningOutputV1 } from "../src/lib/screening/useScreeningOutput";
import type { Startup } from "../src/types/startup";

const startup = {
  id: "startup_1",
  userId: "user_1",
  slug: "acme-ai",
  submittedByRole: "founder",
  isPrivate: true,
  name: "Acme AI",
  tagline: "Autonomous workflows for finance teams",
  description: "Acme AI automates finance operations for growth-stage teams.",
  industry: "AI",
  stage: "seed",
  location: "New York, USA",
  createdAt: "2026-03-08T00:00:00.000Z",
  updatedAt: "2026-03-08T00:00:00.000Z",
} satisfies Startup;

const output: ScreeningOutputV1 = {
  version: 1,
  startupId: "123e4567-e89b-12d3-a456-426614174000",
  pipelineRunId: "run-1",
  generatedAt: "2026-05-06T00:00:00.000Z",
  overall: {
    score: 82,
    signal: "review",
    nextAction: "manual_review",
    missingMaterials: ["deck"],
  },
  handoff: {
    evidenceSeeds: [
      {
        lensKey: "team",
        lensLabel: "Team",
        claim: "Canonical handoff evidence claim.",
        source: "https://example.com/canonical/team",
        confidence: "high",
        lensScore: 84,
        signal: "advance",
      },
      {
        lensKey: "gtm",
        lensLabel: "Go-to-Market",
        claim: "Second canonical handoff evidence claim.",
        confidence: "medium",
        lensScore: 72,
        signal: "review",
      },
    ],
    openIssues: [],
  },
  lenses: [
    {
      key: "team",
      score: 84,
      signal: "advance",
      rationale: "Legacy local lens evidence should not be used when a handoff exists.",
      evidence: [
        {
          claim: "Legacy team lens claim.",
          confidence: "low",
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
      rationale: "Legacy local lens evidence should not be used when a handoff exists.",
      evidence: [
        {
          claim: "Legacy gtm lens claim.",
          confidence: "low",
        },
      ],
      modelId: "gpt-5.4",
      promptKey: "gtm-lens",
      latencyMs: 900,
      usedFallback: false,
    },
  ],
};

describe("PrintScreening", () => {
  it("renders canonical handoff evidence seeds", () => {
    const html = renderToStaticMarkup(
      <PrintScreening startup={startup} output={output} ready={true} />,
    );

    expect(html).toContain("Canonical handoff evidence claim.");
    expect(html).toContain("Second canonical handoff evidence claim.");
    expect(html).not.toContain("Legacy team lens claim.");
    expect(html).not.toContain("Legacy gtm lens claim.");
  });
});
