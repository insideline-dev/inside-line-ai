import { describe, expect, it } from "bun:test";
import { AiPromptService } from "../../services/ai-prompt.service";

describe("AiPromptService versioned prompt resolution (DS-E2-F1-S2)", () => {
  const service = new AiPromptService({ db: {} } as never);

  it("resolve({ key: 'lens.team' }) returns the active version body", async () => {
    const resolved = await service.resolve({ key: "lens.team" });

    expect(resolved.version).toBe("1");
    expect(resolved.systemPrompt).toContain("Team Lens");
  });

  it("resolve({ key: 'lens.team', version: '1' }) returns the v1 body explicitly", async () => {
    const resolved = await service.resolve({
      key: "lens.team",
      version: "1",
    });

    expect(resolved.version).toBe("1");
    expect(resolved.systemPrompt).toContain("Team Lens");
  });

  it("resolve({ key: 'lens.team', version: 'unknown' }) falls back to active and logs", async () => {
    const resolved = await service.resolve({
      key: "lens.team",
      version: "99",
    });

    // Falls back to active rather than throwing — the lens has its own
    // fallback path so missing prompts should still produce *some* output.
    expect(resolved.version).toBe("1");
  });

  it("resolve({ key: 'evaluation.team' }) returns null version for un-versioned entries", async () => {
    const resolved = await service.resolve({ key: "evaluation.team" });

    // Evaluation prompts don't carry a `versions` map yet — version is null.
    expect(resolved.version).toBeNull();
  });
});

describe("AiPromptService narrative guardrails", () => {
  const service = new AiPromptService({ db: {} } as never);

  it("injects guardrail into evaluation prompts", () => {
    const input = {
      key: "evaluation.team",
      stage: null,
      systemPrompt: "SYSTEM",
      userPrompt: "USER",
      source: "db" as const,
      revisionId: "rev-1",
    };

    const output = (service as never).injectNarrativeGuardrails(input) as typeof input;

    expect(output.systemPrompt).toContain("Internal Narrative Guardrail");
    expect(output.systemPrompt).toContain("Do NOT mention numeric scores");
  });

  it("does not inject guardrail into non-target prompts", () => {
    const input = {
      key: "clara.intent",
      stage: null,
      systemPrompt: "SYSTEM",
      userPrompt: "USER",
      source: "db" as const,
      revisionId: "rev-1",
    };

    const output = (service as never).injectNarrativeGuardrails(input) as typeof input;

    expect(output.systemPrompt).toBe("SYSTEM");
  });

  it("avoids duplicate guardrail injection", () => {
    const input = {
      key: "synthesis.final",
      stage: null,
      systemPrompt: "SYSTEM\n\n## Internal Narrative Guardrail\nKeep prose qualitative.",
      userPrompt: "USER",
      source: "db" as const,
      revisionId: "rev-1",
    };

    const output = (service as never).injectNarrativeGuardrails(input) as typeof input;

    const occurrences = (output.systemPrompt.match(/Internal Narrative Guardrail/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});
