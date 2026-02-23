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
});

