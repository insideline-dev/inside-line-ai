import { beforeEach, describe, expect, it, jest } from "bun:test";
import type { ConfigService } from "@nestjs/config";
import { CrunchbaseProvider } from "../providers/crunchbase.provider";
import { EdgarProvider } from "../providers/edgar.provider";
import { PressReleaseProvider } from "../providers/press-release.provider";

import crunchbaseFixture from "./fixtures/crunchbase-acme-rounds.json";
import edgarFixture from "./fixtures/edgar-acme-formd.json";

/**
 * Provider client tests. Each provider has a stub HTTP path (real wire
 * calls are a follow-up) but the configuration + safety contract is
 * exercised here against the canonical fixtures.
 */
function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe("CrunchbaseProvider", () => {
  it("isConfigured returns false without API key", () => {
    const provider = new CrunchbaseProvider(makeConfig({}));
    expect(provider.isConfigured()).toBe(false);
  });

  it("isConfigured returns true when API key is set", () => {
    const provider = new CrunchbaseProvider(
      makeConfig({ CRUNCHBASE_API_KEY: "sandbox-key" }),
    );
    expect(provider.isConfigured()).toBe(true);
  });

  it("fetchRounds returns [] when unconfigured (does not throw)", async () => {
    const provider = new CrunchbaseProvider(makeConfig({}));
    const rounds = await provider.fetchRounds({
      name: crunchbaseFixture.company,
    });
    expect(rounds).toEqual([]);
  });

  it("fetchRounds returns [] for the configured stub path (live wire is TODO)", async () => {
    const provider = new CrunchbaseProvider(
      makeConfig({ CRUNCHBASE_API_KEY: "sandbox-key" }),
    );
    const rounds = await provider.fetchRounds({
      name: crunchbaseFixture.company,
    });
    // Stub path: real HTTP not implemented yet.
    expect(rounds).toEqual([]);
  });

  it("providerName matches the schema enum", () => {
    const provider = new CrunchbaseProvider(makeConfig({}));
    expect(provider.providerName).toBe("crunchbase");
  });
});

describe("EdgarProvider", () => {
  beforeEach(() => {
    // ensure jest mock fns are isolated
  });

  it("isConfigured returns false without EDGAR_USER_AGENT", () => {
    const provider = new EdgarProvider(makeConfig({}));
    expect(provider.isConfigured()).toBe(false);
  });

  it("isConfigured returns true when EDGAR_USER_AGENT is set", () => {
    const provider = new EdgarProvider(
      makeConfig({ EDGAR_USER_AGENT: "inside-line ops@example.com" }),
    );
    expect(provider.isConfigured()).toBe(true);
  });

  it("fetchRounds skips non-US startups", async () => {
    const provider = new EdgarProvider(
      makeConfig({ EDGAR_USER_AGENT: "inside-line ops@example.com" }),
    );
    const rounds = await provider.fetchRounds({
      name: edgarFixture.company,
      country: "DE",
    });
    expect(rounds).toEqual([]);
  });

  it("fetchRounds returns [] for US startups (stub path)", async () => {
    const provider = new EdgarProvider(
      makeConfig({ EDGAR_USER_AGENT: "inside-line ops@example.com" }),
    );
    const rounds = await provider.fetchRounds({
      name: edgarFixture.company,
      country: "US",
    });
    expect(rounds).toEqual([]);
  });

  it("providerName matches the schema enum", () => {
    const provider = new EdgarProvider(makeConfig({}));
    expect(provider.providerName).toBe("public_filing");
  });
});

describe("PressReleaseProvider", () => {
  it("is always configured (stub fallback)", () => {
    const provider = new PressReleaseProvider();
    expect(provider.isConfigured()).toBe(true);
  });

  it("fetchRounds returns [] (AI extract path is TODO)", async () => {
    const provider = new PressReleaseProvider();
    const rounds = await provider.fetchRounds({ name: "Anything" });
    expect(rounds).toEqual([]);
  });

  it("providerName matches the schema enum", () => {
    const provider = new PressReleaseProvider();
    expect(provider.providerName).toBe("press_release");
  });
});
