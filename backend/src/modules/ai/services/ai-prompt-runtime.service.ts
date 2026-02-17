import { BadRequestException, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { DrizzleService } from "../../../database";
import { startup, type Startup } from "../../startup/entities";
import { investorThesis } from "../../investor/entities";
import type {
  EvaluationAgentKey,
  EvaluationFeedbackNote,
  EvaluationPipelineInput,
  ResearchAgentKey,
  ResearchPipelineInput,
} from "../interfaces/agent.interface";
import type {
  ExtractionResult,
  EvaluationResult,
  ResearchResult,
  ScrapingResult,
} from "../interfaces/phase-results.interface";
import { ModelPurpose, PipelinePhase } from "../interfaces/pipeline.interface";
import { ALL_RESEARCH_AGENTS } from "../agents/research";
import { SynthesisAgent, type SynthesisAgentInput } from "../agents/synthesis";
import {
  EVALUATION_PROMPT_KEY_BY_AGENT,
  RESEARCH_PROMPT_KEY_BY_AGENT,
  AI_PROMPT_CATALOG,
  AI_PROMPT_VARIABLE_DEFINITIONS,
  type AiPromptKey,
  isAiPromptKey,
} from "./ai-prompt-catalog";
import { AiPromptService } from "./ai-prompt.service";
import { AiConfigService } from "./ai-config.service";
import { PipelineStateService } from "./pipeline-state.service";
import { PipelineFeedbackService } from "./pipeline-feedback.service";
import { ScoreComputationService } from "./score-computation.service";
import { StartupStage } from "../../startup/entities/startup.schema";
import {
  BusinessModelEvaluationAgent,
  CompetitiveAdvantageEvaluationAgent,
  DealTermsEvaluationAgent,
  ExitPotentialEvaluationAgent,
  FinancialsEvaluationAgent,
  GtmEvaluationAgent,
  LegalEvaluationAgent,
  MarketEvaluationAgent,
  ProductEvaluationAgent,
  TeamEvaluationAgent,
  TractionEvaluationAgent,
} from "../agents/evaluation";

type PreviewInput = {
  startupId?: string;
  stage?: StartupStage | null;
  investorThesis?: string;
  fromEmail?: string;
  subject?: string;
  body?: string;
  attachments?: string[];
  hasLinkedStartup?: boolean;
  historyBlock?: string;
  investorName?: string;
  intent?: string;
  startupBlock?: string;
  intentInstructions?: string;
};

type TemplateVariable = string | number | null | undefined;
type TemplateVariables = Record<string, TemplateVariable>;

type PromptContextField = {
  path: string;
  label: string;
  type: "string" | "number" | "boolean" | "array" | "object" | "unknown";
  sourceVariable?: string | null;
  description?: string;
};

type PromptRuntimeSchema = {
  requiredPhases: PipelinePhase[];
  fields: PromptContextField[];
  notes: string[];
};

const RUNTIME_SCHEMA_BY_KEY: Record<AiPromptKey, PromptRuntimeSchema> = {
  "extraction.fields": {
    requiredPhases: [],
    fields: [
      { path: "startupContextJson", label: "Startup Context JSON", type: "object", sourceVariable: "startupContextJson" },
      { path: "startupContextJson.companyName", label: "Company Name", type: "string", sourceVariable: "startupContextJson" },
      { path: "startupContextJson.industry", label: "Industry", type: "string", sourceVariable: "startupContextJson" },
      { path: "startupContextJson.stage", label: "Stage", type: "string", sourceVariable: "startupContextJson" },
      { path: "startupContextJson.teamMembers", label: "Team Members", type: "array", sourceVariable: "startupContextJson" },
      { path: "pitchDeckText", label: "Pitch Deck Text", type: "string", sourceVariable: "pitchDeckText" },
    ],
    notes: ["Context uses startup intake fields plus extracted pitch deck text when available."],
  },
  "research.team": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING],
    fields: [
      { path: "contextJson.companyName", label: "Company Name", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.teamMembers", label: "Team Members", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.startupFormContext", label: "Startup Form Context", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.adminFeedback", label: "Admin Feedback", type: "array", sourceVariable: "contextJson" },
    ],
    notes: ["Built from research team context builder + startup form context + phase/agent feedback."],
  },
  "research.market": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING],
    fields: [
      { path: "contextJson.industry", label: "Industry", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.geographicFocus", label: "Geographic Focus", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.targetMarket", label: "Target Market", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.adminFeedback", label: "Admin Feedback", type: "array", sourceVariable: "contextJson" },
    ],
    notes: ["Built from research market context builder + startup form context + phase/agent feedback."],
  },
  "research.product": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING],
    fields: [
      { path: "contextJson.productDescription", label: "Product Description", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.websiteProductPages", label: "Website Product Pages", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.websiteHeadings", label: "Website Headings", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.adminFeedback", label: "Admin Feedback", type: "array", sourceVariable: "contextJson" },
    ],
    notes: ["Built from research product context builder + startup form context + phase/agent feedback."],
  },
  "research.news": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING],
    fields: [
      { path: "contextJson.companyName", label: "Company Name", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.industry", label: "Industry", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.knownFunding", label: "Known Funding", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.adminFeedback", label: "Admin Feedback", type: "array", sourceVariable: "contextJson" },
    ],
    notes: ["Built from research news context builder + startup form context + phase/agent feedback."],
  },
  "research.competitor": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING],
    fields: [
      { path: "contextJson.companyName", label: "Company Name", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.websiteHeadings", label: "Website Headings", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.companyDescription", label: "Company Description", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.adminFeedback", label: "Admin Feedback", type: "array", sourceVariable: "contextJson" },
    ],
    notes: ["Built from research competitor context builder + startup form context + phase/agent feedback."],
  },
  "evaluation.team": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      { path: "contextJson.teamMembers", label: "Team Members", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.linkedinProfiles", label: "LinkedIn Profiles", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.teamResearch", label: "Team Research", type: "object", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: ["Context sections are generated from evaluation context object fields in deterministic order."],
  },
  "evaluation.market": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      { path: "contextJson.marketResearch", label: "Market Research", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.competitiveLandscape", label: "Competitive Landscape", type: "array", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: ["Context includes stage-aware extraction output and research market payloads."],
  },
  "evaluation.product": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      { path: "contextJson.productResearch", label: "Product Research", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.websiteProductPages", label: "Website Product Pages", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.extractedFeatures", label: "Extracted Features", type: "array", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: ["Context combines deck, scrape, and research product evidence."],
  },
  "evaluation.traction": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      { path: "contextJson.tractionMetrics", label: "Traction Metrics", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.newsResearch", label: "News Research", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.previousFunding", label: "Previous Funding", type: "array", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: ["Context highlights traction signals from scraped proof points and news."],
  },
  "evaluation.businessModel": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      { path: "contextJson.pricing", label: "Pricing", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.unitEconomics", label: "Unit Economics", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.marketContext", label: "Market Context", type: "object", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: ["Context combines deck business model data and multi-agent research context."],
  },
  "evaluation.gtm": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      { path: "contextJson.websiteMarketingPages", label: "Website Marketing Pages", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.distributionChannels", label: "Distribution Channels", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.customerAcquisitionStrategy", label: "Customer Acquisition Strategy", type: "string", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: ["Context includes market/product/competitor-derived GTM signals."],
  },
  "evaluation.financials": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      { path: "contextJson.financialProjections", label: "Financial Projections", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.previousFunding", label: "Previous Funding", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.currentValuation", label: "Current Valuation", type: "number", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: ["Context captures valuation/fundraise assumptions and external funding references."],
  },
  "evaluation.competitiveAdvantage": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      { path: "contextJson.marketResearch", label: "Market Research", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.competitiveLandscape", label: "Competitive Landscape", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.productResearch", label: "Product Research", type: "object", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: ["Context aggregates defensibility evidence across team, market, and product research."],
  },
  "evaluation.legal": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      { path: "contextJson.complianceMentions", label: "Compliance Mentions", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.regulatoryLandscape", label: "Regulatory Landscape", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.corporateStructure", label: "Corporate Structure", type: "object", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: ["Context includes legal/compliance signals from extraction, scraping, and news."],
  },
  "evaluation.dealTerms": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      { path: "contextJson.fundingTarget", label: "Funding Target", type: "number", sourceVariable: "contextJson" },
      { path: "contextJson.currentValuation", label: "Current Valuation", type: "number", sourceVariable: "contextJson" },
      { path: "contextJson.raiseType", label: "Raise Type", type: "string", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: ["Context includes deal terms from extraction plus competitor/market comparables."],
  },
  "evaluation.exitPotential": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      { path: "contextJson.marketSize", label: "Market Size", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.competitorMandA", label: "Competitor M&A", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.exitOpportunities", label: "Exit Opportunities", type: "array", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: ["Context combines market size, M&A signals, and long-term scalability evidence."],
  },
  "synthesis.final": {
    requiredPhases: [
      PipelinePhase.EXTRACTION,
      PipelinePhase.SCRAPING,
      PipelinePhase.RESEARCH,
      PipelinePhase.EVALUATION,
    ],
    fields: [
      { path: "synthesisBrief", label: "Synthesis Brief", type: "string", sourceVariable: "synthesisBrief" },
      { path: "contextJson", label: "Full Synthesis Input JSON", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.stageWeights", label: "Stage Weights", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.evaluation", label: "Evaluation Output", type: "object", sourceVariable: "contextJson" },
    ],
    notes: ["Synthesis prompt receives both narrative brief and full machine-readable evaluation payload."],
  },
  "matching.thesis": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SYNTHESIS],
    fields: [
      { path: "investorThesis", label: "Investor Thesis", type: "string", sourceVariable: "investorThesis" },
      { path: "startupSummary", label: "Startup Summary", type: "string", sourceVariable: "startupSummary" },
      { path: "recommendation", label: "Recommendation", type: "string", sourceVariable: "recommendation" },
      { path: "overallScore", label: "Overall Score", type: "number", sourceVariable: "overallScore" },
      { path: "startupProfile", label: "Startup Profile", type: "object", sourceVariable: "startupProfile" },
    ],
    notes: ["Matching prompts run per investor thesis. Preview uses request thesis or first active thesis as fallback."],
  },
  "clara.intent": {
    requiredPhases: [],
    fields: [
      { path: "fromEmail", label: "From Email", type: "string", sourceVariable: "fromEmail" },
      { path: "subject", label: "Subject", type: "string", sourceVariable: "subject" },
      { path: "body", label: "Body", type: "string", sourceVariable: "body" },
      { path: "attachments", label: "Attachments", type: "string", sourceVariable: "attachments" },
      { path: "historyBlock", label: "History Block", type: "string", sourceVariable: "historyBlock" },
    ],
    notes: ["Clara context comes from inbound message metadata and recent conversation history."],
  },
  "clara.response": {
    requiredPhases: [],
    fields: [
      { path: "investorName", label: "Investor Name", type: "string", sourceVariable: "investorName" },
      { path: "intent", label: "Intent", type: "string", sourceVariable: "intent" },
      { path: "startupStage", label: "Startup Stage", type: "string", sourceVariable: "startupStage" },
      { path: "startupBlock", label: "Startup Block", type: "string", sourceVariable: "startupBlock" },
      { path: "intentInstructions", label: "Intent Instructions", type: "string", sourceVariable: "intentInstructions" },
      { path: "historyBlock", label: "History Block", type: "string", sourceVariable: "historyBlock" },
    ],
    notes: ["Clara response context is intent-driven plus startup status snippets and short thread history."],
  },
};

@Injectable()
export class AiPromptRuntimeService {
  constructor(
    private drizzle: DrizzleService,
    private promptService: AiPromptService,
    private pipelineState: PipelineStateService,
    private pipelineFeedback: PipelineFeedbackService,
    private aiConfig: AiConfigService,
    private scoreComputation: ScoreComputationService,
    private synthesisAgent: SynthesisAgent,
    private teamEvaluationAgent: TeamEvaluationAgent,
    private marketEvaluationAgent: MarketEvaluationAgent,
    private productEvaluationAgent: ProductEvaluationAgent,
    private tractionEvaluationAgent: TractionEvaluationAgent,
    private businessModelEvaluationAgent: BusinessModelEvaluationAgent,
    private gtmEvaluationAgent: GtmEvaluationAgent,
    private financialsEvaluationAgent: FinancialsEvaluationAgent,
    private competitiveAdvantageEvaluationAgent: CompetitiveAdvantageEvaluationAgent,
    private legalEvaluationAgent: LegalEvaluationAgent,
    private dealTermsEvaluationAgent: DealTermsEvaluationAgent,
    private exitPotentialEvaluationAgent: ExitPotentialEvaluationAgent,
  ) {}

  getContextSchema(key: string) {
    if (!isAiPromptKey(key)) {
      throw new BadRequestException(`Unsupported prompt key: ${key}`);
    }

    const catalog = AI_PROMPT_CATALOG[key];
    const runtime = RUNTIME_SCHEMA_BY_KEY[key];

    return {
      key,
      displayName: catalog.displayName,
      description: catalog.description,
      allowedVariables: catalog.allowedVariables,
      requiredVariables: catalog.requiredVariables,
      variableDefinitions: this.getVariableDefinitions(catalog.allowedVariables),
      requiredPhases: runtime.requiredPhases,
      contextFields: runtime.fields,
      notes: runtime.notes,
    };
  }

  async previewPrompt(key: string, input: PreviewInput) {
    if (!isAiPromptKey(key)) {
      throw new BadRequestException(`Unsupported prompt key: ${key}`);
    }

    const resolved = await this.resolveVariablesForKey(key, input);

    const promptConfig = await this.promptService.resolve({
      key,
      stage: resolved.stage,
    });

    const renderedSystemPrompt = this.promptService.renderTemplate(
      promptConfig.systemPrompt,
      resolved.variables,
    );
    const renderedUserPrompt = this.promptService.renderTemplate(
      promptConfig.userPrompt,
      resolved.variables,
    );

    const model = this.resolveModelPreview(key);

    return {
      key,
      source: {
        promptSource: promptConfig.source,
        promptRevisionId: promptConfig.revisionId,
        effectiveStage: resolved.stage,
        startupId: resolved.startupId,
      },
      prompt: {
        systemPromptTemplate: promptConfig.systemPrompt,
        userPromptTemplate: promptConfig.userPrompt,
        renderedSystemPrompt,
        renderedUserPrompt,
      },
      model,
      resolvedVariables: resolved.variables,
      hashes: {
        renderedSystemPrompt: this.sha256(renderedSystemPrompt),
        renderedUserPrompt: this.sha256(renderedUserPrompt),
        variables: this.sha256(
          JSON.stringify(
            Object.keys(resolved.variables)
              .sort()
              .reduce<Record<string, TemplateVariable>>((acc, current) => {
                acc[current] = resolved.variables[current];
                return acc;
              }, {}),
          ),
        ),
      },
    };
  }

  private async resolveVariablesForKey(
    key: AiPromptKey,
    input: PreviewInput,
  ): Promise<{ variables: TemplateVariables; stage: StartupStage | null; startupId: string | null }> {
    if (key === "extraction.fields") {
      return this.resolveExtractionVariables(input);
    }

    if (key.startsWith("research.")) {
      return this.resolveResearchVariables(
        key as Extract<AiPromptKey, `research.${string}`>,
        input,
      );
    }

    if (key.startsWith("evaluation.")) {
      return this.resolveEvaluationVariables(
        key as Extract<AiPromptKey, `evaluation.${string}`>,
        input,
      );
    }

    if (key === "synthesis.final") {
      return this.resolveSynthesisVariables(input);
    }

    if (key === "matching.thesis") {
      return this.resolveMatchingVariables(input);
    }

    if (key === "clara.intent") {
      return {
        stage: this.normalizeStage(input.stage),
        startupId: input.startupId ?? null,
        variables: {
          fromEmail: input.fromEmail ?? "unknown@example.com",
          subject: input.subject ?? "(no subject)",
          body: input.body ?? "(empty)",
          attachments: input.attachments?.join(", ") || "none",
          hasLinkedStartup:
            input.hasLinkedStartup !== undefined
              ? String(input.hasLinkedStartup)
              : input.startupId
                ? "yes"
                : "no",
          historyBlock: input.historyBlock ?? "No prior conversation.",
          startupStage: input.stage ?? "unknown",
        },
      };
    }

    return {
      stage: this.normalizeStage(input.stage),
      startupId: input.startupId ?? null,
      variables: {
        investorName: input.investorName ?? "there",
        intent: input.intent ?? "greeting",
        startupStage: input.stage ?? "unknown",
        startupBlock: input.startupBlock ?? "Startup: unknown\nStatus: unknown",
        intentInstructions:
          input.intentInstructions ??
          "Respond warmly, acknowledge the investor, and provide concise next steps.",
        historyBlock: input.historyBlock ?? "No recent conversation.",
      },
    };
  }

  private async resolveExtractionVariables(input: PreviewInput): Promise<{
    variables: TemplateVariables;
    stage: StartupStage | null;
    startupId: string | null;
  }> {
    const startupId = this.requireStartupId(input.startupId, "extraction.fields");
    const startupRecord = await this.requireStartup(startupId);
    const extraction = (await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.EXTRACTION,
    )) as ExtractionResult | null;

    const startupContextPayload = {
      companyName: startupRecord.name,
      tagline: startupRecord.tagline,
      industry: startupRecord.industry,
      stage: startupRecord.stage,
      location: startupRecord.location,
      website: startupRecord.website,
      fundingAsk: startupRecord.fundingTarget,
      valuation: startupRecord.valuation,
      teamMembers: startupRecord.teamMembers,
      startupFormContext: {
        sectorIndustryGroup: startupRecord.sectorIndustryGroup,
        sectorIndustry: startupRecord.sectorIndustry,
        pitchDeckPath: startupRecord.pitchDeckPath,
        pitchDeckUrl: startupRecord.pitchDeckUrl,
        demoUrl: startupRecord.demoUrl,
        demoVideoUrl: startupRecord.demoVideoUrl,
        roundCurrency: startupRecord.roundCurrency,
        valuationKnown: startupRecord.valuationKnown,
        valuationType: startupRecord.valuationType,
        raiseType: startupRecord.raiseType,
        leadSecured: startupRecord.leadSecured,
        leadInvestorName: startupRecord.leadInvestorName,
        hasPreviousFunding: startupRecord.hasPreviousFunding,
        previousFundingAmount: startupRecord.previousFundingAmount,
        previousFundingCurrency: startupRecord.previousFundingCurrency,
        previousInvestors: startupRecord.previousInvestors,
        previousRoundType: startupRecord.previousRoundType,
        technologyReadinessLevel: startupRecord.technologyReadinessLevel,
        productDescription: startupRecord.productDescription,
        productScreenshots: startupRecord.productScreenshots,
        files: startupRecord.files,
      },
    };

    const pitchDeckText = extraction?.rawText ?? this.buildStartupFallbackText(startupRecord);

    return {
      stage: this.normalizeStage(input.stage ?? extraction?.stage ?? startupRecord.stage),
      startupId,
      variables: {
        startupContextJson: JSON.stringify(startupContextPayload),
        pitchDeckText,
      },
    };
  }

  private async resolveResearchVariables(
    key: Extract<AiPromptKey, `research.${string}`>,
    input: PreviewInput,
  ): Promise<{ variables: TemplateVariables; stage: StartupStage | null; startupId: string | null }> {
    const startupId = this.requireStartupId(input.startupId, key);
    const extraction = await this.requirePhaseResult<ExtractionResult>(
      startupId,
      PipelinePhase.EXTRACTION,
      key,
    );
    const scraping = await this.requirePhaseResult<ScrapingResult>(
      startupId,
      PipelinePhase.SCRAPING,
      key,
    );

    const pipelineInput: ResearchPipelineInput = { extraction, scraping };
    const agentKey = this.getResearchAgentKeyFromPromptKey(key);
    const agent = ALL_RESEARCH_AGENTS[agentKey];
    const context = agent.contextBuilder(pipelineInput);
    const feedbackContext = await this.loadResearchFeedbackContext(startupId, agentKey);

    const promptContext = {
      ...context,
      startupFormContext: extraction.startupContext ?? {},
      adminFeedback: feedbackContext,
    };

    return {
      stage: this.normalizeStage(input.stage ?? extraction.stage),
      startupId,
      variables: {
        contextJson: `<user_provided_data>\n${JSON.stringify(promptContext)}\n</user_provided_data>`,
        agentName: agent.name,
        agentKey,
      },
    };
  }

  private async resolveEvaluationVariables(
    key: Extract<AiPromptKey, `evaluation.${string}`>,
    input: PreviewInput,
  ): Promise<{ variables: TemplateVariables; stage: StartupStage | null; startupId: string | null }> {
    const startupId = this.requireStartupId(input.startupId, key);

    const extraction = await this.requirePhaseResult<ExtractionResult>(
      startupId,
      PipelinePhase.EXTRACTION,
      key,
    );
    const scraping = await this.requirePhaseResult<ScrapingResult>(
      startupId,
      PipelinePhase.SCRAPING,
      key,
    );
    const research = await this.requirePhaseResult<ResearchResult>(
      startupId,
      PipelinePhase.RESEARCH,
      key,
    );

    const pipelineInput: EvaluationPipelineInput = { extraction, scraping, research };
    const { evaluationKey, agent } = this.getEvaluationAgentFromPromptKey(key);
    const feedbackNotes = await this.loadEvaluationFeedbackNotes(startupId, evaluationKey);

    const promptContext = {
      ...agent.buildContext(pipelineInput),
      startupFormContext: extraction.startupContext ?? {},
      adminFeedback: feedbackNotes,
    };

    return {
      stage: this.normalizeStage(input.stage ?? extraction.stage),
      startupId,
      variables: {
        contextSections: this.formatContextSections(promptContext),
        contextJson: JSON.stringify(promptContext),
      },
    };
  }

  private async resolveSynthesisVariables(input: PreviewInput): Promise<{
    variables: TemplateVariables;
    stage: StartupStage | null;
    startupId: string | null;
  }> {
    const startupId = this.requireStartupId(input.startupId, "synthesis.final");

    const extraction = await this.requirePhaseResult<ExtractionResult>(
      startupId,
      PipelinePhase.EXTRACTION,
      "synthesis.final",
    );
    const scraping = await this.requirePhaseResult<ScrapingResult>(
      startupId,
      PipelinePhase.SCRAPING,
      "synthesis.final",
    );
    const research = await this.requirePhaseResult<ResearchResult>(
      startupId,
      PipelinePhase.RESEARCH,
      "synthesis.final",
    );
    const evaluation = await this.requirePhaseResult<EvaluationResult>(
      startupId,
      PipelinePhase.EVALUATION,
      "synthesis.final",
    );

    const stageWeights = await this.scoreComputation.getWeightsForStage(extraction.stage);
    const synthesisInput: SynthesisAgentInput = {
      extraction,
      scraping,
      research,
      evaluation,
      stageWeights: stageWeights as unknown as Record<string, number>,
    };

    const promptVariables = this.synthesisAgent.buildPromptVariables(synthesisInput);

    return {
      stage: this.normalizeStage(input.stage ?? extraction.stage),
      startupId,
      variables: promptVariables,
    };
  }

  private async resolveMatchingVariables(input: PreviewInput): Promise<{
    variables: TemplateVariables;
    stage: StartupStage | null;
    startupId: string | null;
  }> {
    const startupId = this.requireStartupId(input.startupId, "matching.thesis");
    const extraction = await this.requirePhaseResult<ExtractionResult>(
      startupId,
      PipelinePhase.EXTRACTION,
      "matching.thesis",
    );

    const synthesis = await this.requirePhaseResult<{
      overallScore: number;
      recommendation: string;
      executiveSummary: string;
    }>(startupId, PipelinePhase.SYNTHESIS, "matching.thesis");

    const resolvedThesis =
      input.investorThesis ?? (await this.getDefaultInvestorThesis()) ?? "No thesis provided";

    return {
      stage: this.normalizeStage(input.stage ?? extraction.stage),
      startupId,
      variables: {
        investorThesis: resolvedThesis,
        startupSummary: synthesis.executiveSummary,
        recommendation: synthesis.recommendation,
        overallScore: synthesis.overallScore,
        startupProfile: JSON.stringify(synthesis),
      },
    };
  }

  private async getDefaultInvestorThesis(): Promise<string | null> {
    const [row] = await this.drizzle.db
      .select({ thesisNarrative: investorThesis.thesisNarrative, notes: investorThesis.notes })
      .from(investorThesis)
      .where(eq(investorThesis.isActive, true))
      .limit(1);

    return row?.thesisNarrative ?? row?.notes ?? null;
  }

  private resolveModelPreview(key: AiPromptKey) {
    const purpose = this.resolveModelPurpose(key);
    const modelName = this.aiConfig.getModelForPurpose(purpose);
    const provider = this.resolveProviderForModel(modelName);

    const supportedSearchModes: Array<"off" | "provider_grounded_search"> =
      purpose === ModelPurpose.RESEARCH && provider === "google"
        ? ["off", "provider_grounded_search"]
        : ["off"];

    return {
      purpose,
      modelName,
      provider,
      searchMode:
        supportedSearchModes.includes("provider_grounded_search")
          ? "provider_grounded_search"
          : "off",
      supportedSearchModes,
    };
  }

  private resolveModelPurpose(key: AiPromptKey): ModelPurpose {
    if (key === "extraction.fields") {
      return ModelPurpose.EXTRACTION;
    }

    if (key.startsWith("research.")) {
      return ModelPurpose.RESEARCH;
    }

    if (key.startsWith("evaluation.")) {
      return ModelPurpose.EVALUATION;
    }

    if (key === "synthesis.final") {
      return ModelPurpose.SYNTHESIS;
    }

    if (key === "matching.thesis") {
      return ModelPurpose.THESIS_ALIGNMENT;
    }

    return ModelPurpose.EXTRACTION;
  }

  private resolveProviderForModel(modelName: string): string {
    const lower = modelName.toLowerCase();
    if (lower.startsWith("gemini")) {
      return "google";
    }
    if (lower.startsWith("mistral")) {
      return "mistral";
    }
    if (lower.startsWith("claude")) {
      return "anthropic";
    }
    return "openai";
  }

  private async loadResearchFeedbackContext(startupId: string, key: ResearchAgentKey) {
    const [phaseScope, agentScope] = await Promise.all([
      this.pipelineFeedback.getContext({
        startupId,
        phase: PipelinePhase.RESEARCH,
        limit: 10,
      }),
      this.pipelineFeedback.getContext({
        startupId,
        phase: PipelinePhase.RESEARCH,
        agentKey: key,
        limit: 10,
      }),
    ]);

    const dedupe = new Map<string, { scope: string; feedback: string; createdAt: Date }>();

    for (const item of phaseScope.items) {
      if (item.agentKey !== null) {
        continue;
      }
      dedupe.set(item.id, {
        scope: "phase",
        feedback: item.feedback,
        createdAt: item.createdAt,
      });
    }

    for (const item of agentScope.items) {
      dedupe.set(item.id, {
        scope: item.agentKey ? `agent:${item.agentKey}` : "phase",
        feedback: item.feedback,
        createdAt: item.createdAt,
      });
    }

    return Array.from(dedupe.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);
  }

  private async loadEvaluationFeedbackNotes(
    startupId: string,
    key: EvaluationAgentKey,
  ): Promise<EvaluationFeedbackNote[]> {
    const [phaseScope, agentScope] = await Promise.all([
      this.pipelineFeedback.getContext({
        startupId,
        phase: PipelinePhase.EVALUATION,
        limit: 10,
      }),
      this.pipelineFeedback.getContext({
        startupId,
        phase: PipelinePhase.EVALUATION,
        agentKey: key,
        limit: 10,
      }),
    ]);

    const byId = new Map<string, EvaluationFeedbackNote>();

    for (const item of phaseScope.items) {
      if (item.agentKey !== null) {
        continue;
      }

      byId.set(item.id, {
        scope: "phase",
        feedback: item.feedback,
        createdAt: item.createdAt,
      });
    }

    for (const item of agentScope.items) {
      byId.set(item.id, {
        scope: item.agentKey ? (`agent:${key}` as const) : "phase",
        feedback: item.feedback,
        createdAt: item.createdAt,
      });
    }

    return Array.from(byId.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);
  }

  private formatContextSections(context: Record<string, unknown>): string {
    const sections: string[] = [];

    for (const [key, value] of Object.entries(context)) {
      if (value === undefined || value === null) {
        continue;
      }

      const label = key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase())
        .trim();

      if (typeof value === "string") {
        sections.push(`## ${label}\n<user_provided_data>\n${value}\n</user_provided_data>`);
        continue;
      }

      if (Array.isArray(value) && value.length === 0) {
        continue;
      }

      sections.push(
        `## ${label}\n<user_provided_data>\n${JSON.stringify(value, null, 2)}\n</user_provided_data>`,
      );
    }

    return sections.join("\n\n");
  }

  private getResearchAgentKeyFromPromptKey(
    key: Extract<AiPromptKey, `research.${string}`>,
  ): ResearchAgentKey {
    const entry = (Object.entries(RESEARCH_PROMPT_KEY_BY_AGENT) as Array<[ResearchAgentKey, AiPromptKey]>).find(
      ([, promptKey]) => promptKey === key,
    );

    if (!entry) {
      throw new BadRequestException(`Unsupported research prompt key: ${key}`);
    }

    return entry[0];
  }

  private getEvaluationAgentFromPromptKey(key: Extract<AiPromptKey, `evaluation.${string}`>) {
    const entry = (
      Object.entries(EVALUATION_PROMPT_KEY_BY_AGENT) as Array<[
        EvaluationAgentKey,
        AiPromptKey,
      ]>
    ).find(([, promptKey]) => promptKey === key);

    if (!entry) {
      throw new BadRequestException(`Unsupported evaluation prompt key: ${key}`);
    }

    const evaluationKey = entry[0];

    switch (evaluationKey) {
      case "team":
        return { evaluationKey, agent: this.teamEvaluationAgent };
      case "market":
        return { evaluationKey, agent: this.marketEvaluationAgent };
      case "product":
        return { evaluationKey, agent: this.productEvaluationAgent };
      case "traction":
        return { evaluationKey, agent: this.tractionEvaluationAgent };
      case "businessModel":
        return { evaluationKey, agent: this.businessModelEvaluationAgent };
      case "gtm":
        return { evaluationKey, agent: this.gtmEvaluationAgent };
      case "financials":
        return { evaluationKey, agent: this.financialsEvaluationAgent };
      case "competitiveAdvantage":
        return { evaluationKey, agent: this.competitiveAdvantageEvaluationAgent };
      case "legal":
        return { evaluationKey, agent: this.legalEvaluationAgent };
      case "dealTerms":
        return { evaluationKey, agent: this.dealTermsEvaluationAgent };
      case "exitPotential":
        return { evaluationKey, agent: this.exitPotentialEvaluationAgent };
      default:
        throw new BadRequestException(`Unsupported evaluation prompt key: ${key}`);
    }
  }

  private async requireStartup(id: string): Promise<Startup> {
    const [record] = await this.drizzle.db
      .select()
      .from(startup)
      .where(eq(startup.id, id))
      .limit(1);

    if (!record) {
      throw new BadRequestException(`Startup not found: ${id}`);
    }

    return record;
  }

  private async requirePhaseResult<T>(
    startupId: string,
    phase: PipelinePhase,
    key: AiPromptKey,
  ): Promise<T> {
    const result = await this.pipelineState.getPhaseResult(startupId, phase);

    if (!result) {
      throw new BadRequestException(
        `Prompt preview for ${key} requires ${phase} phase results. Re-run the startup pipeline first.`,
      );
    }

    return result as T;
  }

  private requireStartupId(value: string | undefined, key: AiPromptKey): string {
    if (!value) {
      throw new BadRequestException(`startupId is required to preview prompt key ${key}`);
    }
    return value;
  }

  private normalizeStage(value?: string | StartupStage | null): StartupStage | null {
    if (!value) {
      return null;
    }

    const normalized = String(value).trim().toLowerCase().replace(/-/g, "_");
    if (Object.values(StartupStage).includes(normalized as StartupStage)) {
      return normalized as StartupStage;
    }

    return null;
  }

  private buildStartupFallbackText(startupRecord: Startup): string {
    return [
      `Company: ${startupRecord.name}`,
      `Tagline: ${startupRecord.tagline}`,
      `Description: ${startupRecord.description}`,
      `Industry: ${startupRecord.industry}`,
      `Stage: ${startupRecord.stage}`,
      `Location: ${startupRecord.location}`,
      `Website: ${startupRecord.website}`,
      `Funding target: ${startupRecord.fundingTarget}`,
      `Valuation: ${startupRecord.valuation ?? "unknown"}`,
    ].join("\n");
  }

  private getVariableDefinitions(variableNames: string[]) {
    const definitions: Record<
      string,
      { description: string; source: string; example?: string }
    > = {};

    for (const variableName of variableNames) {
      const definition = AI_PROMPT_VARIABLE_DEFINITIONS[variableName];
      definitions[variableName] =
        definition ??
        ({
          description: "Variable supported by this prompt key.",
          source: "Prompt runtime context builder",
        } as const);
    }

    return definitions;
  }

  private sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
