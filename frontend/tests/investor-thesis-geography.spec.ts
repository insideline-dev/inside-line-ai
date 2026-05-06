import { afterEach, describe, expect, it } from "bun:test";
import {
  buildThesisSavePayload,
  extractResponseData,
  mapLegacyLabelsToNodeIds,
  shouldShowThesisGeneratingBanner,
  toggleGeographyNodeSelection,
  type ThesisFormData,
} from "../src/routes/_protected/investor/-thesis.helpers";
import { useFilterStore } from "../src/stores/filter-store";

describe("Investor thesis geography helpers", () => {
  afterEach(() => {
    useFilterStore.getState().resetFilters();
  });
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
      dealBreakers: [],
    };

    const payload = buildThesisSavePayload(formData);

    expect(payload).toEqual({
      stages: ["seed"],
      industries: ["fintech"],
      checkSizeMin: 100000,
      checkSizeMax: 2000000,
      geographicFocusNodes: ["l1:mena", "l2:gcc", "l3:ae"],
      notes: "MENA thesis",
      dealBreakers: undefined,
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

  it("keeps the thesis generating banner visible during in-flight runs", () => {
    expect(
      shouldShowThesisGeneratingBanner({
        queuedWebsiteAt: new Date().toISOString(),
        websiteScrapedAt: null,
        thesisSummaryGeneratedAt: null,
      }),
    ).toBe(true);

    expect(
      shouldShowThesisGeneratingBanner({
        queuedWebsiteAt: null,
        websiteScrapedAt: "2026-05-05T10:00:00.000Z",
        thesisSummaryGeneratedAt: "2026-05-05T10:05:00.000Z",
      }),
    ).toBe(false);

    expect(
      shouldShowThesisGeneratingBanner({
        queuedWebsiteAt: null,
        websiteScrapedAt: "2026-05-05T10:00:00.000Z",
        thesisSummaryGeneratedAt: "2026-05-05T09:59:59.000Z",
      }),
    ).toBe(true);
  });

  it("resets the thesis axis filter back to null", () => {
    useFilterStore.setState({ thesisAxis: "fintech", search: "seed" });

    useFilterStore.getState().resetFilters();

    expect(useFilterStore.getState().thesisAxis).toBeNull();
    expect(useFilterStore.getState().search).toBe("");
  });
});
