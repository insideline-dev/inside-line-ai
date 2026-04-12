import { describe, expect, it } from "bun:test";
import { extractKpiMetrics } from "../src/lib/kpi-metrics";
import type { Evaluation } from "../src/types/evaluation";
import type { Startup } from "../src/types/startup";

const startup = {
  id: "startup_1",
  userId: "user_1",
  slug: "acme-ai",
  submittedByRole: "founder",
  isPrivate: true,
  name: "Acme AI",
  tagline: "Autonomous workflows for finance teams",
  status: "submitted",
  technologyReadinessLevel: "mvp",
  createdAt: "2026-04-02T00:00:00.000Z",
} satisfies Startup;

describe("extractKpiMetrics", () => {
  it("prefers deck structured data for KPIs when present", () => {
    const evaluation = {
      id: "eval_deck",
      startupId: startup.id,
      deckData: {
        financials: {
          arr: "$2.5M",
          growthRate: "150% YoY",
          grossMargin: "72%",
        },
        market: {
          tam: "$50B",
          marketGrowthRate: "12% CAGR",
        },
      },
      // Evaluation data should be overridden by deck data
      financialsData: {
        charts: {
          revenueProjection: [{ period: "2026", revenue: 1000000 }],
          marginProgression: [{ period: "2026", grossMargin: 55 }],
        },
        keyMetrics: { arr: "$800K" },
      },
      marketData: {
        marketSizing: { tam: { value: "$30B" } },
        marketGrowthAndTiming: {
          growthRate: { deckClaimed: "80% YoY", cagr: "10%", period: "2025-2030" },
        },
      },
      createdAt: "2026-04-02T00:00:00.000Z",
    } as unknown as Evaluation;

    const result = extractKpiMetrics(startup, evaluation);
    expect(result.arr).toBe("$2.5M");
    expect(result.growthRate).toBe("150% YoY");
    expect(result.grossMargin).toBe("72%");
    expect(result.tam).toBe("$50B");
    expect(result.marketGrowth).toBe("12% CAGR");
  });

  it("falls back to chart/evaluation data when deck data is absent", () => {
    const evaluation = {
      id: "eval_1",
      startupId: startup.id,
      financialsData: {
        charts: {
          revenueProjection: [{ period: "2026", revenue: 2400000 }],
          marginProgression: [{ period: "2026", grossMargin: 72 }],
        },
        keyMetrics: {
          arr: "$1.1M",
          grossMargin: "61%",
        },
      },
      marketData: {
        marketGrowthAndTiming: {
          growthRate: {
            deckClaimed: "48% YoY",
            cagr: "22%",
            period: "2025-2030",
          },
        },
      },
      createdAt: "2026-04-02T00:00:00.000Z",
    } as unknown as Evaluation;

    expect(extractKpiMetrics(startup, evaluation)).toMatchObject({
      arr: "$2.4M",
      growthRate: "48% YoY",
      grossMargin: "72%",
    });
  });

  it("does not mirror market growth from researched CAGR when deck market growth is missing", () => {
    const evaluation = {
      id: "eval_no_market_growth",
      startupId: startup.id,
      financialsData: {
        charts: {
          revenueProjection: [],
          marginProgression: [],
        },
        keyMetrics: {},
      },
      deckData: {
        financials: {
          growthRate: "48% YoY",
        },
        market: {},
      },
      marketData: {
        marketGrowthAndTiming: {
          growthRate: {
            deckClaimed: "48% YoY",
            cagr: "22%",
            period: "2025-2030",
          },
        },
      },
      createdAt: "2026-04-02T00:00:00.000Z",
    } as unknown as Evaluation;

    expect(extractKpiMetrics(startup, evaluation)).toMatchObject({
      growthRate: "48% YoY",
      marketGrowth: "—",
    });
  });

  it("keeps market growth when explicit deck market-growth evidence exists", () => {
    const evaluation = {
      id: "eval_market_growth_present",
      startupId: startup.id,
      financialsData: {
        charts: {
          revenueProjection: [],
          marginProgression: [],
        },
        keyMetrics: {},
      },
      deckData: {
        financials: {
          growthRate: "48% YoY",
        },
        market: {
          marketGrowthRate: "22% CAGR",
        },
      },
      marketData: {
        marketGrowthAndTiming: {
          growthRate: {
            deckClaimed: "48% YoY",
            cagr: "22%",
            period: "2025-2030",
          },
        },
      },
      createdAt: "2026-04-02T00:00:00.000Z",
    } as unknown as Evaluation;

    expect(extractKpiMetrics(startup, evaluation)).toMatchObject({
      growthRate: "48% YoY",
      marketGrowth: "22% CAGR",
    });
  });

  it("falls back to legacy keyMetrics and CAGR fields when new-style fields are absent", () => {
    const evaluation = {
      id: "eval_2",
      startupId: startup.id,
      financialsData: {
        charts: {
          revenueProjection: [],
          marginProgression: [],
        },
        keyMetrics: {
          annualRecurringRevenue: "$950K ARR",
          grossMargin: "68%",
        },
      },
      marketData: {
        marketGrowthAndTiming: {
          growthRate: {
            deckClaimed: "Unknown",
            cagr: "35%",
            period: "CAGR",
          },
        },
      },
      createdAt: "2026-04-02T00:00:00.000Z",
    } as unknown as Evaluation;

    expect(extractKpiMetrics(startup, evaluation)).toMatchObject({
      arr: "$950K ARR",
      growthRate: "35% CAGR",
      grossMargin: "68%",
    });
  });

  it("returns em dashes when KPI sources are missing", () => {
    const evaluation = {
      id: "eval_3",
      startupId: startup.id,
      financialsData: {
        charts: {
          revenueProjection: [],
          marginProgression: [],
        },
        keyMetrics: {},
      },
      marketData: {
        marketGrowthAndTiming: {
          growthRate: {
            deckClaimed: "Unknown",
            cagr: "Unknown",
            period: "Unknown",
          },
        },
      },
      createdAt: "2026-04-02T00:00:00.000Z",
    } as unknown as Evaluation;

    expect(extractKpiMetrics(startup, evaluation)).toMatchObject({
      arr: "—",
      growthRate: "—",
      grossMargin: "—",
    });
  });
});
