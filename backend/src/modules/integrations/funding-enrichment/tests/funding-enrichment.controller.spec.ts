import { beforeEach, describe, expect, it, jest } from "bun:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { FundingEnrichmentController } from "../funding-enrichment.controller";
import type { FundingEnrichmentService } from "../funding-enrichment.service";
import type { StartupFundingHistory } from "../../../startup/entities/startup-funding-history.schema";

const startupId = "11111111-1111-1111-1111-111111111111";

function mockRow(overrides: Partial<StartupFundingHistory>): StartupFundingHistory {
  return {
    id: "row-1",
    startupId,
    roundType: "series_a",
    announcedAt: "2024-03-15",
    amount: "18000000",
    currency: "USD",
    valuationPostMoney: "80000000",
    leadInvestor: "Sequoia Capital",
    investors: ["Sequoia Capital", "Founders Fund"],
    sources: [
      {
        provider: "crunchbase",
        sourceUrl: "https://www.crunchbase.com/x",
        fetchedAt: "2026-05-11T00:00:00.000Z",
      },
    ],
    evidenceConfidence: "0.900",
    lastReconciledAt: new Date("2026-05-11T00:00:00.000Z"),
    createdAt: new Date("2026-05-11T00:00:00.000Z"),
    updatedAt: new Date("2026-05-11T00:00:00.000Z"),
    ...overrides,
  } as StartupFundingHistory;
}

describe("FundingEnrichmentController", () => {
  let controller: FundingEnrichmentController;
  let service: jest.Mocked<FundingEnrichmentService>;

  beforeEach(() => {
    service = {
      isConfigured: jest.fn(),
      enrichStartup: jest.fn(),
      listForStartup: jest.fn(),
    } as unknown as jest.Mocked<FundingEnrichmentService>;

    controller = new FundingEnrichmentController(service);
  });

  describe("GET /startups/:id/funding-history", () => {
    it("returns the list with empty=false when rows exist", async () => {
      service.listForStartup.mockResolvedValue([mockRow({})]);

      const response = await controller.list(startupId);
      expect(response.startupId).toBe(startupId);
      expect(response.rows).toHaveLength(1);
      expect(response.empty).toBe(false);
      expect(response.rows[0].lastReconciledAt).toBe(
        "2026-05-11T00:00:00.000Z",
      );
    });

    it("returns empty=true for graceful fallback when no rows", async () => {
      service.listForStartup.mockResolvedValue([]);
      const response = await controller.list(startupId);
      expect(response.empty).toBe(true);
      expect(response.rows).toEqual([]);
    });
  });

  describe("POST /startups/:id/enrichment/funding", () => {
    it("throws ServiceUnavailable when no providers configured", async () => {
      service.isConfigured.mockReturnValue(false);
      await expect(controller.enrich(startupId)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(service.enrichStartup).not.toHaveBeenCalled();
    });

    it("returns persisted rows + provider summary on success", async () => {
      service.isConfigured.mockReturnValue(true);
      service.enrichStartup.mockResolvedValue({
        startupId,
        providersAttempted: ["crunchbase", "public_filing"],
        providersWithMatches: ["crunchbase"],
        rows: [mockRow({})],
      });

      const response = await controller.enrich(startupId);
      expect(response.startupId).toBe(startupId);
      expect(response.providersAttempted).toEqual([
        "crunchbase",
        "public_filing",
      ]);
      expect(response.providersWithMatches).toEqual(["crunchbase"]);
      expect(response.rows).toHaveLength(1);
    });

    it("is idempotent (calls service which uses upsert under the hood)", async () => {
      service.isConfigured.mockReturnValue(true);
      const sameRow = mockRow({ id: "stable-row-1" });
      service.enrichStartup.mockResolvedValue({
        startupId,
        providersAttempted: ["crunchbase"],
        providersWithMatches: ["crunchbase"],
        rows: [sameRow],
      });

      const first = await controller.enrich(startupId);
      const second = await controller.enrich(startupId);
      expect(first.rows[0].id).toBe("stable-row-1");
      expect(second.rows[0].id).toBe("stable-row-1");
      expect(service.enrichStartup).toHaveBeenCalledTimes(2);
    });
  });
});
