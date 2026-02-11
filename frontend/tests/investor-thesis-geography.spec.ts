import { describe, expect, it } from "bun:test";
import {
  buildThesisSavePayload,
  extractResponseData,
  mapLegacyLabelsToNodeIds,
  toggleGeographyNodeSelection,
  type ThesisFormData,
} from "../src/routes/_protected/investor/-thesis.helpers";

describe("Investor thesis geography helpers", () => {
  it("maps legacy labels to canonical node ids", () => {
    const taxonomy = [
      {
        id: "l1:north_america",
        label: "North America",
        level: 1,
      },
      {
        id: "l1:mena",
        label: "MENA",
        level: 1,
      },
    ];

    const mapped = mapLegacyLabelsToNodeIds(
      ["North America", "Middle East"],
      taxonomy,
    );

    expect(mapped).toContain("l1:north_america");
    expect(mapped).toContain("l1:mena");
  });

  it("builds save payload with geographicFocusNodes", () => {
    const formData: ThesisFormData = {
      stages: ["seed"],
      industries: ["fintech"],
      geographicFocusNodes: ["l1:mena", "l2:gcc", "l3:ae"],
      checkSizeMin: 100000,
      checkSizeMax: 2000000,
      notes: "MENA thesis",
    };

    const payload = buildThesisSavePayload(formData);

    expect(payload).toEqual({
      stages: ["seed"],
      industries: ["fintech"],
      checkSizeMin: 100000,
      checkSizeMax: 2000000,
      geographicFocusNodes: ["l1:mena", "l2:gcc", "l3:ae"],
      notes: "MENA thesis",
    });
    expect((payload as Record<string, unknown>).geographicFocus).toBeUndefined();
  });

  it("toggles node selection without duplicates", () => {
    const afterAdd = toggleGeographyNodeSelection(["l1:mena"], "l1:mena", true);
    expect(afterAdd).toEqual(["l1:mena"]);

    const afterAddChild = toggleGeographyNodeSelection(afterAdd, "l2:gcc", true);
    expect(afterAddChild).toEqual(["l1:mena", "l2:gcc"]);

    const afterRemove = toggleGeographyNodeSelection(afterAddChild, "l1:mena", false);
    expect(afterRemove).toEqual(["l2:gcc"]);
  });

  it("extracts payload from wrapped API responses", () => {
    const wrapped = { data: { nodes: [{ id: "l1:mena", label: "MENA", level: 1 }] } };
    const parsed = extractResponseData<{ nodes: Array<{ id: string }> }>(wrapped);

    expect(parsed?.nodes).toHaveLength(1);
    expect(parsed?.nodes[0]?.id).toBe("l1:mena");
  });

  it("extracts payload from raw API responses", () => {
    const raw = { nodes: [{ id: "l1:mena", label: "MENA", level: 1 }] };
    const parsed = extractResponseData<{ nodes: Array<{ id: string }> }>(raw);

    expect(parsed?.nodes).toHaveLength(1);
    expect(parsed?.nodes[0]?.id).toBe("l1:mena");
  });
});
