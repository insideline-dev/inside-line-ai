import { describe, expect, it } from "bun:test";
import { ScreeningCascadeService } from "../cascade.service";

describe("ScreeningCascadeService", () => {
  const svc = new ScreeningCascadeService();

  // --- DECK_UPLOADED ---
  it("DECK_UPLOADED invalidates the full pipeline", () => {
    expect(svc.phasesToRerun("DECK_UPLOADED")).toEqual([
      "extraction",
      "enrichment",
      "scraping",
      "gap-fill",
      "classification",
      "market",
      "team",
      "traction",
      "fit",
      "verdict",
    ]);
  });

  // --- WEBSITE_CHANGE ---
  it("WEBSITE_CHANGE re-runs scraping, market, fit, verdict", () => {
    expect(svc.phasesToRerun("WEBSITE_CHANGE")).toEqual([
      "scraping",
      "market",
      "fit",
      "verdict",
    ]);
  });
  it("WEBSITE_CHANGE does NOT re-run team or traction", () => {
    const phases = svc.phasesToRerun("WEBSITE_CHANGE");
    expect(phases).not.toContain("team");
    expect(phases).not.toContain("traction");
  });

  // --- TRACTION_FIELD_EDIT ---
  it("TRACTION_FIELD_EDIT re-runs traction, fit, verdict", () => {
    expect(svc.phasesToRerun("TRACTION_FIELD_EDIT")).toEqual([
      "traction",
      "fit",
      "verdict",
    ]);
  });
  it("TRACTION_FIELD_EDIT does NOT touch market or team", () => {
    const phases = svc.phasesToRerun("TRACTION_FIELD_EDIT");
    expect(phases).not.toContain("market");
    expect(phases).not.toContain("team");
  });

  // --- FOUNDER_FIELD_EDIT ---
  it("FOUNDER_FIELD_EDIT re-runs enrichment, team, fit, verdict", () => {
    expect(svc.phasesToRerun("FOUNDER_FIELD_EDIT")).toEqual([
      "enrichment",
      "team",
      "fit",
      "verdict",
    ]);
  });

  // --- THESIS_EDIT ---
  it("THESIS_EDIT touches only fit + verdict (lenses are not thesis-dependent)", () => {
    expect(svc.phasesToRerun("THESIS_EDIT")).toEqual(["fit", "verdict"]);
  });

  // --- CLASSIFICATION_EDIT ---
  it("CLASSIFICATION_EDIT touches only fit + verdict (investor manually corrected sector/geo)", () => {
    expect(svc.phasesToRerun("CLASSIFICATION_EDIT")).toEqual([
      "fit",
      "verdict",
    ]);
  });

  // --- UNKNOWN_CHANGE / failsafe ---
  it("UNKNOWN_CHANGE re-runs everything (failsafe)", () => {
    const phases = svc.phasesToRerun("UNKNOWN_CHANGE");
    expect(phases).toHaveLength(10);
    expect(phases).toContain("verdict");
  });
  it("any unmapped string falls back to UNKNOWN_CHANGE behaviour", () => {
    expect(svc.phasesToRerun("MARTIAN_INVASION")).toEqual(
      svc.phasesToRerun("UNKNOWN_CHANGE"),
    );
    expect(svc.phasesToRerun("")).toEqual(svc.phasesToRerun("UNKNOWN_CHANGE"));
  });

  // --- shouldRerun helper ---
  it("shouldRerun returns true/false against the same rule table", () => {
    expect(svc.shouldRerun("THESIS_EDIT", "fit")).toBe(true);
    expect(svc.shouldRerun("THESIS_EDIT", "verdict")).toBe(true);
    expect(svc.shouldRerun("THESIS_EDIT", "market")).toBe(false);
    expect(svc.shouldRerun("TRACTION_FIELD_EDIT", "traction")).toBe(true);
    expect(svc.shouldRerun("WEBSITE_CHANGE", "scraping")).toBe(true);
  });

  // --- introspection ---
  it("knownChangeKinds lists the seven canonical kinds", () => {
    expect(svc.knownChangeKinds().sort()).toEqual(
      [
        "CLASSIFICATION_EDIT",
        "DECK_UPLOADED",
        "FOUNDER_FIELD_EDIT",
        "THESIS_EDIT",
        "TRACTION_FIELD_EDIT",
        "UNKNOWN_CHANGE",
        "WEBSITE_CHANGE",
      ].sort(),
    );
  });

  it("knownPhases lists all ten phases in pipeline order", () => {
    expect(svc.knownPhases()).toEqual([
      "extraction",
      "enrichment",
      "scraping",
      "gap-fill",
      "classification",
      "market",
      "team",
      "traction",
      "fit",
      "verdict",
    ]);
  });

  // --- immutability ---
  it("phasesToRerun returns a fresh array (mutation safety)", () => {
    const a = svc.phasesToRerun("THESIS_EDIT");
    a.push("market");
    const b = svc.phasesToRerun("THESIS_EDIT");
    expect(b).toEqual(["fit", "verdict"]);
  });

  // --- universal invariant ---
  it("every rule transitively invalidates 'verdict' — the final write must always re-run", () => {
    for (const change of svc.knownChangeKinds()) {
      expect(svc.phasesToRerun(change)).toContain("verdict");
    }
  });
});
