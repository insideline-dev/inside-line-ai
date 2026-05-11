// @ts-nocheck
import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";

import { regenerateMemoSection } from "./useRegenerateMemoSection";

// `regenerateMemoSection` is the bare async fetch wrapper used by the
// section-scoped regenerate flow (DG-E1-F1-S2). We test the function
// directly because the React hook itself wraps it via TanStack Query —
// the wrapping is trivial, but the URL + method must be exact so the
// backend route receives the right shape.

const originalFetch = globalThis.fetch;

describe("regenerateMemoSection", () => {
  beforeEach(() => {
    globalThis.fetch = mock(async (_url: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          startupId: "startup-1",
          sectionKey: "team",
          regeneratedAt: "2026-05-11T12:00:00.000Z",
          usedFallback: false,
          overwroteOperatorEdits: false,
          section: {
            sectionKey: "team",
            title: "Team",
            content: "Refreshed.",
            highlights: [],
            concerns: [],
            sources: [],
            regeneratedAt: "2026-05-11T12:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs to the section-scoped regenerate URL", async () => {
    const result = await regenerateMemoSection({
      startupId: "startup-1",
      sectionKey: "team",
    });

    expect(globalThis.fetch.mock.calls.length).toBe(1);
    const [url, init] = globalThis.fetch.mock.calls[0]!;
    expect(url).toContain("/startups/startup-1/memo/sections/team/regenerate");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(result.sectionKey).toBe("team");
    expect(result.section.content).toBe("Refreshed.");
  });

  it("propagates non-OK HTTP responses as thrown errors", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ message: "Conflict" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      regenerateMemoSection({ startupId: "startup-1", sectionKey: "market" }),
    ).rejects.toThrow(/Conflict/);
  });
});
