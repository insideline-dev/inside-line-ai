// @ts-nocheck
import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";

import {
  applyClaimRewrite,
  suggestClaimRewrite,
} from "./useClaimRewrite";

// Tests for the bare async fetch wrappers behind the inline-claim-edit
// flow (DG-E1-F3-S1). The React hooks themselves are trivial TanStack
// Query wrappers — what matters is the request shape and that the
// `sectionKey` is correctly routed into the URL vs the body.

const originalFetch = globalThis.fetch;

describe("suggestClaimRewrite", () => {
  beforeEach(() => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          startupId: "startup-1",
          sectionKey: "team",
          originalText: "Two pilots since 2024.",
          rewrites: [
            { text: "Two pilots have shipped since 2024.", diff: "edit" },
          ],
          candidateCountBeforeFilter: 1,
          usedFallback: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs to the claim-rewrite URL with the section key in the body", async () => {
    const result = await suggestClaimRewrite("startup-1", {
      sectionKey: "team",
      originalText: "Two pilots since 2024.",
      instruction: "shorter",
      sourceIds: ["deck://"],
    });

    expect(globalThis.fetch.mock.calls.length).toBe(1);
    const [url, init] = globalThis.fetch.mock.calls[0]!;
    expect(url).toContain("/startups/startup-1/memo/claims/rewrite");
    expect(init?.method).toBe("POST");
    const parsedBody = JSON.parse(init?.body as string);
    expect(parsedBody).toEqual({
      sectionKey: "team",
      originalText: "Two pilots since 2024.",
      instruction: "shorter",
      sourceIds: ["deck://"],
    });
    expect(result.rewrites).toHaveLength(1);
    expect(result.usedFallback).toBe(false);
  });

  it("propagates non-OK HTTP responses as thrown errors", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ message: "Bad" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      suggestClaimRewrite("startup-1", {
        sectionKey: "team",
        originalText: "",
      }),
    ).rejects.toThrow(/Bad/);
  });
});

describe("applyClaimRewrite", () => {
  beforeEach(() => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          startupId: "startup-1",
          sectionKey: "market",
          regeneratedAt: "2026-05-11T12:00:00.000Z",
          overwroteOperatorEdits: false,
          section: {
            sectionKey: "market",
            title: "Market Opportunity",
            content: "Operator-edited market narrative.",
            highlights: [],
            concerns: [],
            sources: [{ label: "deck", url: "deck://" }],
            regeneratedAt: "2026-05-11T12:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs to the section apply-rewrite URL with the new content in the body", async () => {
    const result = await applyClaimRewrite("startup-1", {
      sectionKey: "market",
      newContent: "Operator-edited market narrative.",
    });

    expect(globalThis.fetch.mock.calls.length).toBe(1);
    const [url, init] = globalThis.fetch.mock.calls[0]!;
    expect(url).toContain(
      "/startups/startup-1/memo/sections/market/apply-rewrite",
    );
    expect(init?.method).toBe("POST");
    const parsedBody = JSON.parse(init?.body as string);
    // sectionKey is routed into the URL, NOT carried in the body — this is
    // load-bearing: the backend reads :sectionKey as a path param.
    expect(parsedBody.sectionKey).toBeUndefined();
    expect(parsedBody.newContent).toBe("Operator-edited market narrative.");
    expect(result.section.content).toBe("Operator-edited market narrative.");
    expect(result.section.sources).toEqual([{ label: "deck", url: "deck://" }]);
  });

  it("forwards an explicit sources override to the backend", async () => {
    await applyClaimRewrite("startup-1", {
      sectionKey: "market",
      newContent: "Edited.",
      sources: [{ label: "Custom", url: "https://custom.test" }],
    });

    const [, init] = globalThis.fetch.mock.calls[0]!;
    const parsedBody = JSON.parse(init?.body as string);
    expect(parsedBody.sources).toEqual([
      { label: "Custom", url: "https://custom.test" },
    ]);
  });
});
