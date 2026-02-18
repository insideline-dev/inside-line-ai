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
import {
  ENRICHMENT_GAP_ANALYSIS_SYSTEM_PROMPT,
  ENRICHMENT_GAP_ANALYSIS_USER_PROMPT_TEMPLATE,
} from "../prompts/enrichment/gap-analysis.prompt";
import { AiConfigService } from "./ai-config.service";
import { AiProviderService } from "../providers/ai-provider.service";
import { PipelineStateService } from "./pipeline-state.service";
import { BraveSearchService, type BraveSearchResponse } from "./brave-search.service";

export const ENRICHMENT_AGENT_KEY = "gap_fill_hybrid";

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
  attempt: number;
  retryCount: number;
  error?: string;
  fallbackReason?: EvaluationFallbackReason;
  rawProviderError?: string;
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

      const missingFields = this.identifyMissingFields(record);
      const suspiciousFields = this.identifySuspiciousFields(record, extraction);

      this.logger.log(
        `[Enrichment] Gap analysis | missing=${missingFields.length} | suspicious=${suspiciousFields.length}`,
      );

      // Run Brave searches in parallel (if configured)
      const searchResults = await this.runSearches(record);

      // Synthesize via Gemini
      const synthesis = await this.synthesize(
        record,
        extraction,
        missingFields,
        suspiciousFields,
        searchResults,
      );
      renderedPrompt = synthesis.prompt;
      const enrichmentResult = synthesis.output;

      // Apply DB writes
      const dbFieldsUpdated = await this.applyDbWrites(record, enrichmentResult);
      enrichmentResult.dbFieldsUpdated = dbFieldsUpdated;

      this.logger.log(
        `[Enrichment] Completed | enriched=${enrichmentResult.fieldsEnriched.length} | corrected=${enrichmentResult.fieldsCorrected.length} | stillMissing=${enrichmentResult.fieldsStillMissing.length} | dbUpdated=${dbFieldsUpdated.length}`,
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

  private async runSearches(record: StartupRecord): Promise<string> {
    if (!this.braveSearch.isConfigured()) {
      this.logger.warn("[Enrichment] Brave Search not configured — skipping web searches");
      return "No web search results available (Brave Search not configured).";
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

    return this.formatSearchResults(results);
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
    searchResults: string,
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
      .replace("{{searchResults}}", searchResults);

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
      if (structured.success) {
        const mergedSources = this.mergeSources(
          structured.data.sources,
          structured.sources,
        );
        return {
          prompt,
          output: {
            ...structured.data,
            sources: mergedSources,
            dbFieldsUpdated: [],
          },
          usedFallback: false,
          attempt,
          retryCount: Math.max(0, attempt - 1),
        };
      }

      const textFallback = await this.tryTextAttempt({
        prompt: attemptPrompt,
        model: provider,
        canUseGoogleSearchTool,
      });
      if (textFallback.success) {
        const mergedSources = this.mergeSources(
          textFallback.data.sources,
          textFallback.sources,
        );
        return {
          prompt,
          output: {
            ...textFallback.data,
            sources: mergedSources,
            dbFieldsUpdated: [],
          },
          usedFallback: false,
          attempt,
          retryCount: Math.max(0, attempt - 1),
        };
      }

      const attemptError = this.joinErrorMessages(
        structured.error,
        textFallback.error,
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
      attempt: maxAttempts,
      retryCount: Math.max(0, maxAttempts - 1),
      fallbackReason: lastFallbackReason,
      rawProviderError: this.sanitizeRawProviderError(lastError),
      error: this.fallbackMessage(lastFallbackReason),
    };
  }

  private async applyDbWrites(
    record: StartupRecord,
    enrichment: EnrichmentResult,
  ): Promise<string[]> {
    const correctionThreshold = this.aiConfig.getEnrichmentCorrectionThreshold();
    const gapFillThreshold = 0.3;
    const updates: Record<string, unknown> = {};
    const updatedFields: string[] = [];

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
      }
    }

    if (Object.keys(updates).length === 0) {
      this.logger.debug("[Enrichment] No DB updates to apply");
      return [];
    }

    this.logger.log(`[Enrichment] Applying ${Object.keys(updates).length} DB updates`);
    await this.drizzle.db
      .update(startup)
      .set(updates)
      .where(eq(startup.id, record.id));

    return updatedFields;
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
      normalized.includes("unterminated")
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
