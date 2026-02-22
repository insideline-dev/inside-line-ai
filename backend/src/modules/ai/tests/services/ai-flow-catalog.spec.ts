import { PIPELINE_DEFINITION } from "../../services/ai-flow-catalog";

describe("AI flow catalog", () => {
  it("orders stages to match pipeline (extraction/scraping -> enrichment -> research -> evaluation -> synthesis)", () => {
    const stages = PIPELINE_DEFINITION.stages.map((s) => s.id);
    expect(stages).toEqual([
      "stage_1_extraction",
      "stage_2_enrichment",
      "stage_3_research",
      "stage_4_evaluation",
      "stage_5_synthesis",
    ]);
  });

  it("marks gap fill as agentic prompt node", () => {
    const node = PIPELINE_DEFINITION.nodes.find((n) => n.id === "gap_fill_hybrid");
    expect(node?.kind).toBe("prompt");
  });
});
