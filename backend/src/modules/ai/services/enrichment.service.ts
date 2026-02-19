import { Injectable, Logger } from "@nestjs/common";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { DrizzleService } from "../../../database";
import { startup } from "../../startup/entities";
import type { EvaluationFallbackReason } from "../interfaces/agent.interface";
import type { EnrichmentResult } from "../interfaces/phase-results.interface";
import { ModelPurpose, PipelinePhase } from "../interfaces/pipeline.interface";
import type { PhaseProgressCallback } from "../interfaces/progress-callback.interface";
import {
  ENRICHMENT_GAP_ANALYSIS_SYSTEM_PROMPT,
  ENRICHMENT_GAP_ANALYSIS_USER_PROMPT_TEMPLATE,
} from "../prompts/enrichment/gap-analysis.prompt";
import { AiConfigService } from "./ai-config.service";
import { AiProviderService } from "../providers/ai-provider.service";
import { PipelineStateService } from "./pipeline-state.service";
import { BraveSearchService, type BraveSearchResponse } from "./brave-search.service";

export const ENRICHMENT_AGENT_KEY = "gap_fill_hybrid";

type EnrichmentWithoutDbWrites = Omit<EnrichmentResult, "dbFieldsUpdated">;

const TIER_1_SOURCE_DOMAINS = [
  "crunchbase.com",
  "sec.gov",
  "ycombinator.com",
];

const TIER_2_SOURCE_DOMAINS = [
  "techcrunch.com",
  "reuters.com",
  "bloomberg.com",
  "forbes.com",
  "wsj.com",
  "ft.com",
  "venturebeat.com",
  "linkedin.com",
];

const enrichmentOutputSchema = z.object({
  companyName: z.object({ value: z.string(), confidence: z.number(), source: z.string() }).optional(),
  companyDescription: z.object({ value: z.string(), confidence: z.number(), source: z.string() }).optional(),
  tagline: z.object({ value: z.string(), confidence: z.number(), source: z.string() }).optional(),
  industry: z.object({ value: z.string(), confidence: z.number(), source: z.string() }).optional(),
  stage: z.object({ value: z.string(), confidence: z.number(), source: z.string() }).optional(),
  website: z.object({ value: z.string(), confidence: z.number(), source: z.string() }).optional(),
  foundingDate: z.object({ value: z.string(), confidence: z.number(), source: z.string() }).optional(),
  headquarters: z.object({ value: z.string(), confidence: z.number(), source: z.string() }).optional(),
  discoveredFounders: z.array(z.object({
    name: z.string(),
    role: z.string().optional(),
    linkedinUrl: z.string().optional(),
    email: z.string().optional(),
    twitterUrl: z.string().optional(),
    confidence: z.number(),
  })).default([]),
  fundingHistory: z.array(z.object({
    round: z.string(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    date: z.string().optional(),
    investors: z.array(z.string()).optional(),
    source: z.string(),
  })).default([]),
  pitchDeckUrls: z.array(z.object({
    url: z.string(),
    source: z.string(),
    confidence: z.number(),
  })).default([]),
  socialProfiles: z.object({
    crunchbaseUrl: z.string().optional(),
    angelListUrl: z.string().optional(),
    twitterUrl: z.string().optional(),
    linkedinCompanyUrl: z.string().optional(),
    githubUrl: z.string().optional(),
  }).default({}),
  productSignals: z.object({
    pricing: z.string().optional(),
    customers: z.array(z.string()).optional(),
    techStack: z.array(z.string()).optional(),
    integrations: z.array(z.string()).optional(),
  }).default({}),
  tractionSignals: z.object({
    employeeCount: z.number().optional(),
    webTrafficEstimate: z.string().optional(),
    appStoreRating: z.string().optional(),
    socialFollowers: z.record(z.string(), z.number()).optional(),
  }).default({}),
  fieldsEnriched: z.array(z.string()).default([]),
  fieldsStillMissing: z.array(z.string()).default([]),
  fieldsCorrected: z.array(z.string()).default([]),
  correctionDetails: z.array(z.object({
    field: z.string(),
    oldValue: z.string(),
    newValue: z.string(),
    confidence: z.number(),
    reason: z.string(),
  })).default([]),
  sources: z.array(z.object({
    url: z.string(),
    title: z.string(),
    type: z.string(),
  })).default([]),
});

type StartupRecord = typeof startup.$inferSelect;

interface CorrectableField {
  dbColumn: keyof StartupRecord;
  enrichmentKey: string;
  label: string;
}

const CORRECTABLE_FIELDS: CorrectableField[] = [
  { dbColumn: "website", enrichmentKey: "website", label: "Website" },
  { dbColumn: "description", enrichmentKey: "companyDescription", label: "Description" },
  { dbColumn: "tagline", enrichmentKey: "tagline", label: "Tagline" },
  { dbColumn: "industry", enrichmentKey: "industry", label: "Industry" },
  { dbColumn: "location", enrichmentKey: "headquarters", label: "Location" },
];

const GAP_FILLABLE_FIELDS: Array<{ dbColumn: keyof StartupRecord; label: string }> = [
  { dbColumn: "website", label: "Website" },
  { dbColumn: "description", label: "Description" },
  { dbColumn: "tagline", label: "Tagline" },
  { dbColumn: "industry", label: "Industry" },
  { dbColumn: "location", label: "Location" },
];

interface EnrichmentSynthesisResult {
  prompt: string;
  output: EnrichmentResult;
  usedFallback: boolean;
  usedTextFallback: boolean;
  attempt: number;
  retryCount: number;
  error?: string;
  fallbackReason?: EvaluationFallbackReason;
  rawProviderError?: string;
}

interface SearchRunResult {
  formattedResults: string;
  responses: BraveSearchResponse[];
  totalResults: number;
  queriesRun: number;
}

interface GroundingSourceCarrier {
  sources?: Array<{ title?: string; url?: string }>;
  providerMetadata?: unknown;
  experimental_providerMetadata?: unknown;
  text?: string;
  output?: unknown;
}

export interface EnrichmentRunOptions {
  onAgentStart?: (agentKey: string) => void;
  onStepProgress?: PhaseProgressCallback;
  onAgentComplete?: (payload: {
    agentKey: string;
    inputPrompt?: string;
    outputText?: string;
    outputJson?: unknown;
    error?: string;
    usedFallback: boolean;
    attempt?: number;
    retryCount?: number;
    fallbackReason?: EvaluationFallbackReason;
    rawProviderError?: string;
  }) => void;
}

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    private drizzle: DrizzleService,
    private pipelineState: PipelineStateService,
    private braveSearch: BraveSearchService,
    private aiProvider: AiProviderService,
    private aiConfig: AiConfigService,
  ) {}

  async run(
    startupId: string,
    options?: EnrichmentRunOptions,
  ): Promise<EnrichmentResult> {
    this.logger.log(`[Enrichment] Starting enrichment phase for startup ${startupId}`);
    options?.onAgentStart?.(ENRICHMENT_AGENT_KEY);
    let renderedPrompt: string | undefined;

    try {
      const [record] = await this.drizzle.db
        .select()
        .from(startup)
        .where(eq(startup.id, startupId))
        .limit(1);

      if (!record) {
        throw new Error(`Startup ${startupId} not found`);
      }

      const extraction = await this.pipelineState.getPhaseResult(
        startupId,
        PipelinePhase.EXTRACTION,
      );

      options?.onStepProgress?.onStepStart("gap_analysis", {
        inputJson: {
          startupId,
          startupName: record.name,
        },
      });
      let missingFields: string[] = [];
      let suspiciousFields: string[] = [];
      try {
        missingFields = this.identifyMissingFields(record);
        suspiciousFields = this.identifySuspiciousFields(record, extraction);
        options?.onStepProgress?.onStepComplete("gap_analysis", {
          summary: {
            missing: missingFields,
            suspicious: suspiciousFields,
          },
          outputJson: {
            missing: missingFields,
            suspicious: suspiciousFields,
          },
        });
      } catch (error) {
        options?.onStepProgress?.onStepFailed(
          "gap_analysis",
          this.errorMessage(error),
          {
            outputJson: {
              error: this.errorMessage(error),
            },
          },
        );
        throw error;
      }

      this.logger.log(
        `[Enrichment] Gap analysis | missing=${missingFields.length} | suspicious=${suspiciousFields.length}`,
      );

      // Run Brave searches in parallel (if configured)
      options?.onStepProgress?.onStepStart("web_search", {
        inputJson: {
          startupName: record.name,
        },
      });
      let searchResults: SearchRunResult;
      try {
        searchResults = await this.runSearches(record);
        options?.onStepProgress?.onStepComplete("web_search", {
          summary: {
            queriesRun: searchResults.queriesRun,
            totalResults: searchResults.totalResults,
          },
          outputJson: {
            queriesRun: searchResults.queriesRun,
            totalResults: searchResults.totalResults,
            responses: searchResults.responses,
          },
        });
      } catch (error) {
        options?.onStepProgress?.onStepFailed(
          "web_search",
          this.errorMessage(error),
          {
            outputJson: {
              error: this.errorMessage(error),
            },
          },
        );
        throw error;
      }

      // Synthesize via Gemini
      options?.onStepProgress?.onStepStart("ai_synthesis", {
        inputJson: {
          missingFields,
          suspiciousFields,
          searchQueriesRun: searchResults.queriesRun,
        },
      });
      let synthesis: EnrichmentSynthesisResult;
      try {
        synthesis = await this.synthesize(
          record,
          extraction,
          missingFields,
          suspiciousFields,
          searchResults,
        );
        options?.onStepProgress?.onStepComplete("ai_synthesis", {
          summary: {
            attempt: synthesis.attempt,
            usedTextFallback: synthesis.usedTextFallback,
          },
          outputJson: synthesis.output,
          outputText: this.serializeOutput(synthesis.output),
        });
      } catch (error) {
        options?.onStepProgress?.onStepFailed(
          "ai_synthesis",
          this.errorMessage(error),
          {
            outputJson: {
              error: this.errorMessage(error),
            },
          },
        );
        throw error;
      }
      renderedPrompt = synthesis.prompt;
      const enrichmentResult = synthesis.output;

      // Apply DB writes
      options?.onStepProgress?.onStepStart("db_writes", {
        inputJson: enrichmentResult,
      });
      let dbWriteResult: { fieldsUpdated: string[]; foundersAdded: number };
      try {
        dbWriteResult = await this.applyDbWrites(record, enrichmentResult);
        options?.onStepProgress?.onStepComplete("db_writes", {
          summary: {
            fieldsUpdated: dbWriteResult.fieldsUpdated,
            foundersAdded: dbWriteResult.foundersAdded,
          },
          outputJson: dbWriteResult,
        });
      } catch (error) {
        options?.onStepProgress?.onStepFailed(
          "db_writes",
          this.errorMessage(error),
          {
            outputJson: {
              error: this.errorMessage(error),
            },
          },
        );
        throw error;
      }
      enrichmentResult.dbFieldsUpdated = dbWriteResult.fieldsUpdated;

      this.logger.log(
        `[Enrichment] Completed | enriched=${enrichmentResult.fieldsEnriched.length} | corrected=${enrichmentResult.fieldsCorrected.length} | stillMissing=${enrichmentResult.fieldsStillMissing.length} | dbUpdated=${dbWriteResult.fieldsUpdated.length}`,
      );

      options?.onAgentComplete?.({
        agentKey: ENRICHMENT_AGENT_KEY,
        inputPrompt: synthesis.prompt,
        outputText: this.serializeOutput(enrichmentResult),
        outputJson: enrichmentResult,
        error: synthesis.error,
        usedFallback: synthesis.usedFallback,
        attempt: synthesis.attempt,
        retryCount: synthesis.retryCount,
        fallbackReason: synthesis.fallbackReason,
        rawProviderError: synthesis.rawProviderError,
      });

      return enrichmentResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options?.onAgentComplete?.({
        agentKey: ENRICHMENT_AGENT_KEY,
        inputPrompt: renderedPrompt,
        error: message,
        usedFallback: false,
      });
      throw error;
    }
  }

  private identifyMissingFields(record: StartupRecord): string[] {
    const missing: string[] = [];
    if (!record.website) missing.push("website");
    if (!record.description) missing.push("description");
    if (!record.tagline) missing.push("tagline");
    if (!record.industry) missing.push("industry");
    if (!record.location) missing.push("location");
    if (!record.teamMembers?.length) missing.push("teamMembers");
    return missing;
  }

  private identifySuspiciousFields(
    record: StartupRecord,
    extraction: { website?: string; stage?: string; industry?: string } | null,
  ): string[] {
    const suspicious: string[] = [];

    if (extraction) {
      if (
        extraction.website &&
        record.website &&
        extraction.website !== record.website
      ) {
        suspicious.push(`website: extraction says "${extraction.website}" but DB has "${record.website}"`);
      }

      if (
        extraction.industry &&
        record.industry &&
        extraction.industry.toLowerCase() !== record.industry.toLowerCase()
      ) {
        suspicious.push(`industry: extraction says "${extraction.industry}" but DB has "${record.industry}"`);
      }
    }

    return suspicious;
  }

  private async runSearches(record: StartupRecord): Promise<SearchRunResult> {
    if (!this.braveSearch.isConfigured()) {
      this.logger.warn("[Enrichment] Brave Search not configured — skipping web searches");
      return {
        formattedResults: "No web search results available (Brave Search not configured).",
        responses: [],
        totalResults: 0,
        queriesRun: 0,
      };
    }

    const companyName = record.name;
    const queries = [
      { query: `${companyName} startup company profile`, options: { count: 5 } },
      { query: `${companyName} founder CEO LinkedIn site:linkedin.com OR site:crunchbase.com`, options: { count: 5 } },
      { query: `${companyName} funding round raised site:crunchbase.com OR site:techcrunch.com`, options: { count: 5 } },
      { query: `${companyName} pitch deck site:docsend.com OR site:slideshare.net`, options: { count: 3 } },
      { query: `${companyName} product pricing customers reviews`, options: { count: 5 } },
    ];

    const results: BraveSearchResponse[] = [];
    const settled = await Promise.allSettled(
      queries.map(({ query, options }) =>
        this.braveSearch.search(query, options),
      ),
    );

    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        this.logger.warn(`[Enrichment] Brave search failed: ${reason}`);
      }
    }

    const totalResults = results.reduce(
      (count, response) => count + response.results.length,
      0,
    );
    return {
      formattedResults: this.formatSearchResults(results),
      responses: results,
      totalResults,
      queriesRun: queries.length,
    };
  }

  private formatSearchResults(results: BraveSearchResponse[]): string {
    if (results.length === 0) {
      return "No web search results available.";
    }

    const sections: string[] = [];
    for (const response of results) {
      sections.push(`--- Query: "${response.query}" ---`);
      for (const result of response.results) {
        sections.push(
          `[${result.title}](${result.url})\n${result.description}`,
        );
      }
      sections.push("");
    }

    return sections.join("\n");
  }

  private async synthesize(
    record: StartupRecord,
    extraction: { rawText?: string; founderNames?: string[] } | null,
    missingFields: string[],
    suspiciousFields: string[],
    searchResults: SearchRunResult,
  ): Promise<EnrichmentSynthesisResult> {
    const teamMembersText = record.teamMembers?.length
      ? record.teamMembers.map((m) => `- ${m.name} (${m.role}) ${m.linkedinUrl || ""}`).join("\n")
      : "No team members known";

    const extractionSummary = extraction
      ? `Extracted from pitch deck: ${extraction.founderNames?.join(", ") || "no founders"}\nRaw text length: ${extraction.rawText?.length ?? 0} chars`
      : "No extraction data available";

    const prompt = ENRICHMENT_GAP_ANALYSIS_USER_PROMPT_TEMPLATE
      .replace("{{companyName}}", record.name || "Unknown")
      .replace("{{tagline}}", record.tagline || "")
      .replace("{{description}}", record.description || "")
      .replace("{{industry}}", record.industry || "")
      .replace("{{stage}}", record.stage || "")
      .replace("{{website}}", record.website || "")
      .replace("{{location}}", record.location || "")
      .replace("{{foundingDate}}", "")
      .replace("{{teamSize}}", String(record.teamSize ?? 0))
      .replace("{{fundingTarget}}", String(record.fundingTarget ?? 0))
      .replace("{{teamMembers}}", teamMembersText)
      .replace("{{extractionSummary}}", extractionSummary)
      .replace("{{missingFields}}", missingFields.join(", ") || "None")
      .replace("{{suspiciousFields}}", suspiciousFields.join("\n") || "None")
      .replace("{{searchResults}}", searchResults.formattedResults);

    const modelName = this.aiConfig.getModelForPurpose(ModelPurpose.ENRICHMENT);
    const provider = this.aiProvider.resolveModelForPurpose(
      ModelPurpose.ENRICHMENT,
    );
    const canUseGoogleSearchTool = this.isGeminiModel(modelName);
    const maxAttempts = this.getEnrichmentMaxAttempts();
    let lastError = "Unknown enrichment synthesis error";
    let lastFallbackReason: EvaluationFallbackReason = "UNHANDLED_AGENT_EXCEPTION";

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const retrying = attempt > 1;
      const attemptPrompt = retrying
        ? `${prompt}\n\nCRITICAL RETRY REQUIREMENT: Return ONLY a single valid JSON object. No prose, no markdown, no code fences, no trailing text.`
        : prompt;

      const structured = await this.tryStructuredAttempt({
        prompt: attemptPrompt,
        model: provider,
        canUseGoogleSearchTool,
      });
      const structuredError = structured.success
        ? this.tryFinalizeSynthesisCandidate({
            candidate: structured.data,
            groundedSources: structured.sources,
            record,
            missingFields,
            searchResults,
          })
        : null;
      if (structured.success) {
        if (structuredError?.success) {
          return {
            prompt,
            output: {
              ...structuredError.data,
              dbFieldsUpdated: [],
            },
            usedFallback: false,
            usedTextFallback: false,
            attempt,
            retryCount: Math.max(0, attempt - 1),
          };
        }
      }

      const textFallback = await this.tryTextAttempt({
        prompt: attemptPrompt,
        model: provider,
        canUseGoogleSearchTool,
      });
      const textError = textFallback.success
        ? this.tryFinalizeSynthesisCandidate({
            candidate: textFallback.data,
            groundedSources: textFallback.sources,
            record,
            missingFields,
            searchResults,
          })
        : null;
      if (textFallback.success) {
        if (textError?.success) {
          return {
            prompt,
            output: {
              ...textError.data,
              dbFieldsUpdated: [],
            },
            usedFallback: false,
            usedTextFallback: true,
            attempt,
            retryCount: Math.max(0, attempt - 1),
          };
        }
      }

      const attemptError = this.joinErrorMessages(
        structured.success
          ? (structuredError?.success ? "" : structuredError?.error ?? "Structured synthesis output rejected")
          : structured.error,
        textFallback.success
          ? (textError?.success ? "" : textError?.error ?? "Text synthesis output rejected")
          : textFallback.error,
      );
      lastError = attemptError;
      lastFallbackReason = this.classifyFallbackReason(attemptError);

      if (
        attempt < maxAttempts &&
        this.shouldRetryFallbackReason(lastFallbackReason)
      ) {
        const delayMs = this.getRetryDelayMs(attempt);
        this.logger.warn(
          `[Enrichment] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms: ${attemptError}`,
        );
        await this.sleep(delayMs);
        continue;
      }

      break;
    }

    this.logger.error(`[Enrichment] AI synthesis failed: ${lastError}`);
    return {
      prompt,
      output: this.buildEmptyResult(),
      usedFallback: true,
      usedTextFallback: false,
      attempt: maxAttempts,
      retryCount: Math.max(0, maxAttempts - 1),
      fallbackReason: lastFallbackReason,
      rawProviderError: this.sanitizeRawProviderError(lastError),
      error: this.fallbackMessage(lastFallbackReason),
    };
  }

  private tryFinalizeSynthesisCandidate(input: {
    candidate: EnrichmentWithoutDbWrites;
    groundedSources: Array<{ url: string; title: string; type: string }>;
    record: StartupRecord;
    missingFields: string[];
    searchResults: SearchRunResult;
  }):
    | { success: true; data: EnrichmentWithoutDbWrites }
    | { success: false; error: string } {
    const mergedSources = this.mergeSources(
      input.candidate.sources,
      input.groundedSources,
    );

    const normalized = this.normalizeEnrichmentOutput(
      {
        ...input.candidate,
        sources: mergedSources,
      },
      input.record,
      input.missingFields,
    );

    const primaryCheck = this.isSubstantiveEnrichment(
      normalized,
      input.record,
      input.searchResults,
    );
    if (primaryCheck.ok) {
      return { success: true, data: normalized };
    }

    const deterministicBackup = this.buildDeterministicBackupFromSearch(
      input.searchResults.responses,
      input.record.name,
      input.record.website ?? undefined,
    );
    const supplemented = this.normalizeEnrichmentOutput(
      this.mergeEnrichmentOutput(normalized, deterministicBackup),
      input.record,
      input.missingFields,
    );

    const supplementedCheck = this.isSubstantiveEnrichment(
      supplemented,
      input.record,
      input.searchResults,
    );
    if (supplementedCheck.ok) {
      this.logger.debug(
        `[Enrichment] Deterministic backup supplemented weak model output (results=${input.searchResults.totalResults})`,
      );
      return { success: true, data: supplemented };
    }

    return {
      success: false,
      error:
        supplementedCheck.reason ??
        primaryCheck.reason ??
        "Non-substantive enrichment output despite available web evidence",
    };
  }

  private normalizeEnrichmentOutput(
    candidate: Partial<EnrichmentWithoutDbWrites>,
    record: StartupRecord,
    missingFields: string[],
  ): EnrichmentWithoutDbWrites {
    const shaped = this.coerceEnrichmentShape(candidate);
    const normalized: EnrichmentWithoutDbWrites = {
      ...shaped,
      discoveredFounders: this.normalizeFounders(shaped.discoveredFounders),
      fundingHistory: this.normalizeFundingHistory(shaped.fundingHistory),
      pitchDeckUrls: this.normalizePitchDeckUrls(shaped.pitchDeckUrls),
      socialProfiles: this.normalizeSocialProfiles(shaped.socialProfiles),
      productSignals: this.normalizeProductSignals(shaped.productSignals),
      tractionSignals: this.normalizeTractionSignals(shaped.tractionSignals),
      correctionDetails: this.normalizeCorrectionDetails(shaped.correctionDetails),
      sources: this.mergeSources(shaped.sources, []),
      fieldsEnriched: [],
      fieldsStillMissing: [],
      fieldsCorrected: [],
    };

    const fieldsEnriched = this.computeFieldsEnriched(record, normalized);
    const fieldsCorrected = this.computeFieldsCorrected(normalized);
    const fieldsStillMissing = this.computeFieldsStillMissing(
      missingFields,
      normalized,
    );

    return {
      ...normalized,
      fieldsEnriched,
      fieldsStillMissing,
      fieldsCorrected,
    };
  }

  private coerceEnrichmentShape(
    candidate: Partial<EnrichmentWithoutDbWrites>,
  ): EnrichmentWithoutDbWrites {
    return {
      companyName: candidate.companyName,
      companyDescription: candidate.companyDescription,
      tagline: candidate.tagline,
      industry: candidate.industry,
      stage: candidate.stage,
      website: candidate.website,
      foundingDate: candidate.foundingDate,
      headquarters: candidate.headquarters,
      discoveredFounders: candidate.discoveredFounders ?? [],
      fundingHistory: candidate.fundingHistory ?? [],
      pitchDeckUrls: candidate.pitchDeckUrls ?? [],
      socialProfiles: candidate.socialProfiles ?? {},
      productSignals: candidate.productSignals ?? {},
      tractionSignals: candidate.tractionSignals ?? {},
      fieldsEnriched: candidate.fieldsEnriched ?? [],
      fieldsStillMissing: candidate.fieldsStillMissing ?? [],
      fieldsCorrected: candidate.fieldsCorrected ?? [],
      correctionDetails: candidate.correctionDetails ?? [],
      sources: candidate.sources ?? [],
    };
  }

  private computeFieldsEnriched(
    record: StartupRecord,
    enrichment: EnrichmentWithoutDbWrites,
  ): string[] {
    const enriched = new Set<string>();
    const scalarMappings: Array<{
      dbColumn: keyof StartupRecord;
      key:
        | "companyName"
        | "companyDescription"
        | "tagline"
        | "industry"
        | "stage"
        | "website"
        | "headquarters";
    }> = [
      { dbColumn: "name", key: "companyName" },
      { dbColumn: "description", key: "companyDescription" },
      { dbColumn: "tagline", key: "tagline" },
      { dbColumn: "industry", key: "industry" },
      { dbColumn: "stage", key: "stage" },
      { dbColumn: "website", key: "website" },
      { dbColumn: "location", key: "headquarters" },
    ];

    for (const mapping of scalarMappings) {
      const candidate = this.readConfidenceFieldValue(enrichment[mapping.key]);
      if (!candidate) continue;

      const current = this.readDbString(record[mapping.dbColumn]);
      if (!current || !this.valuesEquivalent(current, candidate, mapping.dbColumn === "website")) {
        enriched.add(String(mapping.dbColumn));
      }
    }

    if (enrichment.discoveredFounders.length > 0) enriched.add("teamMembers");
    if (enrichment.fundingHistory.length > 0) enriched.add("fundingHistory");
    if (enrichment.pitchDeckUrls.length > 0) enriched.add("pitchDeckUrls");
    if (Object.keys(enrichment.socialProfiles).length > 0) enriched.add("socialProfiles");
    if (Object.keys(enrichment.productSignals).length > 0) enriched.add("productSignals");
    if (Object.keys(enrichment.tractionSignals).length > 0) enriched.add("tractionSignals");

    return Array.from(enriched);
  }

  private computeFieldsCorrected(enrichment: EnrichmentWithoutDbWrites): string[] {
    const corrected = new Set<string>();
    for (const detail of enrichment.correctionDetails) {
      const normalized = detail.field.trim().toLowerCase();
      const knownField = CORRECTABLE_FIELDS.find(
        (field) =>
          field.label.toLowerCase() === normalized ||
          String(field.dbColumn).toLowerCase() === normalized,
      );
      if (knownField) {
        corrected.add(String(knownField.dbColumn));
      } else if (normalized.length > 0) {
        corrected.add(normalized);
      }
    }
    return Array.from(corrected);
  }

  private computeFieldsStillMissing(
    missingFields: string[],
    enrichment: EnrichmentWithoutDbWrites,
  ): string[] {
    const stillMissing: string[] = [];
    for (const field of missingFields) {
      if (!this.isMissingFieldFilled(field, enrichment)) {
        stillMissing.push(field);
      }
    }
    return Array.from(new Set(stillMissing));
  }

  private isMissingFieldFilled(
    field: string,
    enrichment: EnrichmentWithoutDbWrites,
  ): boolean {
    if (field === "teamMembers") {
      return enrichment.discoveredFounders.length > 0;
    }
    if (field === "description") {
      return Boolean(this.readConfidenceFieldValue(enrichment.companyDescription));
    }
    if (field === "location") {
      return Boolean(this.readConfidenceFieldValue(enrichment.headquarters));
    }

    const direct = this.readConfidenceFieldValue(
      enrichment[field as keyof EnrichmentWithoutDbWrites] as
        | { value?: unknown }
        | undefined,
    );
    return Boolean(direct);
  }

  private isSubstantiveEnrichment(
    enrichment: EnrichmentWithoutDbWrites,
    record: StartupRecord,
    searchResults: SearchRunResult,
  ): { ok: true } | { ok: false; reason: string } {
    if (searchResults.totalResults === 0) {
      return { ok: true };
    }

    const scalarSignals = this.countScalarSignals(enrichment, record);
    const structuredSignals =
      enrichment.discoveredFounders.length +
      enrichment.fundingHistory.length +
      enrichment.pitchDeckUrls.length +
      enrichment.correctionDetails.length +
      Object.keys(enrichment.socialProfiles).length +
      Object.keys(enrichment.productSignals).length +
      Object.keys(enrichment.tractionSignals).length;

    if (scalarSignals + structuredSignals === 0) {
      return {
        ok: false,
        reason:
          "Non-substantive enrichment output: no meaningful gaps filled from available web evidence",
      };
    }

    if (!this.hasEvidenceCitation(enrichment)) {
      return {
        ok: false,
        reason:
          "Non-substantive enrichment output: missing source citations for extracted claims",
      };
    }

    return { ok: true };
  }

  private countScalarSignals(
    enrichment: EnrichmentWithoutDbWrites,
    record: StartupRecord,
  ): number {
    const scalarMappings: Array<{
      dbColumn: keyof StartupRecord;
      key:
        | "companyName"
        | "companyDescription"
        | "tagline"
        | "industry"
        | "stage"
        | "website"
        | "headquarters";
    }> = [
      { dbColumn: "name", key: "companyName" },
      { dbColumn: "description", key: "companyDescription" },
      { dbColumn: "tagline", key: "tagline" },
      { dbColumn: "industry", key: "industry" },
      { dbColumn: "stage", key: "stage" },
      { dbColumn: "website", key: "website" },
      { dbColumn: "location", key: "headquarters" },
    ];

    let signals = 0;
    for (const mapping of scalarMappings) {
      const candidate = this.readConfidenceFieldValue(enrichment[mapping.key]);
      if (!candidate) continue;

      const current = this.readDbString(record[mapping.dbColumn]);
      if (!current || !this.valuesEquivalent(current, candidate, mapping.dbColumn === "website")) {
        signals += 1;
      }
    }
    return signals;
  }

  private hasEvidenceCitation(enrichment: EnrichmentWithoutDbWrites): boolean {
    if (enrichment.sources.length > 0) {
      return true;
    }

    const scalarSources = [
      enrichment.companyName?.source,
      enrichment.companyDescription?.source,
      enrichment.tagline?.source,
      enrichment.industry?.source,
      enrichment.stage?.source,
      enrichment.website?.source,
      enrichment.foundingDate?.source,
      enrichment.headquarters?.source,
    ];
    if (scalarSources.some((source) => this.extractUrlsFromText(source).length > 0)) {
      return true;
    }

    if (
      enrichment.fundingHistory.some((entry) => this.extractUrlsFromText(entry.source).length > 0) ||
      enrichment.pitchDeckUrls.some((entry) => this.extractUrlsFromText(entry.source).length > 0)
    ) {
      return true;
    }

    return false;
  }

  private mergeEnrichmentOutput(
    primary: Partial<EnrichmentWithoutDbWrites>,
    backup: Partial<EnrichmentWithoutDbWrites>,
  ): EnrichmentWithoutDbWrites {
    const merged = this.coerceEnrichmentShape(primary);
    const scalarKeys: Array<
      | "companyName"
      | "companyDescription"
      | "tagline"
      | "industry"
      | "stage"
      | "website"
      | "foundingDate"
      | "headquarters"
    > = [
      "companyName",
      "companyDescription",
      "tagline",
      "industry",
      "stage",
      "website",
      "foundingDate",
      "headquarters",
    ];

    for (const key of scalarKeys) {
      if (!merged[key] && backup[key]) {
        merged[key] = backup[key];
      }
    }

    merged.discoveredFounders = this.normalizeFounders([
      ...merged.discoveredFounders,
      ...(backup.discoveredFounders ?? []),
    ]);
    merged.fundingHistory = this.normalizeFundingHistory([
      ...merged.fundingHistory,
      ...(backup.fundingHistory ?? []),
    ]);
    merged.pitchDeckUrls = this.normalizePitchDeckUrls([
      ...merged.pitchDeckUrls,
      ...(backup.pitchDeckUrls ?? []),
    ]);
    merged.socialProfiles = this.normalizeSocialProfiles({
      ...(backup.socialProfiles ?? {}),
      ...merged.socialProfiles,
    });
    merged.productSignals = this.normalizeProductSignals({
      ...(backup.productSignals ?? {}),
      ...merged.productSignals,
    });
    merged.tractionSignals = this.normalizeTractionSignals({
      ...(backup.tractionSignals ?? {}),
      ...merged.tractionSignals,
    });
    merged.correctionDetails = this.normalizeCorrectionDetails([
      ...(merged.correctionDetails ?? []),
      ...(backup.correctionDetails ?? []),
    ]);
    merged.sources = this.mergeSources(
      merged.sources,
      backup.sources ?? [],
    );
    return merged;
  }

  private buildDeterministicBackupFromSearch(
    responses: BraveSearchResponse[],
    companyName: string,
    officialWebsite?: string,
  ): Partial<EnrichmentWithoutDbWrites> {
    if (responses.length === 0) {
      return {};
    }

    const founderMap = new Map<string, EnrichmentWithoutDbWrites["discoveredFounders"][number]>();
    const fundingMap = new Map<string, EnrichmentWithoutDbWrites["fundingHistory"][number]>();
    const pitchDeckMap = new Map<string, EnrichmentWithoutDbWrites["pitchDeckUrls"][number]>();
    const sourceMap = new Map<string, { url: string; title: string; type: string }>();
    const socialProfiles: EnrichmentWithoutDbWrites["socialProfiles"] = {};
    const companyNameLower = companyName.trim().toLowerCase();

    for (const response of responses) {
      for (const result of response.results) {
        const normalizedUrl = this.normalizeSourceUrl(result.url);
        if (!normalizedUrl) {
          continue;
        }

        sourceMap.set(normalizedUrl, {
          url: normalizedUrl,
          title: result.title || "Search result",
          type: "search",
        });

        if (!socialProfiles.crunchbaseUrl && this.urlMatchesDomain(normalizedUrl, "crunchbase.com")) {
          socialProfiles.crunchbaseUrl = normalizedUrl;
        }
        if (!socialProfiles.linkedinCompanyUrl && normalizedUrl.includes("linkedin.com/company/")) {
          socialProfiles.linkedinCompanyUrl = normalizedUrl;
        }
        if (!socialProfiles.twitterUrl && (this.urlMatchesDomain(normalizedUrl, "twitter.com") || this.urlMatchesDomain(normalizedUrl, "x.com"))) {
          socialProfiles.twitterUrl = normalizedUrl;
        }
        if (!socialProfiles.angelListUrl && (this.urlMatchesDomain(normalizedUrl, "angel.co") || this.urlMatchesDomain(normalizedUrl, "wellfound.com"))) {
          socialProfiles.angelListUrl = normalizedUrl;
        }
        if (!socialProfiles.githubUrl && this.urlMatchesDomain(normalizedUrl, "github.com")) {
          socialProfiles.githubUrl = normalizedUrl;
        }

        if (
          this.urlMatchesDomain(normalizedUrl, "docsend.com") ||
          this.urlMatchesDomain(normalizedUrl, "slideshare.net")
        ) {
          if (!pitchDeckMap.has(normalizedUrl)) {
            const tier = this.classifySourceTier(normalizedUrl, officialWebsite);
            pitchDeckMap.set(normalizedUrl, {
              url: normalizedUrl,
              source: normalizedUrl,
              confidence: tier === "tier1" ? 0.85 : tier === "tier2" ? 0.72 : 0.58,
            });
          }
        }

        const founder = this.extractFounderFromSearchResult(
          result.title,
          result.description,
          normalizedUrl,
          companyNameLower,
          officialWebsite,
        );
        if (founder) {
          const founderKey = founder.name.trim().toLowerCase();
          if (!founderMap.has(founderKey) || (founderMap.get(founderKey)?.confidence ?? 0) < founder.confidence) {
            founderMap.set(founderKey, founder);
          }
        }

        const funding = this.extractFundingFromSearchResult(
          result.title,
          result.description,
          normalizedUrl,
        );
        if (funding) {
          const fundingKey = `${funding.round.toLowerCase()}::${funding.date ?? "na"}::${funding.source}`;
          if (!fundingMap.has(fundingKey)) {
            fundingMap.set(fundingKey, funding);
          }
        }
      }
    }

    return {
      discoveredFounders: Array.from(founderMap.values()),
      fundingHistory: Array.from(fundingMap.values()),
      pitchDeckUrls: Array.from(pitchDeckMap.values()),
      socialProfiles,
      sources: Array.from(sourceMap.values()),
    };
  }

  private extractFounderFromSearchResult(
    title: string,
    description: string,
    url: string,
    companyNameLower: string,
    officialWebsite?: string,
  ): EnrichmentWithoutDbWrites["discoveredFounders"][number] | null {
    if (!url.includes("linkedin.com/in/")) {
      return null;
    }

    const name = this.extractNameFromSearchTitle(title);
    if (!name) {
      return null;
    }

    const context = `${title} ${description}`.toLowerCase();
    if (
      companyNameLower &&
      !context.includes(companyNameLower) &&
      !this.urlMatchesDomain(url, this.hostnameFromUrl(officialWebsite))
    ) {
      return null;
    }

    const roleMatch = `${title} ${description}`.match(
      /\b(CEO|CTO|CPO|COO|Founder|Co[- ]?founder|President)\b/i,
    );
    const tier = this.classifySourceTier(url, officialWebsite);
    const baseConfidence = tier === "tier1" ? 0.86 : tier === "tier2" ? 0.74 : 0.6;

    return {
      name,
      role: roleMatch ? roleMatch[0] : "Founder",
      linkedinUrl: url,
      confidence: Math.min(0.95, baseConfidence + (roleMatch ? 0.05 : 0)),
    };
  }

  private extractFundingFromSearchResult(
    title: string,
    description: string,
    sourceUrl: string,
  ): EnrichmentWithoutDbWrites["fundingHistory"][number] | null {
    const text = `${title} ${description}`;
    if (!/(raised|funding|series|valuation|debt financing)/i.test(text)) {
      return null;
    }

    const roundMatch = text.match(
      /\b(Series\s+[A-Z]|Pre[- ]Seed|Seed|Debt Financing|Convertible Note|Venture Round|Angel)\b/i,
    );
    const amount = this.parseFundingAmount(text);
    if (!roundMatch && !amount) {
      return null;
    }

    const date = this.parseFundingDate(text);
    const investors = this.parseLeadInvestor(text);
    return {
      round: roundMatch ? this.normalizeRoundLabel(roundMatch[0]) : "Funding Round",
      amount: amount?.amount,
      currency: amount?.currency,
      date: date ?? undefined,
      investors: investors ? [investors] : undefined,
      source: sourceUrl,
    };
  }

  private parseFundingAmount(
    text: string,
  ): { amount: number; currency: string } | null {
    const match = text.match(/\$\s?([\d,.]+)\s*(billion|million|thousand|[bmk])?/i);
    if (!match) {
      return null;
    }

    const base = Number(match[1]?.replace(/,/g, ""));
    if (!Number.isFinite(base)) {
      return null;
    }

    const suffix = match[2]?.toLowerCase();
    const multiplier =
      suffix === "billion" || suffix === "b"
        ? 1_000_000_000
        : suffix === "million" || suffix === "m"
          ? 1_000_000
          : suffix === "thousand" || suffix === "k"
            ? 1_000
            : 1;

    return {
      amount: Math.round(base * multiplier),
      currency: "USD",
    };
  }

  private parseFundingDate(text: string): string | null {
    const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (isoMatch?.[1]) {
      return isoMatch[1];
    }

    const monthMatch = text.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/i,
    );
    if (!monthMatch?.[0]) {
      return null;
    }
    const parsed = new Date(monthMatch[0]);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString().slice(0, 10);
  }

  private parseLeadInvestor(text: string): string | null {
    const ledByMatch = text.match(/\bled by ([A-Z][A-Za-z0-9&.\- ]{1,80})/i);
    if (!ledByMatch?.[1]) {
      return null;
    }
    return ledByMatch[1].trim();
  }

  private normalizeRoundLabel(round: string): string {
    return round
      .toLowerCase()
      .split(/\s+/)
      .map((part) =>
        part.length === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`,
      )
      .join(" ")
      .replace("Co-founder", "Co-Founder")
      .replace("Pre-seed", "Pre-Seed");
  }

  private extractNameFromSearchTitle(title: string): string | null {
    const trimmed = title.trim();
    if (!trimmed) {
      return null;
    }
    const left = trimmed.split("|")[0]?.trim() ?? trimmed;
    const candidate = left.split(" - ")[0]?.trim() ?? left;
    if (!/^[A-Z][a-zA-Z'`.-]+(?:\s+[A-Z][a-zA-Z'`.-]+){1,3}$/.test(candidate)) {
      return null;
    }
    return candidate;
  }

  private normalizeFounders(
    founders: EnrichmentWithoutDbWrites["discoveredFounders"],
  ): EnrichmentWithoutDbWrites["discoveredFounders"] {
    const dedupe = new Map<string, EnrichmentWithoutDbWrites["discoveredFounders"][number]>();
    for (const founder of founders) {
      const name = founder.name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = dedupe.get(key);
      if (!existing || existing.confidence < founder.confidence) {
        dedupe.set(key, {
          ...founder,
          name,
        });
      }
    }
    return Array.from(dedupe.values());
  }

  private normalizeFundingHistory(
    fundingHistory: EnrichmentWithoutDbWrites["fundingHistory"],
  ): EnrichmentWithoutDbWrites["fundingHistory"] {
    const dedupe = new Map<string, EnrichmentWithoutDbWrites["fundingHistory"][number]>();
    for (const entry of fundingHistory) {
      if (!entry.round || !entry.source) continue;
      const key = `${entry.round.toLowerCase()}::${entry.date ?? "na"}::${entry.source}`;
      if (!dedupe.has(key)) {
        dedupe.set(key, entry);
      }
    }
    return Array.from(dedupe.values());
  }

  private normalizePitchDeckUrls(
    urls: EnrichmentWithoutDbWrites["pitchDeckUrls"],
  ): EnrichmentWithoutDbWrites["pitchDeckUrls"] {
    const dedupe = new Map<string, EnrichmentWithoutDbWrites["pitchDeckUrls"][number]>();
    for (const entry of urls) {
      const normalizedUrl = this.normalizeSourceUrl(entry.url);
      if (!normalizedUrl) continue;
      if (!dedupe.has(normalizedUrl)) {
        dedupe.set(normalizedUrl, {
          ...entry,
          url: normalizedUrl,
        });
      }
    }
    return Array.from(dedupe.values());
  }

  private normalizeSocialProfiles(
    profiles: EnrichmentWithoutDbWrites["socialProfiles"],
  ): EnrichmentWithoutDbWrites["socialProfiles"] {
    const normalized: EnrichmentWithoutDbWrites["socialProfiles"] = {};
    for (const [key, value] of Object.entries(profiles)) {
      if (typeof value !== "string" || value.trim().length === 0) continue;
      const normalizedUrl = this.normalizeSourceUrl(value);
      if (!normalizedUrl) continue;
      normalized[key as keyof EnrichmentWithoutDbWrites["socialProfiles"]] = normalizedUrl;
    }
    return normalized;
  }

  private normalizeProductSignals(
    signals: EnrichmentWithoutDbWrites["productSignals"],
  ): EnrichmentWithoutDbWrites["productSignals"] {
    const normalized: EnrichmentWithoutDbWrites["productSignals"] = {};
    const pricing = this.cleanString(signals.pricing);
    const customers = this.dedupeStringArray(signals.customers);
    const techStack = this.dedupeStringArray(signals.techStack);
    const integrations = this.dedupeStringArray(signals.integrations);
    if (pricing) normalized.pricing = pricing;
    if (customers) normalized.customers = customers;
    if (techStack) normalized.techStack = techStack;
    if (integrations) normalized.integrations = integrations;
    return normalized;
  }

  private normalizeTractionSignals(
    signals: EnrichmentWithoutDbWrites["tractionSignals"],
  ): EnrichmentWithoutDbWrites["tractionSignals"] {
    const socialFollowers =
      signals.socialFollowers && typeof signals.socialFollowers === "object"
        ? Object.fromEntries(
            Object.entries(signals.socialFollowers)
              .filter((entry) => Number.isFinite(entry[1]) && entry[1] > 0)
              .map(([key, value]) => [key, Math.round(value)]),
          )
        : undefined;

    const normalized: EnrichmentWithoutDbWrites["tractionSignals"] = {};
    if (typeof signals.employeeCount === "number" && signals.employeeCount > 0) {
      normalized.employeeCount = Math.round(signals.employeeCount);
    }
    const traffic = this.cleanString(signals.webTrafficEstimate);
    if (traffic) normalized.webTrafficEstimate = traffic;
    const appStoreRating = this.cleanString(signals.appStoreRating);
    if (appStoreRating) normalized.appStoreRating = appStoreRating;
    if (socialFollowers && Object.keys(socialFollowers).length > 0) {
      normalized.socialFollowers = socialFollowers;
    }
    return normalized;
  }

  private normalizeCorrectionDetails(
    corrections: EnrichmentWithoutDbWrites["correctionDetails"],
  ): EnrichmentWithoutDbWrites["correctionDetails"] {
    const dedupe = new Map<string, EnrichmentWithoutDbWrites["correctionDetails"][number]>();
    for (const correction of corrections) {
      const field = correction.field?.trim();
      if (!field || !correction.newValue) continue;
      const key = `${field.toLowerCase()}::${correction.newValue}`;
      if (!dedupe.has(key)) {
        dedupe.set(key, {
          ...correction,
          field,
        });
      }
    }
    return Array.from(dedupe.values());
  }

  private cleanString(value: string | undefined): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private dedupeStringArray(values: string[] | undefined): string[] | undefined {
    if (!Array.isArray(values)) return undefined;
    const normalized = Array.from(
      new Set(
        values
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value) => value.length > 0),
      ),
    );
    return normalized.length > 0 ? normalized : undefined;
  }

  private readConfidenceFieldValue(
    value:
      | { value?: unknown; confidence?: unknown; source?: unknown }
      | undefined,
  ): string | null {
    if (!value || typeof value.value !== "string") {
      return null;
    }
    const trimmed = value.value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private readDbString(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private valuesEquivalent(
    current: string,
    candidate: string,
    isUrl: boolean,
  ): boolean {
    if (isUrl) {
      const normalizedCurrent = this.normalizeComparableUrl(current);
      const normalizedCandidate = this.normalizeComparableUrl(candidate);
      return normalizedCurrent !== null &&
        normalizedCandidate !== null &&
        normalizedCurrent === normalizedCandidate;
    }
    return current.trim().toLowerCase() === candidate.trim().toLowerCase();
  }

  private normalizeComparableUrl(value: string): string | null {
    const normalized = this.normalizeSourceUrl(value);
    if (!normalized) return null;
    try {
      const parsed = new URL(normalized);
      const path = parsed.pathname.replace(/\/+$/, "");
      return `${parsed.hostname.toLowerCase()}${path.toLowerCase()}`;
    } catch {
      return normalized.toLowerCase();
    }
  }

  private normalizeSourceUrl(value: string | undefined): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return null;
    }
    try {
      const parsed = new URL(trimmed);
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private extractUrlsFromText(value: string | undefined): string[] {
    if (!value) {
      return [];
    }
    const matches = value.match(/https?:\/\/[^\s)\]}]+/gi) ?? [];
    const urls = new Set<string>();
    for (const match of matches) {
      const normalized = this.normalizeSourceUrl(match);
      if (normalized) {
        urls.add(normalized);
      }
    }
    return Array.from(urls);
  }

  private classifySourceTier(
    url: string,
    officialWebsite?: string,
  ): "tier1" | "tier2" | "tier3" {
    const host = this.hostnameFromUrl(url);
    if (!host) {
      return "tier3";
    }

    const officialHost = this.hostnameFromUrl(officialWebsite);
    if (officialHost && this.hostMatchesDomain(host, officialHost)) {
      return "tier1";
    }

    if (TIER_1_SOURCE_DOMAINS.some((domain) => this.hostMatchesDomain(host, domain))) {
      return "tier1";
    }
    if (TIER_2_SOURCE_DOMAINS.some((domain) => this.hostMatchesDomain(host, domain))) {
      return "tier2";
    }
    return "tier3";
  }

  private hostnameFromUrl(value: string | undefined): string | null {
    const normalized = this.normalizeSourceUrl(value);
    if (!normalized) {
      return null;
    }
    try {
      return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return null;
    }
  }

  private urlMatchesDomain(url: string, domain: string | null): boolean {
    if (!domain) return false;
    const host = this.hostnameFromUrl(url);
    if (!host) return false;
    return this.hostMatchesDomain(host, domain.toLowerCase().replace(/^www\./, ""));
  }

  private hostMatchesDomain(host: string, domain: string): boolean {
    return host === domain || host.endsWith(`.${domain}`);
  }

  private passesCorrectionEvidenceGate(
    fieldDef: CorrectableField,
    enrichment: EnrichmentResult,
    officialWebsite?: string,
  ): boolean {
    const evidenceUrls = new Set<string>();
    for (const source of enrichment.sources ?? []) {
      const normalized = this.normalizeSourceUrl(source.url);
      if (normalized) evidenceUrls.add(normalized);
    }

    const fieldSource = (
      enrichment[fieldDef.enrichmentKey as keyof EnrichmentResult] as
        | { source?: string }
        | undefined
    )?.source;
    for (const url of this.extractUrlsFromText(fieldSource)) {
      evidenceUrls.add(url);
    }

    const domains = new Set<string>();
    let hasHighTierEvidence = false;
    for (const url of evidenceUrls) {
      const host = this.hostnameFromUrl(url);
      if (!host) continue;
      domains.add(host);
      const tier = this.classifySourceTier(url, officialWebsite);
      if (tier === "tier1" || tier === "tier2") {
        hasHighTierEvidence = true;
      }
    }

    if (domains.size < 2) {
      return false;
    }
    return hasHighTierEvidence;
  }

  private async applyDbWrites(
    record: StartupRecord,
    enrichment: EnrichmentResult,
  ): Promise<{ fieldsUpdated: string[]; foundersAdded: number }> {
    const correctionThreshold = this.aiConfig.getEnrichmentCorrectionThreshold();
    const gapFillThreshold = 0.3;
    const updates: Record<string, unknown> = {};
    const updatedFields: string[] = [];
    let foundersAdded = 0;

    // Gap fills
    for (const { dbColumn, label } of GAP_FILLABLE_FIELDS) {
      const enrichmentKey = CORRECTABLE_FIELDS.find((f) => f.dbColumn === dbColumn)?.enrichmentKey;
      if (!enrichmentKey) continue;

      const enrichedField = enrichment[enrichmentKey as keyof EnrichmentResult] as
        | { value: string; confidence: number }
        | undefined;

      if (!enrichedField) continue;

      const currentValue = record[dbColumn];
      const isEmpty = currentValue === null || currentValue === undefined || currentValue === "";

      if (isEmpty && enrichedField.confidence >= gapFillThreshold) {
        updates[dbColumn] = enrichedField.value;
        updatedFields.push(`${label} (gap fill, confidence=${enrichedField.confidence.toFixed(2)})`);
      }
    }

    // Corrections (high confidence only)
    for (const correction of enrichment.correctionDetails) {
      const fieldDef = CORRECTABLE_FIELDS.find((f) => f.label.toLowerCase() === correction.field.toLowerCase());
      if (!fieldDef) continue;

      if (correction.confidence >= correctionThreshold) {
        const passesEvidenceGate = this.passesCorrectionEvidenceGate(
          fieldDef,
          enrichment,
          record.website ?? undefined,
        );
        if (!passesEvidenceGate) {
          this.logger.debug(
            `[Enrichment] Skipping correction for ${fieldDef.label}: insufficient high-quality supporting sources`,
          );
          continue;
        }
        updates[fieldDef.dbColumn] = correction.newValue;
        updatedFields.push(
          `${fieldDef.label} (corrected: "${correction.oldValue}" → "${correction.newValue}", confidence=${correction.confidence.toFixed(2)})`,
        );
      }
    }

    // Merge discovered founders into teamMembers
    if (enrichment.discoveredFounders.length > 0 && record.teamMembers) {
      const existingNames = new Set(
        record.teamMembers.map((m) => m.name.trim().toLowerCase()),
      );
      const newMembers = enrichment.discoveredFounders
        .filter((f) => f.confidence >= 0.5 && !existingNames.has(f.name.trim().toLowerCase()))
        .map((f) => ({
          name: f.name,
          role: f.role ?? "Founder",
          linkedinUrl: f.linkedinUrl ?? "",
        }));

      if (newMembers.length > 0) {
        updates.teamMembers = [...record.teamMembers, ...newMembers];
        updatedFields.push(`teamMembers (+${newMembers.length} discovered)`);
        foundersAdded = newMembers.length;
      }
    }

    if (Object.keys(updates).length === 0) {
      this.logger.debug("[Enrichment] No DB updates to apply");
      return {
        fieldsUpdated: [],
        foundersAdded: 0,
      };
    }

    this.logger.log(`[Enrichment] Applying ${Object.keys(updates).length} DB updates`);
    await this.drizzle.db
      .update(startup)
      .set(updates)
      .where(eq(startup.id, record.id));

    return {
      fieldsUpdated: updatedFields,
      foundersAdded,
    };
  }

  private isGeminiModel(modelName: string): boolean {
    return modelName.toLowerCase().startsWith("gemini");
  }

  private async tryStructuredAttempt(input: {
    prompt: string;
    model: ReturnType<AiProviderService["resolveModelForPurpose"]>;
    canUseGoogleSearchTool: boolean;
  }): Promise<
    | {
        success: true;
        data: Omit<EnrichmentResult, "dbFieldsUpdated">;
        sources: Array<{ url: string; title: string; type: string }>;
      }
    | { success: false; error: string }
  > {
    try {
      const response = await this.withTimeout(
        generateText({
          model: input.model,
          system: ENRICHMENT_GAP_ANALYSIS_SYSTEM_PROMPT,
          prompt: input.prompt,
          output: Output.object({ schema: enrichmentOutputSchema }),
          tools: input.canUseGoogleSearchTool
            ? {
                google_search: google.tools.googleSearch({}),
              }
            : undefined,
          temperature: this.aiConfig.getEnrichmentTemperature(),
          maxOutputTokens: 8000,
        }),
        this.aiConfig.getEnrichmentTimeoutMs(),
        "[Enrichment] AI synthesis timed out",
      );

      const parsed = enrichmentOutputSchema.safeParse(response.output);
      if (parsed.success) {
        return {
          success: true,
          data: parsed.data,
          sources: this.extractGroundingSources(
            response as GroundingSourceCarrier,
          ),
        };
      }

      const textCandidate = this.resolveRawOutputText(
        response as GroundingSourceCarrier,
      );
      const reparsed = this.parseTextToObject(textCandidate);
      if (reparsed.success) {
        return {
          success: true,
          data: reparsed.data,
          sources: this.extractGroundingSources(
            response as GroundingSourceCarrier,
          ),
        };
      }

      const issues = this.formatSchemaIssues(parsed.error);
      const reason =
        issues.length > 0
          ? `Schema validation failed: ${issues}; ${reparsed.error}`
          : `Schema validation failed: ${reparsed.error}`;
      return { success: false, error: reason };
    } catch (error) {
      return { success: false, error: this.errorMessage(error) };
    }
  }

  private async tryTextAttempt(input: {
    prompt: string;
    model: ReturnType<AiProviderService["resolveModelForPurpose"]>;
    canUseGoogleSearchTool: boolean;
  }): Promise<
    | {
        success: true;
        data: Omit<EnrichmentResult, "dbFieldsUpdated">;
        sources: Array<{ url: string; title: string; type: string }>;
      }
    | { success: false; error: string }
  > {
    try {
      const response = await this.withTimeout(
        generateText({
          model: input.model,
          system: ENRICHMENT_GAP_ANALYSIS_SYSTEM_PROMPT,
          prompt: input.prompt,
          tools: input.canUseGoogleSearchTool
            ? {
                google_search: google.tools.googleSearch({}),
              }
            : undefined,
          temperature: this.aiConfig.getEnrichmentTemperature(),
          maxOutputTokens: 8000,
        }),
        this.aiConfig.getEnrichmentTimeoutMs(),
        "[Enrichment] AI synthesis timed out",
      );
      const outputText = this.resolveRawOutputText(
        response as GroundingSourceCarrier,
      );
      const parsed = this.parseTextToObject(outputText);
      if (!parsed.success) {
        return { success: false, error: parsed.error };
      }

      return {
        success: true,
        data: parsed.data,
        sources: this.extractGroundingSources(response as GroundingSourceCarrier),
      };
    } catch (error) {
      return { success: false, error: this.errorMessage(error) };
    }
  }

  private parseTextToObject(
    text: string,
  ): { success: true; data: Omit<EnrichmentResult, "dbFieldsUpdated"> } | { success: false; error: string } {
    const candidate = this.extractJsonCandidate(text);
    if (!candidate) {
      return {
        success: false,
        error: "Grounded response did not contain parseable JSON payload",
      };
    }

    const parsed = enrichmentOutputSchema.safeParse(candidate);
    if (!parsed.success) {
      const issues = this.formatSchemaIssues(parsed.error);
      return {
        success: false,
        error:
          issues.length > 0
            ? `Schema validation failed: ${issues}`
            : "Schema validation failed",
      };
    }

    return { success: true, data: parsed.data };
  }

  private extractJsonCandidate(text: string): unknown {
    const direct = this.tryParseJsonObject(text.trim());
    if (direct) {
      return direct;
    }

    const fencedMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi);
    for (const match of fencedMatches) {
      if (!match[1]) {
        continue;
      }
      const parsed = this.tryParseJsonObject(match[1]);
      if (parsed) {
        return parsed;
      }
    }

    const unescapedQuoted = this.tryParseEscapedJsonString(text.trim());
    if (unescapedQuoted) {
      return unescapedQuoted;
    }

    for (const candidate of this.extractBalancedJsonObjects(text)) {
      const parsed = this.tryParseJsonObject(candidate);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private tryParseEscapedJsonString(text: string): unknown {
    if (!text.startsWith("\"") || !text.endsWith("\"")) {
      return null;
    }

    try {
      const unescaped = JSON.parse(text);
      if (typeof unescaped !== "string") {
        return null;
      }
      return this.tryParseJsonObject(unescaped);
    } catch {
      return null;
    }
  }

  private tryParseJsonObject(text: string): unknown {
    if (!text) {
      return null;
    }

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private extractBalancedJsonObjects(text: string): string[] {
    const candidates: string[] = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (char === "{") {
        if (depth === 0) {
          start = index;
        }
        depth += 1;
        continue;
      }
      if (char === "}" && depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          candidates.push(text.slice(start, index + 1));
          start = -1;
        }
      }
    }

    return candidates;
  }

  private resolveRawOutputText(response: GroundingSourceCarrier): string {
    if (typeof response.text === "string" && response.text.trim().length > 0) {
      return response.text;
    }
    if (response.output !== undefined) {
      return this.serializeOutput(response.output);
    }
    return "";
  }

  private getEnrichmentMaxAttempts(): number {
    const raw = Number(process.env.AI_ENRICHMENT_MAX_ATTEMPTS ?? 2);
    if (!Number.isFinite(raw)) {
      return 2;
    }
    return Math.max(1, Math.floor(raw));
  }

  private getRetryDelayMs(attempt: number): number {
    const baseMs = 500 * 2 ** Math.max(0, attempt - 1);
    const jitter = Math.floor(Math.random() * 200);
    return baseMs + jitter;
  }

  private shouldRetryFallbackReason(reason: EvaluationFallbackReason): boolean {
    return (
      reason === "EMPTY_STRUCTURED_OUTPUT" ||
      reason === "SCHEMA_OUTPUT_INVALID"
    );
  }

  private classifyFallbackReason(
    errorMessage: string,
  ): EvaluationFallbackReason {
    const normalized = errorMessage.toLowerCase();

    if (normalized.includes("timed out") || normalized.includes("timeout")) {
      return "TIMEOUT";
    }
    if (
      normalized.includes("no output generated") ||
      normalized.includes("no object generated") ||
      normalized.includes("empty response")
    ) {
      return "EMPTY_STRUCTURED_OUTPUT";
    }
    if (
      normalized.includes("schema validation failed") ||
      normalized.includes("parseable json payload") ||
      normalized.includes("json parse") ||
      normalized.includes("unterminated") ||
      normalized.includes("non-substantive")
    ) {
      return "SCHEMA_OUTPUT_INVALID";
    }
    if (
      normalized.includes("rate limit") ||
      normalized.includes("429") ||
      normalized.includes("503") ||
      normalized.includes("502") ||
      normalized.includes("provider") ||
      normalized.includes("model")
    ) {
      return "MODEL_OR_PROVIDER_ERROR";
    }
    return "UNHANDLED_AGENT_EXCEPTION";
  }

  private fallbackMessage(reason: EvaluationFallbackReason): string {
    if (reason === "TIMEOUT") {
      return "Enrichment model timed out; fallback result generated.";
    }
    if (reason === "EMPTY_STRUCTURED_OUTPUT") {
      return "Model returned empty structured output; fallback result generated.";
    }
    if (reason === "SCHEMA_OUTPUT_INVALID") {
      return "Model returned non-conforming structured output; fallback result generated.";
    }
    if (reason === "MODEL_OR_PROVIDER_ERROR") {
      return "Model/provider error; fallback result generated.";
    }
    return "Enrichment failed; fallback result generated.";
  }

  private sanitizeRawProviderError(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length <= 3000) {
      return trimmed;
    }
    return `${trimmed.slice(0, 3000)}...`;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private formatSchemaIssues(error: z.ZodError): string {
    const preview = error.issues.slice(0, 6).map((issue) => {
      const path = issue.path.length > 0
        ? issue.path
            .map((segment) =>
              typeof segment === "number" ? `[${segment}]` : String(segment),
            )
            .join(".")
            .replace(".[", "[")
        : "(root)";
      return `${path}: ${issue.message}`;
    });

    if (preview.length === 0) {
      return "";
    }
    if (error.issues.length <= preview.length) {
      return preview.join(" | ");
    }
    return `${preview.join(" | ")} | +${error.issues.length - preview.length} more issue(s)`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private joinErrorMessages(first: string, second: string): string {
    if (!first) {
      return second;
    }
    if (!second || first === second) {
      return first;
    }
    return `${first}; ${second}`;
  }

  private extractGroundingSources(
    response: GroundingSourceCarrier,
  ): Array<{ url: string; title: string; type: string }> {
    const dedupe = new Map<string, { url: string; title: string; type: string }>();

    const addSource = (url: string | undefined, title: string | undefined) => {
      if (!url) {
        return;
      }
      if (dedupe.has(url)) {
        return;
      }
      dedupe.set(url, {
        url,
        title: title && title.trim().length > 0 ? title : "Grounding source",
        type: "search",
      });
    };

    for (const source of response.sources ?? []) {
      addSource(source.url, source.title);
    }

    const providerMetadata =
      this.asRecord(response.providerMetadata)?.google ??
      this.asRecord(response.experimental_providerMetadata)?.google;
    const groundingMetadata = this.asRecord(providerMetadata)?.groundingMetadata;
    const chunks = this.asRecord(groundingMetadata)?.groundingChunks;

    if (Array.isArray(chunks)) {
      for (const chunk of chunks) {
        const web = this.asRecord(chunk)?.web;
        addSource(
          this.readString(this.asRecord(web)?.uri),
          this.readString(this.asRecord(web)?.title),
        );
      }
    }

    return Array.from(dedupe.values());
  }

  private mergeSources(
    aiSources: Array<{ url: string; title: string; type: string }>,
    groundedSources: Array<{ url: string; title: string; type: string }>,
  ): Array<{ url: string; title: string; type: string }> {
    const dedupe = new Map<string, { url: string; title: string; type: string }>();
    for (const source of [...aiSources, ...groundedSources]) {
      if (!source.url || dedupe.has(source.url)) {
        continue;
      }
      dedupe.set(source.url, source);
    }
    return Array.from(dedupe.values());
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object") {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return promise;
    }

    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      Promise.resolve(promise)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private buildEmptyResult(): EnrichmentResult {
    return {
      discoveredFounders: [],
      fundingHistory: [],
      pitchDeckUrls: [],
      socialProfiles: {},
      productSignals: {},
      tractionSignals: {},
      fieldsEnriched: [],
      fieldsStillMissing: [],
      fieldsCorrected: [],
      correctionDetails: [],
      sources: [],
      dbFieldsUpdated: [],
    };
  }

  private serializeOutput(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}
