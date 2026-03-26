import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";

export interface KpiMetrics {
  arr: string;
  growthRate: string;
  grossMargin: string;
  marketStructure: string;
  tam: string;
  marketGrowth: string;
  productStage: string;
  founderMarketFit: string;
}

// ---------------------------------------------------------------------------
// Safe extraction helpers
// ---------------------------------------------------------------------------

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeStr(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function safeNum(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Extract short numeric value from verbose AI text. */
function extractShortValue(raw: string | undefined): string {
  if (!raw || raw === "—") return "—";
  if (raw.length <= 30) return raw;
  const moneyRange = raw.match(
    /~?(\$\s?\d+(?:[.,]\d+)?\s?(?:[kmbt]|bn|million|billion|trillion))\s*[-–—]\s*~?(\$\s?\d+(?:[.,]\d+)?\s?(?:[kmbt]|bn|million|billion|trillion))/i,
  );
  if (moneyRange) return `${moneyRange[1].trim()} – ${moneyRange[2].trim()}`;
  const singleMoney = raw.match(
    /~?\$\s?\d+(?:[.,]\d+)?\s?(?:[kmbt]|bn|million|billion|trillion)/i,
  );
  if (singleMoney) return singleMoney[0].replace(/\s+/g, "");
  const pctRange = raw.match(
    /~?(\d+(?:\.\d+)?%)\s*[-–—]\s*~?(\d+(?:\.\d+)?%)/,
  );
  if (pctRange) return `${pctRange[1]} – ${pctRange[2]}`;
  const singlePct = raw.match(/~?\d+(?:\.\d+)?%/);
  if (singlePct) return singlePct[0];
  return raw.slice(0, 25) + "…";
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const STAGE_DISPLAY: Record<string, string> = {
  idea: "Idea",
  mvp: "MVP",
  beta: "Beta",
  scaling: "Scaling",
  mature: "Production",
  production: "Production",
};

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function formatIndustry(
  industry: string | null | undefined,
): string {
  if (!industry) return "N/A";
  return titleCase(industry);
}

export function formatValuationLabel(
  type: string | null | undefined,
): string {
  if (!type) return "";
  if (type === "pre_money") return "(Pre-money)";
  if (type === "post_money") return "(Post-money)";
  return "";
}

// ---------------------------------------------------------------------------
// KPI extraction
// ---------------------------------------------------------------------------

export function extractKpiMetrics(
  startup: Startup,
  evaluation: Evaluation | null | undefined,
): KpiMetrics {
  const DASH = "—";

  if (!evaluation) {
    return {
      arr: DASH,
      growthRate: DASH,
      grossMargin: DASH,
      marketStructure: DASH,
      tam: DASH,
      marketGrowth: DASH,
      productStage: startup.technologyReadinessLevel
        ? (STAGE_DISPLAY[startup.technologyReadinessLevel] ?? titleCase(startup.technologyReadinessLevel))
        : DASH,
      founderMarketFit: DASH,
    };
  }

  const financials = rec(evaluation.financialsData);
  const keyMetrics = rec(financials.keyMetrics);
  const market = rec(evaluation.marketData);
  const marketSizing = rec(market.marketSizing);
  const tam = rec(marketSizing.tam);
  const growthAndTiming = rec(market.marketGrowthAndTiming);
  const growthRate = rec(growthAndTiming.growthRate);
  const marketStructure = rec(market.marketStructure);
  const product = rec(evaluation.productData);
  const productSummary = rec(product.productSummary);
  const productOverview = rec(product.productOverview);
  const team = rec(evaluation.teamData);
  const fmf = rec(team.founderMarketFit);

  // ARR
  const arrRaw = safeStr(keyMetrics.arr) ?? safeStr(keyMetrics.annualRecurringRevenue);
  const arrNum = safeNum(keyMetrics.arr) ?? safeNum(keyMetrics.annualRecurringRevenue);
  let arr = DASH;
  if (arrRaw) {
    arr = extractShortValue(arrRaw);
  } else if (arrNum !== undefined) {
    arr = arrNum >= 1_000_000
      ? `$${(arrNum / 1_000_000).toFixed(1)}M`
      : arrNum >= 1_000
        ? `$${Math.round(arrNum / 1_000)}K`
        : `$${arrNum}`;
  }

  // Growth Rate
  const cagrStr = safeStr(growthRate.cagr);
  const period = safeStr(growthRate.period);
  let growthRateVal = DASH;
  if (cagrStr) {
    growthRateVal = cagrStr.includes("%") ? cagrStr : `${cagrStr}%`;
    if (period) growthRateVal += ` ${period}`;
  }

  // Gross Margin
  const marginRaw = safeStr(keyMetrics.grossMargin);
  const marginNum = safeNum(keyMetrics.grossMargin);
  let grossMargin = DASH;
  if (marginRaw) {
    grossMargin = marginRaw.includes("%") ? marginRaw : `${marginRaw}%`;
  } else if (marginNum !== undefined) {
    grossMargin = `${Math.round(marginNum)}%`;
  }

  // Market Structure
  const structureType = safeStr(marketStructure.structureType);
  const mktStructure = structureType ? titleCase(structureType) : DASH;

  // TAM
  const tamValue = safeStr(tam.value);
  const tamDisplay = tamValue ? extractShortValue(tamValue) : DASH;

  // Market Growth (reuse cagr)
  let marketGrowth = DASH;
  if (cagrStr) {
    marketGrowth = cagrStr.includes("%") ? `${cagrStr} CAGR` : `${cagrStr}% CAGR`;
  }

  // Product Stage
  const techStage =
    safeStr(productSummary.techStage) ??
    safeStr(productOverview.techStage) ??
    safeStr(product.technologyStage);
  const productStageVal = techStage
    ? (STAGE_DISPLAY[techStage.toLowerCase()] ?? titleCase(techStage))
    : startup.technologyReadinessLevel
      ? (STAGE_DISPLAY[startup.technologyReadinessLevel] ?? titleCase(startup.technologyReadinessLevel))
      : DASH;

  // Founder-Market Fit
  const fmfScore = safeNum(fmf.score);
  const founderMarketFit =
    fmfScore !== undefined ? `${Math.round(fmfScore)}%` : DASH;

  return {
    arr,
    growthRate: growthRateVal,
    grossMargin,
    marketStructure: mktStructure,
    tam: tamDisplay,
    marketGrowth,
    productStage: productStageVal,
    founderMarketFit,
  };
}
