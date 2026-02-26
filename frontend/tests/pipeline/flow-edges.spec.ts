import { describe, expect, it } from "bun:test";
import type { Edge } from "@xyflow/react";
import {
  isExecutablePipelineEdgeConnection,
  toFlowEdgeDefinitions,
} from "../../src/components/pipeline/flow-edges";

describe("flow edge helpers", () => {
  it("serializes react-flow edges into backend flowDefinition edges", () => {
    const edges: Edge[] = [
      {
        id: "e-1",
        source: "extract_fields",
        target: "gap_fill_hybrid",
        label: "object",
        sourceHandle: "source-a",
        targetHandle: "target-a",
        data: {
          enabled: true,
          mapping: {
            mode: "field_map",
            fieldMap: [
              {
                fromPath: "marketSize.tam",
                toKey: "marketSizing.tam",
                required: true,
              },
            ],
          },
        },
      },
      {
        id: "e-2",
        source: "research_team",
        target: "evaluation_orchestrator",
      },
    ];

    expect(toFlowEdgeDefinitions(edges)).toEqual([
      {
        from: "extract_fields",
        to: "gap_fill_hybrid",
        label: "object",
        sourceHandle: "source-a",
        targetHandle: "target-a",
        enabled: true,
        mapping: {
          mode: "field_map",
          fieldMap: [
            {
              fromPath: "marketSize.tam",
              toKey: "marketSizing.tam",
              required: true,
            },
          ],
        },
      },
      { from: "research_team", to: "evaluation_orchestrator" },
    ]);
  });

  it("allows only pipeline edges that map to executable phases", () => {
    expect(
      isExecutablePipelineEdgeConnection("extract_fields", "research_orchestrator"),
    ).toBe(true);
    expect(
      isExecutablePipelineEdgeConnection("research_team", "evaluation_orchestrator"),
    ).toBe(true);
    expect(
      isExecutablePipelineEdgeConnection("matching_thesis", "synthesis_final"),
    ).toBe(false);
    expect(
      isExecutablePipelineEdgeConnection("extract_fields", "extract_fields"),
    ).toBe(false);
  });
});
