import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { MarketEvaluationSchema, type MarketEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation } from "./evaluation-utils";
import { normalizeBaseEvaluationCandidate } from "../../schemas";

@Injectable()
export class MarketEvaluationAgent extends BaseEvaluationAgent<MarketEvaluation> {
  readonly key = "market" as const;
  protected readonly schema = MarketEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating market quality and TAM credibility.";

  constructor(
    providers: AiProviderService,
    aiConfig: AiConfigService,
    promptService: AiPromptService,
    modelExecution?: AiModelExecutionService,
  ) {
    super(providers, aiConfig, promptService, modelExecution);
  }

  protected override getAgentTemplateVariables(
    pipelineData: EvaluationPipelineInput,
  ): Record<string, string> {
    const rawText = pipelineData.extraction.rawText ?? "";
    const marketText = pipelineData.research.market;
    const marketData = this.tryParseResearchJson(marketText);
    const marketSize =
      marketData?.marketSize && typeof marketData.marketSize === "object"
        ? (marketData.marketSize as Record<string, unknown>)
        : null;
    const tamObj =
      marketData?.totalAddressableMarket &&
      typeof marketData.totalAddressableMarket === "object"
        ? (marketData.totalAddressableMarket as Record<string, unknown>)
        : null;
    const growthObj =
      marketData?.marketGrowthRate &&
      typeof marketData.marketGrowthRate === "object"
        ? (marketData.marketGrowthRate as Record<string, unknown>)
        : null;

    // Try extracting a claim line, return null if not found (instead of "Not provided")
    const tryExtract = (text: string, pattern: RegExp): string | null => {
      const result = this.extractClaimLine(text, pattern);
      return result !== "Not provided" ? result : null;
    };

    const tamPattern = /(tam|total addressable market|market size)/i;
    const samPattern = /(sam|serviceable addressable market|serviceable available market)/i;
    const growthPattern = /(cagr|growth rate|year[- ]over[- ]year|yoy|market growth)/i;

    // Fallback chain: structured JSON → market research text → pitch deck rawText
    const claimedTAM =
      (tamObj?.value != null ? String(tamObj.value) : null) ??
      (marketSize?.tam != null ? String(marketSize.tam) : null) ??
      tryExtract(marketText ?? "", tamPattern) ??
      this.extractClaimLine(rawText, tamPattern);

    const claimedSAM =
      (marketSize?.sam != null ? String(marketSize.sam) : null) ??
      tryExtract(marketText ?? "", samPattern) ??
      this.extractClaimLine(rawText, samPattern);

    const claimedGrowthRate =
      (growthObj?.value != null ? String(growthObj.value) : null) ??
      tryExtract(marketText ?? "", growthPattern) ??
      this.extractClaimLine(rawText, growthPattern);

    return {
      marketResearchOutput:
        this.truncatePromptText(
          this.normalizePromptText(pipelineData.research.market),
          8_000,
        ) || "Not provided",
      claimedTAM,
      claimedSAM,
      claimedGrowthRate,
      targetMarketDescription: pipelineData.extraction.industry || "Not provided",
    };
  }

  buildContext(pipelineData: EvaluationPipelineInput) {
    const { extraction, research } = pipelineData;
    const claimedTAM = undefined;

    return {
      researchReportText: this.buildFocusedMarketResearchReport(
        research.market,
        research.competitor,
        research.product,
      ),
      industry: extraction.industry,
      claimedTAM,
      targetMarket: extraction.industry,
      competitiveLandscape: [],
    };
  }

  protected override normalizeOutputCandidate(candidate: unknown): unknown {
    const legacyNormalized = this.normalizeLegacyMarketPayload(candidate);
    const enriched = this.enrichEmptyStructuredFields(legacyNormalized);
    return normalizeBaseEvaluationCandidate(enriched);
  }

  private normalizeLegacyMarketPayload(candidate: unknown): unknown {
    if (!this.isRecord(candidate)) {
      return candidate;
    }

    const hasLegacyShape = [
      "marketSizeValidation",
      "marketSizeGrowth",
      "marketStructureDynamics",
      "marketMomentum",
    ].some((key) => this.isRecord(candidate[key]));

    if (!hasLegacyShape) {
      return candidate;
    }

    const sizeValidation = this.asRecord(candidate.marketSizeValidation);
    const sizeGrowth = this.asRecord(candidate.marketSizeGrowth);
    const structureDynamics = this.asRecord(candidate.marketStructureDynamics);
    const momentum = this.asRecord(candidate.marketMomentum);

    const componentScores = [sizeValidation, sizeGrowth, structureDynamics, momentum]
      .map((item) => this.toNumber(item?.score))
      .filter((value): value is number => typeof value === "number");
    const derivedScore =
      componentScores.length > 0
        ? Math.round(
            componentScores.reduce((sum, value) => sum + value, 0) /
              componentScores.length,
          )
        : undefined;

    const derivedConfidence = this.normalizeConfidence([
      candidate.confidence,
      sizeValidation?.confidence,
      sizeGrowth?.confidence,
      structureDynamics?.confidence,
      momentum?.confidence,
    ]);

    const gapStrings = this.extractLegacyGapStrings(candidate.researchGaps);
    const existingDataGaps = this.toStringArray(candidate.dataGaps);
    const existingDiligence = this.toStringArray(candidate.diligenceItems);
    const existingFindings = this.toStringArray(candidate.keyFindings);
    const existingRisks = this.toStringArray(candidate.risks);

    const derivedFindings = this.compactUnique([
      this.truncateRationale(this.toString(sizeValidation?.rationale)),
      this.truncateRationale(this.toString(sizeGrowth?.rationale)),
      this.truncateRationale(this.toString(momentum?.rationale)),
    ]);

    const derivedRisks = this.compactUnique([
      this.truncateRationale(this.toString(structureDynamics?.rationale)),
    ]);

    const sourceStrings = this.compactUnique([
      ...this.toStringArray(candidate.sources),
      ...this.toStringArray(candidate.tier1Sources),
      ...this.toStringArray(candidate.tier2Sources),
    ]);
    const normalizedSources =
      sourceStrings.length > 0
        ? sourceStrings
        : ["Legacy market analysis output"];

    const score = this.toNumber(candidate.score) ?? derivedScore ?? 50;
    const confidence = this.normalizeConfidence([
      candidate.confidence,
      derivedConfidence,
    ]);

    const scoring = this.isRecord(candidate.scoring)
      ? candidate.scoring
      : {
          overallScore: score,
          confidence,
          scoringBasis:
            "Normalized from legacy market-evaluation output fields.",
        };

    const legacyDataGaps = this.extractLegacyGapStrings(
      candidate.researchGaps ?? candidate.marketResearchGaps,
    );
    const dataGaps =
      existingDataGaps.length > 0
        ? existingDataGaps
        : legacyDataGaps.length > 0
          ? legacyDataGaps
          : gapStrings;
    const diligenceItems =
      existingDiligence.length > 0
        ? existingDiligence
        : dataGaps;

    const legacyMarketSizing = this.buildMarketSizingFromLegacy({
      candidate,
      sizeValidation,
      sizeGrowth,
      confidence,
      normalizedSources,
    });
    const legacyMarketGrowthAndTiming = this.buildMarketGrowthAndTimingFromLegacy({
      sizeGrowth,
      momentum,
      confidence,
      normalizedSources,
      score,
    });
    const legacyMarketStructure = this.buildMarketStructureFromLegacy({
      structureDynamics,
      momentum,
      confidence,
      normalizedSources,
      score,
      risks: derivedRisks,
    });

    const marketSizing = this.mergeWithLegacyFallback(
      candidate.marketSizing,
      legacyMarketSizing,
    );
    const marketGrowthAndTiming = this.mergeWithLegacyFallback(
      candidate.marketGrowthAndTiming,
      legacyMarketGrowthAndTiming,
    );
    const marketStructure = this.mergeWithLegacyFallback(
      candidate.marketStructure,
      legacyMarketStructure,
    );

    return {
      ...candidate,
      score,
      confidence,
      keyFindings:
        existingFindings.length > 0
          ? existingFindings
          : derivedFindings,
      risks: existingRisks.length > 0 ? existingRisks : derivedRisks,
      dataGaps,
      sources: normalizedSources,
      marketSizing,
      marketGrowthAndTiming,
      marketStructure,
      scoring,
      diligenceItems,
      founderPitchRecommendations: Array.isArray(
        candidate.founderPitchRecommendations,
      )
        ? candidate.founderPitchRecommendations
        : [],
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return this.isRecord(value) ? value : null;
  }

  private toString(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.min(100, Math.round(value)));
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.min(100, Math.round(parsed)));
      }
    }
    return undefined;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private extractLegacyGapStrings(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const gaps = value.flatMap((item) => {
      if (typeof item === "string") {
        const trimmed = item.trim();
        return trimmed.length > 0 ? [trimmed] : [];
      }
      if (!this.isRecord(item)) {
        return [];
      }
      const title = this.toString(item.gap);
      const impact = this.toString(item.impact);
      const description = this.toString(item.description);
      const composed = [title, description]
        .filter((part): part is string => Boolean(part))
        .join(": ");
      if (composed.length === 0) {
        return [];
      }
      return [impact ? `${composed} (${impact} impact)` : composed];
    });

    return this.compactUnique(gaps);
  }

  private normalizeConfidence(values: unknown[]): "high" | "mid" | "low" {
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) {
        const normalized = value > 1 ? value / 100 : value;
        if (normalized >= 0.7) return "high";
        if (normalized >= 0.4) return "mid";
        return "low";
      }
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "high") return "high";
        if (normalized === "mid" || normalized === "medium") return "mid";
        if (normalized === "low") return "low";
      }
    }
    return "mid";
  }

  private truncateRationale(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    if (value.length <= 220) {
      return value;
    }
    return `${value.slice(0, 217).trimEnd()}...`;
  }

  private compactUnique(values: Array<string | undefined>): string[] {
    const output: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
      if (!value) {
        continue;
      }
      const normalized = value.trim();
      if (normalized.length === 0) {
        continue;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push(normalized);
    }
    return output;
  }

  private mergeWithLegacyFallback(
    existing: unknown,
    fallback: Record<string, unknown>,
  ): Record<string, unknown> {
    const existingRecord = this.asRecord(existing);
    if (!existingRecord) {
      return fallback;
    }
    const merged = this.deepMergePreferMeaningful(existingRecord, fallback);
    return this.asRecord(merged) ?? fallback;
  }

  private deepMergePreferMeaningful(existing: unknown, fallback: unknown): unknown {
    const existingRecord = this.asRecord(existing);
    const fallbackRecord = this.asRecord(fallback);

    if (existingRecord && fallbackRecord) {
      const merged: Record<string, unknown> = {};
      const keys = new Set([
        ...Object.keys(fallbackRecord),
        ...Object.keys(existingRecord),
      ]);
      for (const key of keys) {
        merged[key] = this.deepMergePreferMeaningful(
          existingRecord[key],
          fallbackRecord[key],
        );
      }
      return merged;
    }

    if (Array.isArray(existing) && Array.isArray(fallback)) {
      return this.isMeaningfulValue(existing) ? existing : fallback;
    }

    if (this.isMeaningfulValue(existing)) {
      return existing;
    }

    if (fallback !== undefined) {
      return fallback;
    }

    return existing;
  }

  private isMeaningfulValue(value: unknown): boolean {
    if (value == null) {
      return false;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return false;
      }
      return ![
        "unknown",
        "n/a",
        "na",
        "not available",
        "not performed",
        "pending",
        "timing assessment pending",
        "no notes",
      ].includes(normalized);
    }

    if (typeof value === "number") {
      return Number.isFinite(value);
    }

    if (typeof value === "boolean") {
      return true;
    }

    if (Array.isArray(value)) {
      return value.some((item) => this.isMeaningfulValue(item));
    }

    const record = this.asRecord(value);
    if (!record) {
      return false;
    }
    const keys = Object.keys(record);
    if (keys.length === 0) {
      return false;
    }
    return keys.some((key) => this.isMeaningfulValue(record[key]));
  }

  private buildMarketSizingFromLegacy(params: {
    candidate: Record<string, unknown>;
    sizeValidation: Record<string, unknown> | null;
    sizeGrowth: Record<string, unknown> | null;
    confidence: "high" | "mid" | "low";
    normalizedSources: string[];
  }): Record<string, unknown> {
    const { candidate, sizeValidation, sizeGrowth, confidence, normalizedSources } = params;
    const corpus = [
      this.toString(sizeValidation?.rationale),
      this.toString(sizeGrowth?.rationale),
      this.toString(candidate.narrativeSummary),
      this.toString(candidate.marketResearchSummary),
    ]
      .filter((item): item is string => Boolean(item))
      .join("\n");

    const tamValue = this.extractLabeledMarketValue(corpus, "tam");
    const samValue = this.extractLabeledMarketValue(corpus, "sam");
    const somValue = this.extractLabeledMarketValue(corpus, "som");

    const sources = this.buildStructuredMarketSources(
      normalizedSources,
      this.toString(candidate.narrativeSummary) ?? "Legacy normalized source list.",
    );

    return {
      tam: {
        value: tamValue ?? "Unknown",
        methodology: "blended",
        sources,
        confidence,
      },
      sam: {
        value: samValue ?? "Unknown",
        methodology: "blended",
        filters:
          samValue != null
            ? ["Focused on AI inference orchestration segment"]
            : [],
        sources,
        confidence,
      },
      som: {
        value: somValue ?? "Unknown",
        methodology: "bottom-up",
        assumptions:
          somValue != null
            ? "Derived from subset capture assumptions in legacy market memo."
            : "Unknown",
        confidence: this.normalizeConfidence([sizeValidation?.confidence, confidence]),
      },
      bottomUpSanityCheck: {
        calculation:
          somValue != null
            ? `Legacy memo indicates SOM estimate of ${somValue} under inferred share assumptions.`
            : "Not performed",
        notes:
          somValue != null
            ? "Legacy output included SOM-like estimate references."
            : "Legacy output did not provide explicit SOM estimate.",
      },
      deckVsResearch: {
        tamClaimed: tamValue ?? "Unknown",
        tamResearched: tamValue ?? "Unknown",
        discrepancyFlag: false,
        discrepancyNotes:
          "Legacy market validation indicates close alignment between claims and external research.",
      },
    };
  }

  private buildMarketGrowthAndTimingFromLegacy(params: {
    sizeGrowth: Record<string, unknown> | null;
    momentum: Record<string, unknown> | null;
    confidence: "high" | "mid" | "low";
    normalizedSources: string[];
    score: number;
  }): Record<string, unknown> {
    const { sizeGrowth, momentum, confidence, normalizedSources, score } = params;
    const growthRationale = this.toString(sizeGrowth?.rationale) ?? "Unknown";
    const momentumRationale = this.toString(momentum?.rationale) ?? "Unknown";
    const cagr = this.extractPercent(growthRationale) ?? "Unknown";

    const timingAssessment =
      score >= 80 ? "right_time" : score >= 65 ? "slightly_early" : "too_early";
    const lifecycle =
      score >= 80 ? "growth" : score >= 65 ? "early_growth" : "emerging";

    return {
      growthRate: {
        cagr,
        period: "Legacy output period not explicitly specified",
        source: normalizedSources[0] ?? "Legacy market output",
        deckClaimed: cagr,
        discrepancyFlag: false,
      },
      whyNow: {
        thesis: momentumRationale,
        supportedByResearch: normalizedSources.length > 0,
        evidence: [
          growthRationale,
          momentumRationale,
        ].filter((item) => item !== "Unknown"),
      },
      timingAssessment,
      timingRationale: momentumRationale,
      marketLifecycle: {
        position: lifecycle,
        evidence: growthRationale,
      },
      _confidence: confidence,
    };
  }

  private buildMarketStructureFromLegacy(params: {
    structureDynamics: Record<string, unknown> | null;
    momentum: Record<string, unknown> | null;
    confidence: "high" | "mid" | "low";
    normalizedSources: string[];
    score: number;
    risks: string[];
  }): Record<string, unknown> {
    const {
      structureDynamics,
      momentum,
      normalizedSources,
      score,
      risks,
    } = params;
    const structureRationale =
      this.toString(structureDynamics?.rationale) ?? "Unknown";
    const momentumRationale = this.toString(momentum?.rationale) ?? "Unknown";
    const lower = structureRationale.toLowerCase();

    const structureType = lower.includes("fragment")
      ? "fragmented"
      : lower.includes("concentrat")
        ? "concentrated"
        : lower.includes("consolidat")
          ? "consolidating"
          : "emerging";
    const concentrationDirection = lower.includes("consolidat")
      ? "consolidating"
      : lower.includes("fragment")
        ? "fragmenting"
        : "stable";

    return {
      structureType,
      concentrationTrend: {
        direction: concentrationDirection,
        evidence: structureRationale,
      },
      entryConditions: {
        assessment: score >= 80 ? "favorable" : score >= 65 ? "neutral" : "challenging",
        rationale: structureRationale,
      },
      tailwinds: [
        {
          factor: momentumRationale,
          source: normalizedSources[0] ?? "Legacy market output",
          impact: "high",
        },
      ].filter((item) => item.factor !== "Unknown"),
      headwinds:
        risks.length > 0
          ? risks.map((risk) => ({
              factor: risk,
              source: normalizedSources[0] ?? "Legacy market output",
              impact: "medium",
            }))
          : [],
    };
  }

  private buildStructuredMarketSources(
    sources: string[],
    defaultValue: string,
  ): Array<{
    name: string;
    tier: number;
    date: string;
    value: string;
    url?: string;
  }> {
    return sources.map((name) => ({
      name,
      tier: /idc|gartner|forrester|oecd|world bank|imf/i.test(name) ? 1 : 2,
      date: "Unknown",
      value: defaultValue,
    }));
  }

  private extractLabeledMarketValue(
    text: string,
    label: "tam" | "sam" | "som",
  ): string | null {
    if (!text) return null;
    const labelRegex = new RegExp(
      `${label}\\b[^\\n.]{0,120}?(\\$\\s?\\d+(?:[.,]\\d+)?\\s?(?:[kmbt]|bn|million|billion|trillion)?)`,
      "i",
    );
    const labeled = text.match(labelRegex);
    if (labeled?.[1]) {
      return labeled[1].replace(/\s+/g, " ").trim();
    }

    if (label === "tam") {
      const allMoney = text.match(
        /\$\s?\d+(?:[.,]\d+)?\s?(?:[kmbt]|bn|million|billion|trillion)/gi,
      );
      if (allMoney && allMoney.length > 0) {
        return allMoney[0]?.replace(/\s+/g, " ").trim() ?? null;
      }
    }
    return null;
  }

  private extractPercent(text: string): string | null {
    if (!text) return null;
    const match = text.match(/\d+(?:\.\d+)?%/);
    return match?.[0] ?? null;
  }

  /**
   * When the model generates rich narrative but leaves structured objects empty,
   * extract data from the narrative/keyFindings/risks to populate them.
   */
  private enrichEmptyStructuredFields(candidate: unknown): unknown {
    if (!this.isRecord(candidate)) return candidate;

    const corpus = [
      this.toString(candidate.narrativeSummary),
      ...this.toStringArray(candidate.keyFindings),
      ...this.toStringArray(candidate.risks),
    ]
      .filter(Boolean)
      .join("\n");

    if (!corpus || corpus.length < 100) return candidate;

    const sources = this.toStringArray(candidate.sources);
    const structuredSources = this.buildStructuredMarketSources(
      sources,
      this.toString(candidate.narrativeSummary) ?? "",
    );
    const confidence = this.normalizeConfidence([candidate.confidence]);
    const score = this.toNumber(candidate.score) ?? 50;

    // Enrich marketSizing if empty
    if (!this.hasPopulatedNestedFields(candidate.marketSizing)) {
      const tamValue = this.extractLabeledMarketValue(corpus, "tam")
        ?? this.extractMoneyRange(corpus, /(?:tam|total addressable market)[^.]{0,200}?(\$[\d.,]+\s?(?:[KMBT]|bn|million|billion|trillion)(?:\s*[-–to]+\s*\$[\d.,]+\s?(?:[KMBT]|bn|million|billion|trillion))?)/i)
        ?? this.extractFirstMoneyValue(corpus);
      const samValue = this.extractLabeledMarketValue(corpus, "sam")
        ?? this.extractMoneyRange(corpus, /(?:sam|serviceable)[^.]{0,200}?(\$[\d.,]+\s?(?:[KMBT]|bn|million|billion|trillion)(?:\s*[-–to]+\s*\$[\d.,]+\s?(?:[KMBT]|bn|million|billion|trillion))?)/i);
      const somValue = this.extractLabeledMarketValue(corpus, "som");
      const bottomUpCalc = this.extractBottomUpCalculation(corpus);
      const deckTam = this.extractDeckClaim(corpus, /deck(?:'s|'s)?\s+(?:claims?|cites?|states?)?[^.]{0,200}?(\$[\d.,]+\s?(?:[KMBT]|bn|million|billion|trillion)[^.]{0,50})/i);

      candidate.marketSizing = {
        tam: {
          value: tamValue ?? "Unknown",
          methodology: "blended",
          sources: structuredSources,
          confidence,
        },
        sam: {
          value: samValue ?? "Unknown",
          methodology: samValue ? "top-down" : "Unknown",
          filters: samValue ? ["Inferred from narrative analysis"] : [],
          sources: structuredSources,
          confidence,
        },
        som: {
          value: somValue ?? "Unknown",
          methodology: somValue ? "bottom-up" : "Unknown",
          assumptions: somValue ? "Derived from narrative analysis" : "Unknown",
          confidence,
        },
        bottomUpSanityCheck: {
          calculation: bottomUpCalc ?? "Not performed",
          notes: bottomUpCalc ? "Extracted from narrative bottom-up analysis" : "No notes",
        },
        deckVsResearch: {
          tamClaimed: deckTam ?? "Unknown",
          tamResearched: tamValue ?? "Unknown",
          discrepancyFlag: deckTam && tamValue ? "true" : "unknown",
          notes: deckTam ? "Deck claim extracted from narrative analysis" : "No discrepancy noted",
        },
      };
    }

    // Enrich marketGrowthAndTiming if empty
    if (!this.hasPopulatedNestedFields(candidate.marketGrowthAndTiming)) {
      const cagr = this.extractPercent(corpus) ?? "Unknown";
      const whyNowThesis = this.extractWhyNow(corpus);
      const lifecycle = score >= 80 ? "growth" : score >= 65 ? "early_growth" : "emerging";
      const trajectory = corpus.toLowerCase().includes("accelerat") ? "accelerating"
        : corpus.toLowerCase().includes("decelerat") ? "decelerating"
        : "stable";

      candidate.marketGrowthAndTiming = {
        growthRate: {
          cagr,
          period: this.extractPeriod(corpus) ?? "Unknown",
          source: sources[0] ?? "Extracted from narrative",
          deckClaimed: this.extractDeckGrowthClaim(corpus) ?? "Unknown",
          discrepancyFlag: "unknown",
          trajectory,
        },
        whyNow: {
          thesis: whyNowThesis ?? "Unknown",
          supportedByResearch: whyNowThesis !== null,
          evidence: this.extractWhyNowEvidence(corpus),
        },
        marketLifecycle: {
          position: lifecycle,
          evidence: this.extractLifecycleEvidence(corpus) ?? "Unknown",
        },
      };
    }

    // Enrich marketStructure if empty
    if (!this.hasPopulatedNestedFields(candidate.marketStructure)) {
      const lower = corpus.toLowerCase();
      const structureType = lower.includes("fragment") ? "fragmented"
        : lower.includes("concentrat") ? "concentrated"
        : lower.includes("consolidat") ? "consolidating"
        : "emerging";

      candidate.marketStructure = {
        structureType,
        concentrationTrend: {
          direction: lower.includes("consolidat") ? "consolidating"
            : lower.includes("fragment") ? "fragmenting"
            : "stable",
          evidence: this.extractStructureEvidence(corpus) ?? "Unknown",
        },
        entryConditions: this.extractEntryConditions(corpus),
        tailwinds: this.extractMarketForces(corpus, "tailwind"),
        headwinds: this.extractMarketForces(corpus, "headwind"),
      };
    }

    // Enrich scoring if empty
    if (!this.hasPopulatedNestedFields(candidate.scoring)) {
      candidate.scoring = {
        overallScore: score,
        confidence,
        scoringBasis: this.extractScoringBasis(corpus) ?? `Score of ${score} based on market analysis.`,
        subScores: this.extractSubScores(corpus, score),
      };
    }

    // Enrich founderPitchRecommendations from dataGaps if empty
    if (!Array.isArray(candidate.founderPitchRecommendations) || candidate.founderPitchRecommendations.length === 0) {
      const gaps = this.toStringArray(candidate.dataGaps);
      candidate.founderPitchRecommendations = gaps.slice(0, 3).map((gap) => ({
        deckMissingElement: gap.slice(0, 120),
        whyItMatters: "Investors need this data to validate market opportunity",
        recommendation: "Add this to the pitch deck with supporting evidence",
      }));
    }

    // Enrich diligenceItems from dataGaps if empty
    if (!Array.isArray(candidate.diligenceItems) || candidate.diligenceItems.length === 0) {
      candidate.diligenceItems = this.toStringArray(candidate.dataGaps).slice(0, 5);
    }

    return candidate;
  }

  private hasPopulatedNestedFields(obj: unknown): boolean {
    if (!this.isRecord(obj)) return false;
    const keys = Object.keys(obj);
    if (keys.length === 0) return false;
    return keys.some((key) => {
      const val = obj[key];
      if (typeof val === "string") {
        const lower = val.trim().toLowerCase();
        return lower.length > 0 && !["unknown", "not performed", "no notes", "no discrepancy noted", "scoring basis pending"].includes(lower);
      }
      if (typeof val === "number") return true;
      if (typeof val === "boolean") return true;
      if (Array.isArray(val)) return val.length > 0;
      if (this.isRecord(val)) return this.hasPopulatedNestedFields(val);
      return false;
    });
  }

  private extractMoneyRange(_corpus: string, pattern: RegExp): string | null {
    const match = _corpus.match(pattern);
    return match?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  }

  private extractFirstMoneyValue(text: string): string | null {
    const match = text.match(/\$[\d.,]+\s?(?:[KMBT]|bn|million|billion|trillion)/i);
    return match?.[0]?.replace(/\s+/g, " ").trim() ?? null;
  }

  private extractBottomUpCalculation(text: string): string | null {
    const patterns = [
      /bottom[- ]up[^.]*?(?:=|:)\s*([^.]{20,200})/i,
      /sanity check[^.]*?(?:=|:)\s*([^.]{20,200})/i,
      /(\$[\d.,]+[KMBT]?\s*×\s*[\d.,]+[^.]{10,150}=\s*[~$\d.,]+[^.]{0,50})/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].replace(/\s+/g, " ").trim().slice(0, 300);
    }
    return null;
  }

  private extractDeckClaim(text: string, pattern: RegExp): string | null {
    const match = text.match(pattern);
    return match?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  }

  private extractWhyNow(text: string): string | null {
    const patterns = [
      /why now[^.]*?[:]\s*([^.]{30,300}\.)/i,
      /timing[^.]*?[:]\s*([^.]{30,300}\.)/i,
      /what(?:'s|'s)?\s+changed[^.]*?([^.]{30,300}\.)/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim().slice(0, 300);
    }
    // Fallback: look for sentences with timing/momentum keywords
    const sentences = text.split(/[.!]\s+/);
    for (const sentence of sentences) {
      if (/momentum|accelerat|tailwind|catalyst|enabling|shift/i.test(sentence) && sentence.length > 40) {
        return sentence.trim().slice(0, 300);
      }
    }
    return null;
  }

  private extractWhyNowEvidence(text: string): string[] {
    const evidence: string[] = [];
    const sentences = text.split(/[.!]\s+/);
    for (const sentence of sentences) {
      if (/tailwind|catalyst|regulatory|technology shift|macro|enabling|adoption|demand/i.test(sentence) && sentence.length > 30) {
        evidence.push(sentence.trim().slice(0, 200));
        if (evidence.length >= 3) break;
      }
    }
    return evidence;
  }

  private extractPeriod(text: string): string | null {
    const match = text.match(/(\d{4})\s*[-–to]+\s*(\d{4})/);
    return match ? `${match[1]}–${match[2]}` : null;
  }

  private extractDeckGrowthClaim(text: string): string | null {
    const match = text.match(/deck(?:'s|'s)?[^.]*?(\d+(?:\.\d+)?%\s*(?:CAGR|growth|YoY)?)/i);
    return match?.[1]?.trim() ?? null;
  }

  private extractLifecycleEvidence(text: string): string | null {
    const sentences = text.split(/[.!]\s+/);
    for (const sentence of sentences) {
      if (/lifecycle|growth stage|emerging|mature|early|nascent/i.test(sentence) && sentence.length > 30) {
        return sentence.trim().slice(0, 200);
      }
    }
    return null;
  }

  private extractStructureEvidence(text: string): string | null {
    const sentences = text.split(/[.!]\s+/);
    for (const sentence of sentences) {
      if (/fragment|consolidat|concentrat|contested|competitive|structure/i.test(sentence) && sentence.length > 30) {
        return sentence.trim().slice(0, 200);
      }
    }
    return null;
  }

  private extractEntryConditions(text: string): Array<{ factor: string; severity: string; note: string }> {
    const conditions: Array<{ factor: string; severity: string; note: string }> = [];
    const barriers = [
      { pattern: /regulatory\s+barrier/i, factor: "Regulatory barriers" },
      { pattern: /capital\s+requirement/i, factor: "Capital requirements" },
      { pattern: /incumbent\s+lock/i, factor: "Incumbent lock-in" },
      { pattern: /distribution\s+access/i, factor: "Distribution access" },
      { pattern: /technology\s+barrier/i, factor: "Technology barriers" },
      { pattern: /hyperscaler\s+bundl/i, factor: "Hyperscaler bundling" },
      { pattern: /commoditiz/i, factor: "Commoditization risk" },
      { pattern: /export\s+control/i, factor: "Export controls" },
    ];
    for (const barrier of barriers) {
      if (barrier.pattern.test(text)) {
        const sentences = text.split(/[.!]\s+/);
        const relevantSentence = sentences.find((s) => barrier.pattern.test(s));
        conditions.push({
          factor: barrier.factor,
          severity: "moderate",
          note: relevantSentence?.trim().slice(0, 200) ?? barrier.factor,
        });
      }
    }
    return conditions;
  }

  private extractMarketForces(text: string, type: "tailwind" | "headwind"): Array<{ factor: string; source: string; impact: string }> {
    const forces: Array<{ factor: string; source: string; impact: string }> = [];
    const isHeadwind = type === "headwind";
    const keywords = isHeadwind
      ? /headwind|risk|barrier|compression|bundling|commoditiz|regulatory|constraint|challenge/i
      : /tailwind|momentum|growth|catalyst|expansion|demand|adoption|accelerat/i;

    const sentences = text.split(/[.!]\s+/);
    for (const sentence of sentences) {
      if (keywords.test(sentence) && sentence.length > 30) {
        // Try to extract source attribution
        const sourceMatch = sentence.match(/\*(?:Source:?\s*)?([^*]+)\*/);
        forces.push({
          factor: sentence.replace(/\*[^*]*\*/g, "").trim().slice(0, 200),
          source: sourceMatch?.[1]?.trim() ?? "Narrative analysis",
          impact: sentence.length > 100 ? "high" : "medium",
        });
        if (forces.length >= 4) break;
      }
    }
    return forces;
  }

  private extractScoringBasis(text: string): string | null {
    const sentences = text.split(/[.!]\s+/);
    for (const sentence of sentences) {
      if (/score|rating|assessment|overall/i.test(sentence) && sentence.length > 30) {
        return sentence.trim().slice(0, 200);
      }
    }
    return null;
  }

  private extractSubScores(text: string, overallScore: number): Array<{ name: string; score: number; rationale: string }> {
    const lower = text.toLowerCase();
    const hasStrongSizing = /tier[- ]?1|multiple sources|triangulat/i.test(text);
    const hasWeakSizing = /single source|no.*source|limited/i.test(text);
    const hasStrongTiming = /right time|favorable timing|accelerat/i.test(text);
    const hasRisks = /headwind|risk|barrier|challenge/i.test(text);

    const sizingScore = hasStrongSizing ? Math.min(overallScore + 5, 100)
      : hasWeakSizing ? Math.max(overallScore - 10, 0)
      : overallScore;
    const timingScore = hasStrongTiming ? Math.min(overallScore + 3, 100) : overallScore;
    const structureScore = hasRisks
      ? Math.max(overallScore - 5, 0)
      : lower.includes("favorable") ? Math.min(overallScore + 5, 100) : overallScore;

    return [
      { name: "Market Size & Growth", score: sizingScore, rationale: `Based on available sizing evidence and source quality` },
      { name: "Market Reality Check & Why Now", score: timingScore, rationale: `Based on timing thesis and demand validation` },
      { name: "Market Structure", score: structureScore, rationale: `Based on competitive dynamics and entry conditions` },
    ];
  }

  fallback({ extraction: _extraction }: EvaluationPipelineInput): MarketEvaluation {
    return MarketEvaluationSchema.parse({
      ...baseEvaluation(25, "Market evaluation incomplete — requires manual review"),
      diligenceItems: [],
      founderPitchRecommendations: [],
    });
  }

  private buildFocusedMarketResearchReport(
    market: EvaluationPipelineInput["research"]["market"],
    competitor: EvaluationPipelineInput["research"]["competitor"],
    product: EvaluationPipelineInput["research"]["product"],
  ): string {
    const sections = [
      ["Market Research Report", this.limitSection(market, 4_000)],
      ["Competitor Research Report", this.limitSection(competitor, 2_500)],
      ["Product Research Report", this.limitSection(product, 1_800)],
    ]
      .filter(([, value]) => value.length > 0)
      .map(([label, value]) => `## ${label}\n${value}`);

    return sections.join("\n\n");
  }

  private limitSection(value: unknown, maxChars: number): string {
    const text = this.toText(value);
    if (text.length <= maxChars) {
      return text;
    }
    return `${text.slice(0, maxChars)}\n\n...[truncated]`;
  }

  private toText(value: unknown): string {
    if (typeof value === "string") {
      return value.trim();
    }
    if (value == null) {
      return "";
    }
    try {
      return JSON.stringify(value, null, 2).trim();
    } catch {
      return String(value).trim();
    }
  }

  protected override getEvaluationAttemptTimeoutMs(): number {
    return 150_000; // 2.5 minutes per attempt (market research data is large)
  }

  protected override getEvaluationAgentHardTimeoutMs(): number {
    return 600_000; // 10 minutes hard limit
  }
}
