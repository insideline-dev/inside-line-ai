import { describe, expect, it } from "bun:test";
import { DeckStructuredDataAiSchema } from "./deck-structured-data.schema";

// DS-E12-F1 — lock the canonical section list and the page-level provenance
// shape. Each section now carries `sourcePages: number[]` so DD and lens
// evidence can deep-link back to deck pages without re-reading the file.

describe("DeckStructuredDataAiSchema (DS-E12-F1)", () => {
  it("accepts an empty payload and fills section-keyed defaults", () => {
    const parsed = DeckStructuredDataAiSchema.parse({});

    // Every section the story names is present after parse.
    expect(parsed.team).toBeDefined();
    expect(parsed.traction).toBeDefined();
    expect(parsed.market).toBeDefined();
    expect(parsed.product).toBeDefined();
    expect(parsed.fundraising).toBeDefined();
    expect(parsed.financials).toBeDefined();
    expect(parsed.problem).toBeDefined();
    expect(parsed.solution).toBeDefined();
    expect(parsed.competitors).toBeDefined();

    // Every section defaults its sourcePages to []. Empty is fine — it means
    // the LLM didn't identify pages. The shape is what matters.
    expect(parsed.team.sourcePages).toEqual([]);
    expect(parsed.problem.sourcePages).toEqual([]);
    expect(parsed.solution.sourcePages).toEqual([]);
    expect(parsed.competitors.sourcePages).toEqual([]);
  });

  it("preserves page-level provenance when supplied", () => {
    const parsed = DeckStructuredDataAiSchema.parse({
      problem: {
        statement: "Manual diligence eats 8 hours per deck.",
        painPoints: ["Repetitive reads", "Hard to compare deals"],
        sourcePages: [3, 4],
      },
      solution: {
        statement: "AI extracts every memo field in 60 seconds.",
        keyDifferentiators: ["One pass per deal", "Evidence-linked"],
        sourcePages: [5, 6],
      },
      competitors: {
        namedCompetitors: [
          { name: "Affinity" },
          { name: "Tactyc", positioning: "incumbent" },
        ],
        moat: "Evidence graph + lens versioning.",
        sourcePages: [11],
      },
    });

    expect(parsed.problem.sourcePages).toEqual([3, 4]);
    expect(parsed.problem.painPoints).toHaveLength(2);
    expect(parsed.solution.statement).toContain("60 seconds");
    expect(parsed.solution.keyDifferentiators).toContain("Evidence-linked");
    expect(parsed.competitors.namedCompetitors).toHaveLength(2);
    expect(parsed.competitors.namedCompetitors[1].positioning).toBe("incumbent");
    expect(parsed.competitors.moat).toContain("Evidence graph");
    expect(parsed.competitors.sourcePages).toEqual([11]);
  });

  it("rejects negative or zero page numbers", () => {
    expect(() =>
      DeckStructuredDataAiSchema.parse({ team: { sourcePages: [0] } }),
    ).toThrow();
    expect(() =>
      DeckStructuredDataAiSchema.parse({ market: { sourcePages: [-1] } }),
    ).toThrow();
  });
});
