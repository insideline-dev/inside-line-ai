import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSummaryTab } from "../src/components/startup-view/AdminSummaryTab";
import type { Evaluation } from "../src/types/evaluation";
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
  sectorIndustryGroup: "Software",
  sectorIndustry: "Vertical SaaS",
  location: "New York, USA",
  fundingTarget: 2500000,
  valuation: 18000000,
  raiseType: "safe",
  leadInvestorName: "North Star Ventures",
  status: "submitted",
  overallScore: 78,
  percentileRank: 84,
  createdAt: "2026-03-08T00:00:00.000Z",
} satisfies Startup;

const evaluation = {
  id: "evaluation_1",
  startupId: "startup_1",
  confidenceScore: "High",
  executiveSummary: "Strong early signal with room for pricing discipline.",
  keyStrengths: ["Strong customer urgency"],
  keyRisks: ["Valuation needs tighter comp support"],
  exitScenarios: [
    {
      scenario: "moderate",
      exitType: "IPO",
      exitValuation: "$450M",
      timeline: "6 years",
      moic: 3.2,
      irr: 25,
      researchBasis: "Base case execution",
    },
    {
      scenario: "optimistic",
      exitType: "IPO or M&A",
      exitValuation: "$900M",
      timeline: "7 years",
      moic: 6.1,
      irr: 34.5,
      researchBasis: "Category leadership",
    },
    {
      scenario: "conservative",
      exitType: "M&A",
      exitValuation: "$180M",
      timeline: "5 years",
      moic: 1.6,
      irr: 11,
      researchBasis: "Tighter multiple environment",
    },
  ],
  createdAt: "2026-03-08T00:00:00.000Z",
} satisfies Evaluation;

describe("AdminSummaryTab", () => {
  it("renders exit scenarios right after deal snapshot with ordered cards and return-focused formatting", () => {
    const html = renderToStaticMarkup(
      <AdminSummaryTab startup={startup} evaluation={evaluation} />,
    );

    const dealSnapshotIndex = html.indexOf("Deal Snapshot");
    const exitScenariosIndex = html.indexOf("Exit Scenarios");
    const keyStrengthsIndex = html.indexOf("Key Strengths");

    expect(dealSnapshotIndex).toBeGreaterThan(-1);
    expect(exitScenariosIndex).toBeGreaterThan(dealSnapshotIndex);
    expect(exitScenariosIndex).toBeLessThan(keyStrengthsIndex);
    expect(html.indexOf("conservative")).toBeLessThan(html.indexOf("moderate"));
    expect(html.indexOf("moderate")).toBeLessThan(html.indexOf("optimistic"));
    expect(html).toContain("3.2X");
    expect(html).toContain("25%");
    expect(html).toContain("IPO");
  });
});
