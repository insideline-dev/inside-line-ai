import { describe, expect, it } from "bun:test";
import type { Evaluation } from "../src/types/evaluation";
import {
  getCriticalDataGaps,
  getDisplayRisks,
  getDisplayStrengths,
  getSourcedRisks,
  getSourcedStrengths,
} from "../src/lib/evaluation-display";

describe("evaluation-display", () => {
  it("prefers synthesis-level strengths and risks when available", () => {
    const evaluation = {
      keyStrengths: ["Top-level strength"],
      keyRisks: ["Top-level risk"],
      teamData: { strengths: ["Section strength"], risks: ["Section risk"] },
    } as unknown as Evaluation;

    expect(getDisplayStrengths(evaluation)).toEqual(["Top-level strength"]);
    expect(getDisplayRisks(evaluation)).toEqual(["Top-level risk"]);
  });

  it("aggregates strengths and risks from section payloads when top-level values are missing", () => {
    const evaluation = {
      teamData: {
        strengths: ["Domain expertise"],
        risks: ["Hiring gap"],
      },
      businessModelData: {
        keyFindings: ["Clear expansion path"],
        dataGaps: ["Gross margin bridge missing"],
      },
      gtmData: {
        strengths: ["Founder-led sales motion"],
        keyRisks: ["Channel mix still narrow"],
      },
    } as unknown as Evaluation;

    expect(getDisplayStrengths(evaluation)).toEqual([
      "Domain expertise",
      "Clear expansion path",
      "Founder-led sales motion",
    ]);
    expect(getDisplayRisks(evaluation)).toEqual([
      "Hiring gap",
      "Gross margin bridge missing",
      "Channel mix still narrow",
    ]);
  });

  it("builds sourced summary items ordered by section quality", () => {
    const evaluation = {
      teamScore: 82,
      marketScore: 48,
      teamData: {
        strengths: ["Repeat founder pair"],
        risks: ["Bench is thin"],
      },
      marketData: {
        strengths: ["Large market"],
        risks: ["Timing still early"],
      },
    } as unknown as Evaluation;

    expect(getSourcedStrengths(evaluation)).toEqual([
      { text: "Repeat founder pair", source: "Team", score: 82 },
      { text: "Large market", source: "Market", score: 48 },
    ]);

    expect(getSourcedRisks(evaluation)).toEqual([
      { text: "Timing still early", source: "Market", score: 48 },
      { text: "Bench is thin", source: "Team", score: 82 },
    ]);
  });

  it("aggregates only critical structured data gaps across sections", () => {
    const evaluation = {
      marketScore: 44,
      financialsScore: 39,
      marketData: {
        dataGaps: [
          { gap: "Customer concentration not quantified", impact: "critical", suggestedAction: "Request cohort revenue split" },
          { gap: "Timing support is light", impact: "important", suggestedAction: "Review additional market reports" },
        ],
      },
      financialsData: {
        dataGaps: [
          { gap: "No monthly cash flow model", impact: "critical", suggestedAction: "Collect 24-month operating model" },
        ],
      },
    } as unknown as Evaluation;

    expect(getCriticalDataGaps(evaluation)).toEqual([
      {
        gap: "No monthly cash flow model",
        impact: "critical",
        suggestedAction: "Collect 24-month operating model",
        source: "Financials",
        score: 39,
      },
      {
        gap: "Customer concentration not quantified",
        impact: "critical",
        suggestedAction: "Request cohort revenue split",
        source: "Market",
        score: 44,
      },
    ]);
  });
});
