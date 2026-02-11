import { describe, expect, it } from "bun:test";
import {
  canonicalizeGeographicFocus,
  deriveStartupGeography,
  geographySelectionMatchesStartupPath,
  getInvestorGeographyTaxonomy,
} from "./geography-taxonomy";

describe("geography-taxonomy", () => {
  it("maps GCC city to MENA > GCC > country", () => {
    const geo = deriveStartupGeography("Dubai, UAE");

    expect(geo.countryCode).toBe("AE");
    expect(geo.path).toEqual(["l1:mena", "l2:gcc", "l3:ae"]);
  });

  it("maps US city to North America hierarchy", () => {
    const geo = deriveStartupGeography("San Francisco, CA");

    expect(geo.countryCode).toBe("US");
    expect(geo.path).toEqual(["l1:north_america", "l2:us_canada", "l3:us"]);
    expect(geo.normalizedRegion).toBe("us");
  });

  it("converts legacy labels to canonical node ids", () => {
    const nodeIds = canonicalizeGeographicFocus({
      geographicFocus: ["North America", "Middle East"],
    });

    expect(nodeIds).toContain("l1:north_america");
    expect(nodeIds).toContain("l1:mena");
  });

  it("matches descendants when parent region is selected", () => {
    const startupGeo = deriveStartupGeography("Riyadh, Saudi Arabia");

    expect(
      geographySelectionMatchesStartupPath(["l1:mena"], startupGeo.path),
    ).toBe(true);
    expect(
      geographySelectionMatchesStartupPath(["l2:gcc"], startupGeo.path),
    ).toBe(true);
    expect(
      geographySelectionMatchesStartupPath(["l3:sa"], startupGeo.path),
    ).toBe(true);
    expect(
      geographySelectionMatchesStartupPath(["l1:europe"], startupGeo.path),
    ).toBe(false);
  });

  it("exposes MENA > GCC taxonomy nodes", () => {
    const taxonomy = getInvestorGeographyTaxonomy();
    const mena = taxonomy.find((node) => node.id === "l1:mena");
    const gcc = mena?.children?.find((node) => node.id === "l2:gcc");

    expect(mena).toBeDefined();
    expect(gcc).toBeDefined();
    expect(gcc?.children?.map((child) => child.id)).toContain("l3:ae");
    expect(gcc?.children?.map((child) => child.id)).toContain("l3:sa");
  });
});
