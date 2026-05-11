import { beforeEach, describe, expect, it, jest } from "bun:test";
import {
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  FUNDING_HISTORY_PROVIDERS,
  FundingEnrichmentService,
} from "../funding-enrichment.service";
import { DrizzleService } from "../../../../database";
import type {
  FundingHistoryProvider,
  FundingProviderHints,
  RawFundingRound,
} from "../interfaces/funding-history-provider.interface";
import type { StartupFundingHistory } from "../../../startup/entities/startup-funding-history.schema";

import crunchbaseFixture from "./fixtures/crunchbase-acme-rounds.json";
import edgarFixture from "./fixtures/edgar-acme-formd.json";

interface FixtureRound {
  roundType: string;
  announcedAt: string;
  amount: number | null;
  currency: string | null;
  valuationPostMoney: number | null;
  leadInvestor: string | null;
  investors: string[];
  sourceUrl: string;
}

const startupId = "11111111-1111-1111-1111-111111111111";
const mockStartup = {
  id: startupId,
  name: "Acme Robotics",
  website: "https://acme.example",
  geoCountryCode: "US",
};

const NOW = new Date("2026-05-11T12:00:00Z").toISOString();
const EARLIER = new Date("2026-05-10T12:00:00Z").toISOString();

function fixtureRoundsToRaw(
  rounds: FixtureRound[],
  provider: "crunchbase" | "public_filing",
  fetchedAt: string,
): RawFundingRound[] {
  return rounds.map((r) => ({
    roundType: r.roundType,
    announcedAt: r.announcedAt,
    amount: r.amount,
    currency: r.currency,
    valuationPostMoney: r.valuationPostMoney,
    leadInvestor: r.leadInvestor,
    investors: r.investors,
    confidence: provider === "crunchbase" ? 0.9 : 0.7,
    source: {
      provider,
      sourceUrl: r.sourceUrl,
      fetchedAt,
    },
  }));
}

class FakeProvider implements FundingHistoryProvider {
  constructor(
    public readonly providerName:
      | "crunchbase"
      | "public_filing"
      | "press_release",
    private readonly result:
      | RawFundingRound[]
      | { error: Error },
    public configured = true,
  ) {}

  isConfigured(): boolean {
    return this.configured;
  }

  async fetchRounds(_hints: FundingProviderHints): Promise<RawFundingRound[]> {
    if (Array.isArray(this.result)) return this.result;
    throw this.result.error;
  }
}

interface FakeDb {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  limit: jest.Mock;
  insert: jest.Mock;
  values: jest.Mock;
  onConflictDoUpdate: jest.Mock;
  returning: jest.Mock;
}

function createFakeDb(): FakeDb & {
  __startupSelectResult: unknown[];
  __listSelectResult: unknown[];
  __returningResult: unknown[];
} {
  const fake = {
    __startupSelectResult: [mockStartup],
    __listSelectResult: [] as unknown[],
    __returningResult: [] as unknown[],
    select: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
    insert: jest.fn(),
    values: jest.fn(),
    onConflictDoUpdate: jest.fn(),
    returning: jest.fn(),
  } as ReturnType<typeof createFakeDb>;

  fake.select.mockImplementation(() => fake);
  fake.from.mockImplementation(() => fake);
  // .limit triggers a "fetch one" terminal — return the startup row.
  fake.limit.mockImplementation(async () => fake.__startupSelectResult);
  // .where without .limit is the listForStartup terminal — but here we
  // overload by allowing either a thenable terminal or chaining; tests
  // configure these explicitly.
  fake.where.mockImplementation(() => fake);
  fake.insert.mockImplementation(() => fake);
  fake.values.mockImplementation(() => fake);
  fake.onConflictDoUpdate.mockImplementation(() => fake);
  fake.returning.mockImplementation(async () => fake.__returningResult);
  return fake;
}

async function buildService(
  providers: FundingHistoryProvider[],
  db: ReturnType<typeof createFakeDb>,
): Promise<FundingEnrichmentService> {
  const drizzle = { db } as unknown as DrizzleService;
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      FundingEnrichmentService,
      { provide: DrizzleService, useValue: drizzle },
      { provide: FUNDING_HISTORY_PROVIDERS, useValue: providers },
    ],
  }).compile();
  return module.get(FundingEnrichmentService);
}

describe("FundingEnrichmentService", () => {
  let db: ReturnType<typeof createFakeDb>;

  beforeEach(() => {
    db = createFakeDb();
  });

  describe("isConfigured", () => {
    it("returns false when no provider is configured", async () => {
      const providers = [
        new FakeProvider("crunchbase", [], false),
        new FakeProvider("public_filing", [], false),
      ];
      const service = await buildService(providers, db);
      expect(service.isConfigured()).toBe(false);
    });

    it("returns true when at least one provider is configured", async () => {
      const providers = [
        new FakeProvider("crunchbase", [], false),
        new FakeProvider("public_filing", [], true),
      ];
      const service = await buildService(providers, db);
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe("enrichStartup", () => {
    it("throws ServiceUnavailable when no providers are configured", async () => {
      const providers = [
        new FakeProvider("crunchbase", [], false),
        new FakeProvider("public_filing", [], false),
      ];
      const service = await buildService(providers, db);
      await expect(service.enrichStartup(startupId)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it("throws NotFound when the startup does not exist", async () => {
      db.__startupSelectResult = [];
      const providers = [
        new FakeProvider("crunchbase", [], true),
      ];
      const service = await buildService(providers, db);
      await expect(service.enrichStartup(startupId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("merges overlapping rounds across providers into one row per round", async () => {
      // Crunchbase: 2 rounds. EDGAR: 1 round that overlaps the Series A.
      const crunchbaseRounds = fixtureRoundsToRaw(
        crunchbaseFixture.rounds,
        "crunchbase",
        EARLIER,
      );
      const edgarRounds = fixtureRoundsToRaw(
        edgarFixture.rounds,
        "public_filing",
        NOW, // edgar fetched later
      );

      // The DB upsert returns whatever was inserted; capture all values
      // pushed through onConflictDoUpdate to verify merged shape.
      const captured: Array<Record<string, unknown>> = [];
      db.values.mockImplementation((insert: Record<string, unknown>) => {
        captured.push(insert);
        return db;
      });
      db.returning.mockImplementation(async () => {
        const last = captured[captured.length - 1];
        return [
          {
            id: `row-${captured.length}`,
            ...last,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];
      });

      const providers = [
        new FakeProvider("crunchbase", crunchbaseRounds, true),
        new FakeProvider("public_filing", edgarRounds, true),
      ];
      const service = await buildService(providers, db);

      const result = await service.enrichStartup(startupId);

      // 2 unique rounds: series_a (merged) + seed (crunchbase only).
      expect(result.rows.length).toBe(2);
      expect(result.providersWithMatches.sort()).toEqual([
        "crunchbase",
        "public_filing",
      ]);
      expect(result.providersAttempted.sort()).toEqual([
        "crunchbase",
        "public_filing",
      ]);

      const seriesA = captured.find(
        (c) => c.roundType === "series_a",
      );
      expect(seriesA).toBeTruthy();
      const sources = seriesA?.sources as Array<{
        provider: string;
        conflictsWith?: string[];
      }>;
      expect(sources).toHaveLength(2);
      const providerNames = sources.map((s) => s.provider).sort();
      expect(providerNames).toEqual(["crunchbase", "public_filing"]);
    });

    it("records conflictsWith when providers disagree on amount", async () => {
      // Same round, different amounts.
      const a: RawFundingRound = {
        roundType: "series_b",
        announcedAt: "2025-01-15",
        amount: 25_000_000,
        currency: "USD",
        valuationPostMoney: null,
        leadInvestor: null,
        investors: [],
        confidence: 0.8,
        source: {
          provider: "crunchbase",
          sourceUrl: "https://www.crunchbase.com/funding_round/x",
          fetchedAt: EARLIER,
        },
      };
      const b: RawFundingRound = {
        ...a,
        amount: 27_500_000,
        source: {
          provider: "public_filing",
          sourceUrl: "https://www.sec.gov/x",
          fetchedAt: NOW, // newer => its values win
        },
      };

      const captured: Array<Record<string, unknown>> = [];
      db.values.mockImplementation((insert: Record<string, unknown>) => {
        captured.push(insert);
        return db;
      });
      db.returning.mockImplementation(async () => [
        {
          id: "row-1",
          ...captured[captured.length - 1],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const providers = [
        new FakeProvider("crunchbase", [a], true),
        new FakeProvider("public_filing", [b], true),
      ];
      const service = await buildService(providers, db);

      await service.enrichStartup(startupId);

      const persisted = captured[0];
      // Winner is the newer fetched source (EDGAR / public_filing).
      expect(persisted?.amount).toBe("27500000");
      const sources = persisted?.sources as Array<{
        provider: string;
        conflictsWith?: string[];
      }>;
      const crunchbaseEntry = sources.find(
        (s) => s.provider === "crunchbase",
      );
      expect(crunchbaseEntry?.conflictsWith).toContain("amount");
    });

    it("returns no rows and writes nothing when both providers return empty", async () => {
      db.values.mockImplementation(() => db);
      db.returning.mockImplementation(async () => []);

      const providers = [
        new FakeProvider("crunchbase", [], true),
        new FakeProvider("public_filing", [], true),
      ];
      const service = await buildService(providers, db);

      const result = await service.enrichStartup(startupId);
      expect(result.rows).toEqual([]);
      expect(result.providersWithMatches).toEqual([]);
      expect(result.providersAttempted.sort()).toEqual([
        "crunchbase",
        "public_filing",
      ]);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("isolates a failing provider from the others", async () => {
      const cbRounds = fixtureRoundsToRaw(
        crunchbaseFixture.rounds,
        "crunchbase",
        EARLIER,
      );
      const captured: Array<Record<string, unknown>> = [];
      db.values.mockImplementation((insert: Record<string, unknown>) => {
        captured.push(insert);
        return db;
      });
      db.returning.mockImplementation(async () => [
        {
          id: `row-${captured.length}`,
          ...captured[captured.length - 1],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const providers = [
        new FakeProvider("crunchbase", cbRounds, true),
        new FakeProvider(
          "public_filing",
          { error: new Error("upstream 503") },
          true,
        ),
      ];
      const service = await buildService(providers, db);

      const result = await service.enrichStartup(startupId);
      expect(result.providersWithMatches).toEqual(["crunchbase"]);
      expect(result.providersAttempted.sort()).toEqual([
        "crunchbase",
        "public_filing",
      ]);
      expect(result.rows.length).toBe(2);
    });
  });

  describe("listForStartup", () => {
    it("returns rows sorted newest-first by announcedAt", async () => {
      const rows: Partial<StartupFundingHistory>[] = [
        {
          id: "r1",
          startupId,
          roundType: "seed",
          announcedAt: "2022-09-01",
        },
        {
          id: "r2",
          startupId,
          roundType: "series_a",
          announcedAt: "2024-03-15",
        },
        {
          id: "r3",
          startupId,
          roundType: "unknown",
          announcedAt: null,
        },
      ];

      // Override .where so it terminates with the rows (not chainable to .limit).
      db.where.mockImplementation(async () => rows);

      const providers = [new FakeProvider("crunchbase", [], true)];
      const service = await buildService(providers, db);

      const result = await service.listForStartup(startupId);
      expect(result.map((r) => r.id)).toEqual(["r2", "r1", "r3"]);
    });
  });
});
