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

  // --- Deck structured data (highest priority for KPIs) ---
  const deck = rec(evaluation.deckData);
  const deckFinancials = rec(deck.financials);
  const deckMarket = rec(deck.market);

  // --- Evaluation data (fallback) ---
  const financials = rec(evaluation.financialsData);
  const charts = rec(financials.charts);
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

  // --- ARR: structured KPI → deck string → chart data → legacy keyMetrics ---
  const arrKpi = rec(deckFinancials.arrKpi);
  const arrKpiValue = safeStr(arrKpi.value);
  const deckArr = safeStr(deckFinancials.arr);
  const revenueProjection = Array.isArray(charts.revenueProjection)
    ? charts.revenueProjection as Array<{ period?: string; revenue?: number }>
    : [];
  const latestRevenue = revenueProjection.length > 0
    ? safeNum(revenueProjection[0].revenue)
    : undefined;
  const arrRaw = safeStr(keyMetrics.arr) ?? safeStr(keyMetrics.annualRecurringRevenue);
  let arr = DASH;
  if (arrKpiValue && arrKpiValue !== "Unknown") {
    const currency = safeStr(arrKpi.currency) ?? "USD";
    const prefix = currency === "USD" ? "$" : `${currency} `;
    const val = extractShortValue(arrKpiValue).replace(/^\$/, "");
    const period = safeStr(arrKpi.period);
    const suffix = period && period !== "current" ? ` (${period})` : "";
    arr = `${prefix}${val}${suffix}`;
  } else if (deckArr && deckArr !== "Unknown") {
    arr = extractShortValue(deckArr);
  } else if (latestRevenue !== undefined && latestRevenue > 0) {
    arr = latestRevenue >= 1_000_000
      ? `$${(latestRevenue / 1_000_000).toFixed(1)}M`
      : latestRevenue >= 1_000
        ? `$${Math.round(latestRevenue / 1_000)}K`
        : `$${latestRevenue}`;
  } else if (arrRaw && arrRaw !== "Unknown") {
    arr = extractShortValue(arrRaw);
  }

  // --- Growth Rate: structured KPI → deck string → deckClaimed → researched CAGR ---
  const growthRateKpi = rec(deckFinancials.growthRateKpi);
  const grKpiValue = safeStr(growthRateKpi.value);
  const deckGrowth = safeStr(deckFinancials.growthRate);
  const deckGrowthPeriod = safeStr(deckFinancials.growthRatePeriod);
  const deckClaimed = safeStr(growthRate.deckClaimed);
  const deckClaimedPeriod = safeStr(growthRate.deckClaimedPeriod);
  const cagrStr = safeStr(growthRate.cagr);
  const growthPeriod = safeStr(growthRate.period);
  let growthRateVal = DASH;
  if (grKpiValue && grKpiValue !== "Unknown") {
    const basis = safeStr(growthRateKpi.basis);
    const period = safeStr(growthRateKpi.period);
    const basisLabel = basis && basis !== "unknown" ? ` ${basis}` : "";
    const periodLabel = period && period !== "current" ? ` · ${period}` : "";
    growthRateVal = `${extractShortValue(grKpiValue)}${basisLabel}${periodLabel}`;
  } else if (deckGrowth && deckGrowth !== "Unknown") {
    const shortVal = extractShortValue(deckGrowth);
    const period = deckGrowthPeriod && deckGrowthPeriod !== "Unknown" ? deckGrowthPeriod : null;
    growthRateVal = period && !shortVal.toLowerCase().includes(period.toLowerCase())
      ? `${shortVal} ${period}`
      : shortVal;
  } else if (deckClaimed && deckClaimed !== "Unknown") {
    const shortVal = extractShortValue(deckClaimed);
    const period = deckClaimedPeriod && deckClaimedPeriod !== "Unknown" ? deckClaimedPeriod : null;
    growthRateVal = period && !shortVal.toLowerCase().includes(period.toLowerCase())
      ? `${shortVal} ${period}`
      : shortVal;
  } else if (cagrStr && cagrStr !== "Unknown") {
    const cagrDisplay = extractShortValue(cagrStr);
    growthRateVal = growthPeriod && growthPeriod !== "Unknown"
      ? `${cagrDisplay} ${growthPeriod}`
      : cagrDisplay;
  }

  // --- Gross Margin: structured KPI → deck string → chart data → legacy keyMetrics ---
  const grossMarginKpi = rec(deckFinancials.grossMarginKpi);
  const gmKpiValue = safeStr(grossMarginKpi.value);
  const deckGrossMargin = safeStr(deckFinancials.grossMargin);
  const marginProgression = Array.isArray(charts.marginProgression)
    ? charts.marginProgression as Array<{ period?: string; grossMargin?: number }>
    : [];
  const latestMargin = marginProgression.length > 0
    ? safeNum(marginProgression[0].grossMargin)
    : undefined;
  const grossMarginRaw = safeStr(keyMetrics.grossMargin);
  let grossMargin = DASH;
  if (gmKpiValue && gmKpiValue !== "Unknown") {
    const val = gmKpiValue.includes("%") ? gmKpiValue : `${gmKpiValue}%`;
    const period = safeStr(grossMarginKpi.period);
    const suffix = period && period !== "current" ? ` (${period})` : "";
    grossMargin = `${val}${suffix}`;
  } else if (deckGrossMargin && deckGrossMargin !== "Unknown") {
    grossMargin = deckGrossMargin.includes("%") ? deckGrossMargin : `${deckGrossMargin}%`;
  } else if (latestMargin !== undefined && latestMargin > 0) {
    grossMargin = `${Math.round(latestMargin)}%`;
  } else if (grossMarginRaw && grossMarginRaw !== "Unknown") {
    grossMargin = grossMarginRaw.includes("%") ? grossMarginRaw : `${grossMarginRaw}%`;
  }

  // Market Structure
  const structureType = safeStr(marketStructure.structureType);
  const mktStructure = structureType ? titleCase(structureType) : DASH;

  // --- TAM: structured KPI → deck string → evaluation ---
  const tamKpi = rec(deckMarket.tamKpi);
  const tamKpiValue = safeStr(tamKpi.value);
  const deckTam = safeStr(deckMarket.tam);
  const tamValue = safeStr(tam.value);
  let tamDisplay: string;
  if (tamKpiValue && tamKpiValue !== "Unknown") {
    const currency = safeStr(tamKpi.currency) ?? "USD";
    const prefix = currency === "USD" ? "$" : `${currency} `;
    const val = extractShortValue(tamKpiValue).replace(/^\$/, "");
    const scale = safeStr(tamKpi.scale);
    tamDisplay = `${prefix}${val}${scale && !val.includes(scale) ? scale : ""}`;
  } else {
    tamDisplay = deckTam
      ? extractShortValue(deckTam)
      : tamValue ? extractShortValue(tamValue) : DASH;
  }

  // --- Market Growth: deck first → researched CAGR ---
  const deckMarketGrowth = safeStr(deckMarket.marketGrowthRate);
  let marketGrowth = DASH;
  if (deckMarketGrowth && deckMarketGrowth !== "Unknown") {
    const val = extractShortValue(deckMarketGrowth);
    marketGrowth = val.includes("CAGR") ? val : `${val} CAGR`;
  } else if (cagrStr && cagrStr !== "Unknown") {
    const cagrVal = extractShortValue(cagrStr);
    marketGrowth = cagrVal.includes("CAGR") ? cagrVal : `${cagrVal} CAGR`;
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
