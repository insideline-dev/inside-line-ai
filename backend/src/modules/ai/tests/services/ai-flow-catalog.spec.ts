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
      "stage_6_matching",
    ]);
  });

  it("marks gap fill as agentic prompt node", () => {
    const node = PIPELINE_DEFINITION.nodes.find((n) => n.id === "gap_fill_hybrid");
    expect(node?.kind).toBe("prompt");
  });

  it("routes extraction and scraping into gap fill enrichment", () => {
    const edgePairs = PIPELINE_DEFINITION.edges.map((edge) => `${edge.from}->${edge.to}`);

    expect(edgePairs).toContain("extract_fields->gap_fill_hybrid");
    expect(edgePairs).toContain("scrape_website->gap_fill_hybrid");
    expect(edgePairs).not.toContain("gap_fill_hybrid->extract_fields");
    expect(edgePairs).not.toContain("gap_fill_hybrid->scrape_website");
    expect(edgePairs).not.toContain("extract_fields->research_orchestrator");
  });

  it("explicitly wires gap fill inputs for extraction and scraping", () => {
    const node = PIPELINE_DEFINITION.nodes.find((n) => n.id === "gap_fill_hybrid");
    expect(node).toBeDefined();
    if (!node) return;

    const labelsByFrom = new Map(
      node.inputs
        .filter((input) => input.fromNodeId)
        .map((input) => [input.fromNodeId, input.label]),
    );

    expect(labelsByFrom.get("extract_fields")).toBe("Extraction result");
    expect(labelsByFrom.get("scrape_website")).toBe("Scraping context");
  });
});
