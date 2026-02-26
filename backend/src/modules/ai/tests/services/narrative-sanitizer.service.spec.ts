import { describe, expect, it } from "bun:test";
import { sanitizeNarrativeText } from "../../services/narrative-sanitizer";

describe("sanitizeNarrativeText", () => {
  it("removes score/confidence sentence boilerplate", () => {
    const input =
      "This section is currently scored at 88/100 with 85% confidence. Product execution has improved materially.";

    const output = sanitizeNarrativeText(input);

    expect(output).toBe("Product execution has improved materially.");
    expect(output).not.toContain("/100");
    expect(output.toLowerCase()).not.toContain("confidence");
  });

  it("removes inline score/confidence parentheticals", () => {
    const input =
      "Highest-signal dimensions are Team (91/100, 84% confidence) and Product (88/100, 80% confidence).";

    const output = sanitizeNarrativeText(input);

    expect(output).toBe("Highest-signal dimensions are Team and Product.");
    expect(output).not.toContain("/100");
    expect(output.toLowerCase()).not.toContain("% confidence");
  });

  it("removes standalone score sentences and confidence qualifiers", () => {
    const input =
      "Uber is currently rated 85/100 with a Pass recommendation and medium confidence. The package shows strong upside but requires diligence.";

    const output = sanitizeNarrativeText(input);

    expect(output).toBe("The package shows strong upside but requires diligence.");
    expect(output).not.toContain("/100");
    expect(output.toLowerCase()).not.toContain("medium confidence");
  });

  it("removes highest/lowest-scoring dimension boilerplate", () => {
    const input =
      "Highest-scoring dimensions are Traction, Team, and Market. Lowest-scoring dimensions are Legal and Deal Terms.";

    const output = sanitizeNarrativeText(input);

    expect(output).toBe("");
  });
});
