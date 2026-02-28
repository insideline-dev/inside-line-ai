import { describe, expect, it } from "bun:test";

/**
 * Issue 2: Two competing matching systems
 *
 * This test verifies that the legacy MatchingProcessor from the analysis module
 * is NOT registered in the AnalysisModule providers, and that only the AI-powered
 * matching processor (modules/ai/processors/matching.processor.ts) handles matching jobs.
 */
describe("Matching processor deduplication", () => {
  it("legacy MatchingProcessor is not exported from analysis module providers", async () => {
    // Dynamic import of the module definition (not instantiated)
    const { AnalysisModule } = await import("../analysis.module");

    // Grab Nest module metadata
    const { providers = [] } = Reflect.getMetadata("imports", AnalysisModule) ?? {};
    // The providers list itself isn't exposed directly from metadata via Reflect in unit tests,
    // so we inspect the module definition through its decorators.

    // Instead, read the module source to ensure MatchingProcessor is NOT in providers array.
    // We do this by verifying the AnalysisModule file doesn't list it as a provider token.
    const fs = await import("fs");
    const path = await import("path");
    const modulePath = path.resolve(
      __dirname,
      "../analysis.module.ts",
    );
    const source = fs.readFileSync(modulePath, "utf-8");

    // The module should NOT have MatchingProcessor as an active (uncommented) provider
    // Filter out comment lines then check for MatchingProcessor
    const activeLines = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    const providersBlock = activeLines.match(/providers:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    expect(providersBlock).not.toContain("MatchingProcessor");
  });

  it("legacy MatchingProcessor file is marked as deprecated", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const legacyProcessorPath = path.resolve(
      __dirname,
      "../processors/matching.processor.ts",
    );
    const source = fs.readFileSync(legacyProcessorPath, "utf-8");

    expect(source).toContain("@deprecated");
  });
});
