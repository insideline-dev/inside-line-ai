import { describe, expect, it } from "bun:test";
import { DEFAULT_PIPELINE_CONFIG } from "../src/routes/_protected/admin/-flow.defaults";

describe("Admin flow defaults", () => {
  it("matches backend pipeline order and dependencies", () => {
    const phases = DEFAULT_PIPELINE_CONFIG.phases;

    expect(phases.map((phase) => phase.phase)).toEqual([
      "extraction",
      "enrichment",
      "scraping",
      "research",
      "evaluation",
      "synthesis",
    ]);

    const byPhase = new Map(phases.map((phase) => [phase.phase, phase]));

    expect(byPhase.get("extraction")?.dependsOn).toEqual([]);
    expect(byPhase.get("enrichment")?.dependsOn).toEqual(["extraction"]);
    expect(byPhase.get("scraping")?.dependsOn).toEqual(["extraction"]);
    expect(byPhase.get("research")?.dependsOn).toEqual(["enrichment", "scraping"]);
    expect(byPhase.get("evaluation")?.dependsOn).toEqual(["research"]);
    expect(byPhase.get("synthesis")?.dependsOn).toEqual(["evaluation"]);

    expect(byPhase.get("enrichment")?.canRunParallelWith).toEqual(["scraping"]);
    expect(byPhase.get("scraping")?.canRunParallelWith).toEqual(["enrichment"]);
  });
});
