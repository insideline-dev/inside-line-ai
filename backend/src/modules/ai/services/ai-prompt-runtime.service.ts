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
  AI_PROMPT_KEYS,
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
import { buildEvaluationCommonBaseline } from "./evaluation-prompt-baseline";
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
import { buildResearchPromptVariables } from "./research-prompt-variables";

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
type PipelinePromptKey = Extract<
  AiPromptKey,
  `research.${string}` | `evaluation.${string}`
>;

type ParsedContextSection = {
  title: string;
  data: unknown;
};

type PipelineContextAgentPreview = {
  phase: PipelinePhase.RESEARCH | PipelinePhase.EVALUATION;
  agentKey: string;
  promptKey: PipelinePromptKey;
  promptSource: "db" | "code";
  promptRevisionId: string | null;
  effectiveStage: StartupStage | null;
  resolvedVariables: TemplateVariables;
  renderedSystemPrompt: string;
  renderedUserPrompt: string;
  renderedSystemPromptWithDynamic: string;
  renderedUserPromptWithDynamic: string;
  parsedContextJson: unknown | null;
  parsedContextSections: ParsedContextSection[] | null;
  hashes: {
    renderedSystemPrompt: string;
    renderedUserPrompt: string;
    renderedSystemPromptWithDynamic: string;
    renderedUserPromptWithDynamic: string;
    variables: string;
  };
};

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

const EVALUATION_STARTUP_SNAPSHOT_FIELDS: PromptContextField[] = [
  {
    path: "contextJson.startupSnapshot.companyName",
    label: "Startup Snapshot Company Name",
    type: "string",
    sourceVariable: "contextJson",
  },
  {
    path: "contextJson.startupSnapshot.industry",
    label: "Startup Snapshot Industry",
    type: "string",
    sourceVariable: "contextJson",
  },
  {
    path: "contextJson.startupSnapshot.stage",
    label: "Startup Snapshot Stage",
    type: "string",
    sourceVariable: "contextJson",
  },
  {
    path: "contextJson.startupSnapshot.location",
    label: "Startup Snapshot Location",
    type: "string",
    sourceVariable: "contextJson",
  },
  {
    path: "contextJson.startupSnapshot.website",
    label: "Startup Snapshot Website",
    type: "string",
    sourceVariable: "contextJson",
  },
  {
    path: "contextJson.startupSnapshot.founderNames",
    label: "Startup Snapshot Founder Names",
    type: "array",
    sourceVariable: "contextJson",
  },
  {
    path: "contextJson.startupSnapshot.adminFeedback",
    label: "Startup Snapshot Admin Feedback",
    type: "array",
    sourceVariable: "contextJson",
  },
];

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
  "enrichment.gapFill": {
    requiredPhases: [PipelinePhase.EXTRACTION],
    fields: [
      { path: "companyName", label: "Company Name", type: "string", sourceVariable: "companyName" },
      { path: "tagline", label: "Tagline", type: "string", sourceVariable: "tagline" },
      { path: "description", label: "Description", type: "string", sourceVariable: "description" },
      { path: "industry", label: "Industry", type: "string", sourceVariable: "industry" },
      { path: "stage", label: "Stage", type: "string", sourceVariable: "stage" },
      { path: "website", label: "Website", type: "string", sourceVariable: "website" },
      { path: "location", label: "Location", type: "string", sourceVariable: "location" },
      { path: "foundingDate", label: "Founding Date", type: "string", sourceVariable: "foundingDate" },
      { path: "teamSize", label: "Team Size", type: "number", sourceVariable: "teamSize" },
      { path: "fundingTarget", label: "Funding Target", type: "number", sourceVariable: "fundingTarget" },
      { path: "sectorIndustry", label: "Sector Industry", type: "string", sourceVariable: "sectorIndustry" },
      { path: "productDescription", label: "Product Description", type: "string", sourceVariable: "productDescription" },
      { path: "contactName", label: "Contact Name", type: "string", sourceVariable: "contactName" },
      { path: "contactEmail", label: "Contact Email", type: "string", sourceVariable: "contactEmail" },
      { path: "teamMembers", label: "Team Members", type: "array", sourceVariable: "teamMembers" },
      { path: "extractionData", label: "Extraction Data", type: "object", sourceVariable: "extractionData" },
      { path: "formContext", label: "Form Context", type: "object", sourceVariable: "formContext" },
      { path: "emailContext", label: "Email Context", type: "object", sourceVariable: "emailContext" },
      { path: "resolvedFromInternal", label: "Resolved From Internal", type: "object", sourceVariable: "resolvedFromInternal" },
      { path: "remainingGaps", label: "Remaining Gaps", type: "array", sourceVariable: "remainingGaps" },
      { path: "suspiciousFields", label: "Suspicious Fields", type: "array", sourceVariable: "suspiciousFields" },
      { path: "searchResults", label: "Search Results", type: "object", sourceVariable: "searchResults" },
    ],
    notes: [
      "Gap fill should prioritize internal sources before external web evidence.",
      "Search results should only be used for unresolved gaps after internal resolution.",
    ],
  },
  "research.team": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING],
    fields: [
      { path: "companyName", label: "Company Name", type: "string", sourceVariable: "companyName" },
      { path: "sector", label: "Sector", type: "string", sourceVariable: "sector" },
      { path: "teamMembers", label: "Team Members", type: "string", sourceVariable: "teamMembers" },
      { path: "deckClaims", label: "Deck Claims", type: "string", sourceVariable: "deckClaims" },
      { path: "adminGuidance", label: "Admin Guidance", type: "string", sourceVariable: "adminGuidance" },
      { path: "contextJson", label: "Full Context JSON (fallback)", type: "object", sourceVariable: "contextJson" },
    ],
    notes: ["Built from extraction/scraping context plus optional admin feedback.", "Named variables are canonical; contextJson remains for backward compatibility."],
  },
  "research.market": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING],
    fields: [
      { path: "companyName", label: "Company Name", type: "string", sourceVariable: "companyName" },
      { path: "sector", label: "Sector", type: "string", sourceVariable: "sector" },
      { path: "location", label: "Location", type: "string", sourceVariable: "location" },
      { path: "claimedTam", label: "Claimed TAM", type: "string", sourceVariable: "claimedTam" },
      { path: "claimedGrowthRate", label: "Claimed Growth Rate", type: "string", sourceVariable: "claimedGrowthRate" },
      { path: "targetMarket", label: "Target Market", type: "string", sourceVariable: "targetMarket" },
      { path: "productDescription", label: "Product Description", type: "string", sourceVariable: "productDescription" },
      { path: "adminGuidance", label: "Admin Guidance", type: "string", sourceVariable: "adminGuidance" },
      { path: "contextJson", label: "Full Context JSON (fallback)", type: "object", sourceVariable: "contextJson" },
    ],
    notes: ["Built from extraction/scraping context plus optional admin feedback.", "Named variables are canonical; contextJson remains for backward compatibility."],
  },
  "research.product": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING],
    fields: [
      { path: "companyName", label: "Company Name", type: "string", sourceVariable: "companyName" },
      { path: "sector", label: "Sector", type: "string", sourceVariable: "sector" },
      { path: "website", label: "Website", type: "string", sourceVariable: "website" },
      { path: "productDescription", label: "Product Description", type: "string", sourceVariable: "productDescription" },
      { path: "claimedTechStack", label: "Claimed Tech Stack", type: "string", sourceVariable: "claimedTechStack" },
      { path: "adminGuidance", label: "Admin Guidance", type: "string", sourceVariable: "adminGuidance" },
      { path: "contextJson", label: "Full Context JSON (fallback)", type: "object", sourceVariable: "contextJson" },
    ],
    notes: ["Built from extraction/scraping context plus optional admin feedback.", "Named variables are canonical; contextJson remains for backward compatibility."],
  },
  "research.news": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING],
    fields: [
      { path: "companyName", label: "Company Name", type: "string", sourceVariable: "companyName" },
      { path: "website", label: "Website", type: "string", sourceVariable: "website" },
      { path: "founderNames", label: "Founder Names", type: "string", sourceVariable: "founderNames" },
      { path: "adminGuidance", label: "Admin Guidance", type: "string", sourceVariable: "adminGuidance" },
      { path: "contextJson", label: "Full Context JSON (fallback)", type: "object", sourceVariable: "contextJson" },
    ],
    notes: ["Built from extraction/scraping context plus optional admin feedback.", "Named variables are canonical; contextJson remains for backward compatibility."],
  },
  "research.competitor": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING],
    fields: [
      { path: "companyName", label: "Company Name", type: "string", sourceVariable: "companyName" },
      { path: "sector", label: "Sector", type: "string", sourceVariable: "sector" },
      { path: "website", label: "Website", type: "string", sourceVariable: "website" },
      { path: "productDescription", label: "Product Description", type: "string", sourceVariable: "productDescription" },
      { path: "knownCompetitors", label: "Known Competitors", type: "string", sourceVariable: "knownCompetitors" },
      { path: "claimedDifferentiation", label: "Claimed Differentiation", type: "string", sourceVariable: "claimedDifferentiation" },
      { path: "adminGuidance", label: "Admin Guidance", type: "string", sourceVariable: "adminGuidance" },
      { path: "contextJson", label: "Full Context JSON (fallback)", type: "object", sourceVariable: "contextJson" },
    ],
    notes: ["Built from extraction/scraping context plus optional admin feedback.", "Named variables are canonical; contextJson remains for backward compatibility."],
  },
  "evaluation.team": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      ...EVALUATION_STARTUP_SNAPSHOT_FIELDS,
      { path: "contextJson.teamMembers", label: "Team Members", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.linkedinProfiles", label: "LinkedIn Profiles", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.researchReportText", label: "Research Report Text", type: "string", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: [
      "Context sections are generated from evaluation context object fields in deterministic order.",
      "Startup Snapshot baseline is always prepended as the first section.",
    ],
  },
  "evaluation.market": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      ...EVALUATION_STARTUP_SNAPSHOT_FIELDS,
      { path: "contextJson.researchReportText", label: "Research Report Text", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.competitiveLandscape", label: "Competitive Landscape", type: "array", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: [
      "Context includes stage-aware extraction output and research market payloads.",
      "Startup Snapshot baseline is always prepended as the first section.",
    ],
  },
  "evaluation.product": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      ...EVALUATION_STARTUP_SNAPSHOT_FIELDS,
      { path: "contextJson.researchReportText", label: "Research Report Text", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.websiteProductPages", label: "Website Product Pages", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.extractedFeatures", label: "Extracted Features", type: "array", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: [
      "Context combines deck, scrape, and research product evidence.",
      "Startup Snapshot baseline is always prepended as the first section.",
    ],
  },
  "evaluation.traction": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      ...EVALUATION_STARTUP_SNAPSHOT_FIELDS,
      { path: "contextJson.tractionMetrics", label: "Traction Metrics", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.researchReportText", label: "Research Report Text", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.previousFunding", label: "Previous Funding", type: "array", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: [
      "Context highlights traction signals from scraped proof points and news.",
      "Startup Snapshot baseline is always prepended as the first section.",
    ],
  },
  "evaluation.businessModel": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      ...EVALUATION_STARTUP_SNAPSHOT_FIELDS,
      { path: "contextJson.researchReportText", label: "Research Report Text", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.pricing", label: "Pricing", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.unitEconomics", label: "Unit Economics", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.marketContext", label: "Market Context", type: "object", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: [
      "Context combines deck business model data and multi-agent research context.",
      "Startup Snapshot baseline is always prepended as the first section.",
    ],
  },
  "evaluation.gtm": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      ...EVALUATION_STARTUP_SNAPSHOT_FIELDS,
      { path: "contextJson.researchReportText", label: "Research Report Text", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.websiteMarketingPages", label: "Website Marketing Pages", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.distributionChannels", label: "Distribution Channels", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.customerAcquisitionStrategy", label: "Customer Acquisition Strategy", type: "string", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: [
      "Context includes market/product/competitor-derived GTM signals.",
      "Startup Snapshot baseline is always prepended as the first section.",
    ],
  },
  "evaluation.financials": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      ...EVALUATION_STARTUP_SNAPSHOT_FIELDS,
      { path: "contextJson.researchReportText", label: "Research Report Text", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.financialProjections", label: "Financial Projections", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.previousFunding", label: "Previous Funding", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.currentValuation", label: "Current Valuation", type: "number", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: [
      "Context captures valuation/fundraise assumptions and external funding references.",
      "Startup Snapshot baseline is always prepended as the first section.",
    ],
  },
  "evaluation.competitiveAdvantage": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      ...EVALUATION_STARTUP_SNAPSHOT_FIELDS,
      { path: "contextJson.researchReportText", label: "Research Report Text", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.competitiveLandscape", label: "Competitive Landscape", type: "array", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: [
      "Context aggregates defensibility evidence across team, market, and product research.",
      "Startup Snapshot baseline is always prepended as the first section.",
    ],
  },
  "evaluation.legal": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      ...EVALUATION_STARTUP_SNAPSHOT_FIELDS,
      { path: "contextJson.researchReportText", label: "Research Report Text", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.complianceMentions", label: "Compliance Mentions", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.regulatoryLandscape", label: "Regulatory Landscape", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.corporateStructure", label: "Corporate Structure", type: "object", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: [
      "Context includes legal/compliance signals from extraction, scraping, and news.",
      "Startup Snapshot baseline is always prepended as the first section.",
    ],
  },
  "evaluation.dealTerms": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      ...EVALUATION_STARTUP_SNAPSHOT_FIELDS,
      { path: "contextJson.researchReportText", label: "Research Report Text", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.fundingTarget", label: "Funding Target", type: "number", sourceVariable: "contextJson" },
      { path: "contextJson.currentValuation", label: "Current Valuation", type: "number", sourceVariable: "contextJson" },
      { path: "contextJson.raiseType", label: "Raise Type", type: "string", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: [
      "Context includes deal terms from extraction plus competitor/market comparables.",
      "Startup Snapshot baseline is always prepended as the first section.",
    ],
  },
  "evaluation.exitPotential": {
    requiredPhases: [PipelinePhase.EXTRACTION, PipelinePhase.SCRAPING, PipelinePhase.RESEARCH],
    fields: [
      ...EVALUATION_STARTUP_SNAPSHOT_FIELDS,
      { path: "contextJson.researchReportText", label: "Research Report Text", type: "string", sourceVariable: "contextJson" },
      { path: "contextJson.marketSize", label: "Market Size", type: "object", sourceVariable: "contextJson" },
      { path: "contextJson.competitorMandA", label: "Competitor M&A", type: "array", sourceVariable: "contextJson" },
      { path: "contextJson.exitOpportunities", label: "Exit Opportunities", type: "array", sourceVariable: "contextJson" },
      { path: "contextSections", label: "Formatted Context Sections", type: "string", sourceVariable: "contextSections" },
    ],
    notes: [
      "Context combines market size, M&A signals, and long-term scalability evidence.",
      "Startup Snapshot baseline is always prepended as the first section.",
    ],
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
  "pipeline.orchestrator": {
    requiredPhases: [],
    fields: [
      { path: "startupId", label: "Startup ID", type: "string", sourceVariable: "startupId" },
      { path: "autoApprove", label: "Auto Approve", type: "string", sourceVariable: "autoApprove" },
      { path: "companyName", label: "Company Name", type: "string", sourceVariable: "companyName" },
    ],
    notes: ["Pipeline orchestrator coordinates all analysis agents for a startup evaluation."],
  },
  "extraction.linkedin": {
    requiredPhases: [],
    fields: [
      { path: "companyName", label: "Company Name", type: "string", sourceVariable: "companyName" },
      { path: "website", label: "Website", type: "string", sourceVariable: "website" },
      { path: "discoveredTeamMembers", label: "Discovered Team Members", type: "string", sourceVariable: "discoveredTeamMembers" },
      { path: "existingTeamMembers", label: "Existing Team Members", type: "string", sourceVariable: "existingTeamMembers" },
    ],
    notes: ["LinkedIn enrichment stage discovers and enriches team member profiles."],
  },
  "research.orchestrator": {
    requiredPhases: [],
    fields: [
      { path: "companyName", label: "Company Name", type: "string", sourceVariable: "companyName" },
      { path: "sector", label: "Sector", type: "string", sourceVariable: "sector" },
      { path: "website", label: "Website", type: "string", sourceVariable: "website" },
      { path: "deckContent", label: "Deck Content", type: "string", sourceVariable: "deckContent" },
      { path: "websiteContent", label: "Website Content", type: "string", sourceVariable: "websiteContent" },
      { path: "teamMembers", label: "Team Members", type: "string", sourceVariable: "teamMembers" },
    ],
    notes: ["Research orchestrator coordinates 4 specialized deep research agents."],
  },
  "matching.investorThesis": {
    requiredPhases: [],
    fields: [
      { path: "fundName", label: "Fund Name", type: "string", sourceVariable: "fundName" },
      { path: "fundDescription", label: "Fund Description", type: "string", sourceVariable: "fundDescription" },
      { path: "stages", label: "Target Stages", type: "string", sourceVariable: "stages" },
      { path: "sectors", label: "Target Sectors", type: "string", sourceVariable: "sectors" },
      { path: "geographies", label: "Target Geographies", type: "string", sourceVariable: "geographies" },
      { path: "businessModels", label: "Business Models", type: "string", sourceVariable: "businessModels" },
      { path: "checkSizeMin", label: "Check Size Min", type: "string", sourceVariable: "checkSizeMin" },
      { path: "checkSizeMax", label: "Check Size Max", type: "string", sourceVariable: "checkSizeMax" },
      { path: "minRevenue", label: "Min Revenue", type: "string", sourceVariable: "minRevenue" },
      { path: "minGrowthRate", label: "Min Growth Rate", type: "string", sourceVariable: "minGrowthRate" },
      { path: "thesisNarrative", label: "Thesis Narrative", type: "string", sourceVariable: "thesisNarrative" },
      { path: "antiPortfolio", label: "Anti-Portfolio", type: "string", sourceVariable: "antiPortfolio" },
      { path: "portfolioCompanies", label: "Portfolio Companies", type: "string", sourceVariable: "portfolioCompanies" },
    ],
    notes: ["Investor thesis generation creates holistic thesis summaries from investor profile data."],
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
  "clara.agent": {
    requiredPhases: [],
    fields: [
      { path: "fromEmail", label: "From Email", type: "string", sourceVariable: "fromEmail" },
      { path: "subject", label: "Subject", type: "string", sourceVariable: "subject" },
      { path: "body", label: "Body", type: "string", sourceVariable: "body" },
      { path: "historyBlock", label: "History Block", type: "string", sourceVariable: "historyBlock" },
    ],
    notes: ["Clara agent loop context. Tools handle data retrieval; prompt provides sender identity and conversation history."],
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
    const renderedSystemPromptWithDynamic = await this.applyDynamicVariables(
      renderedSystemPrompt,
      resolved.startupId,
    );
    const renderedUserPromptWithDynamic = await this.applyDynamicVariables(
      renderedUserPrompt,
      resolved.startupId,
    );
    const isEvaluationPrompt = key.startsWith("evaluation.");
    const parsedContextJson = isEvaluationPrompt
      ? this.parseContextJsonVariable(resolved.variables.contextJson)
      : null;
    const parsedContextSections = isEvaluationPrompt
      ? this.parseContextSectionsVariable(resolved.variables.contextSections)
      : null;
    const sectionTitles =
      parsedContextSections?.map((section) => section.title) ?? [];

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
        renderedSystemPromptWithDynamic,
        renderedUserPromptWithDynamic,
      },
      model,
      resolvedVariables: resolved.variables,
      parsedContextJson,
      parsedContextSections,
      sectionTitles,
      hashes: {
        renderedSystemPrompt: this.sha256(renderedSystemPrompt),
        renderedUserPrompt: this.sha256(renderedUserPrompt),
        renderedSystemPromptWithDynamic: this.sha256(
          renderedSystemPromptWithDynamic,
        ),
        renderedUserPromptWithDynamic: this.sha256(
          renderedUserPromptWithDynamic,
        ),
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

  async previewPipelineContexts(input: {
    startupId: string;
    stage?: StartupStage | null;
  }) {
    const startupId = this.requireStartupId(input.startupId, "research.team");
    const extraction = await this.requirePhaseResult<ExtractionResult>(
      startupId,
      PipelinePhase.EXTRACTION,
      "research.team",
    );
    const effectiveStage = this.normalizeStage(input.stage ?? extraction.stage);
    const pipelinePromptKeys = this.getPipelinePromptKeys();
    const agents: PipelineContextAgentPreview[] = [];

    for (const promptKey of pipelinePromptKeys) {
      const resolved = await this.resolveVariablesForKey(promptKey, {
        startupId,
        stage: effectiveStage,
      });

      const promptConfig = await this.promptService.resolve({
        key: promptKey,
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
      const renderedSystemPromptWithDynamic = await this.applyDynamicVariables(
        renderedSystemPrompt,
        resolved.startupId,
      );
      const renderedUserPromptWithDynamic = await this.applyDynamicVariables(
        renderedUserPrompt,
        resolved.startupId,
      );
      const parsedContextJson = this.parseContextJsonVariable(
        resolved.variables.contextJson,
      );
      const parsedContextSections = this.parseContextSectionsVariable(
        resolved.variables.contextSections,
      );

      agents.push({
        phase: promptKey.startsWith("research.")
          ? PipelinePhase.RESEARCH
          : PipelinePhase.EVALUATION,
        agentKey: this.getPipelineAgentKeyFromPromptKey(promptKey),
        promptKey,
        promptSource: promptConfig.source,
        promptRevisionId: promptConfig.revisionId,
        effectiveStage: resolved.stage,
        resolvedVariables: resolved.variables,
        renderedSystemPrompt,
        renderedUserPrompt,
        renderedSystemPromptWithDynamic,
        renderedUserPromptWithDynamic,
        parsedContextJson,
        parsedContextSections,
        hashes: {
          renderedSystemPrompt: this.sha256(renderedSystemPrompt),
          renderedUserPrompt: this.sha256(renderedUserPrompt),
          renderedSystemPromptWithDynamic: this.sha256(
            renderedSystemPromptWithDynamic,
          ),
          renderedUserPromptWithDynamic: this.sha256(
            renderedUserPromptWithDynamic,
          ),
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
      });
    }

    return {
      startupId,
      effectiveStage,
      generatedAt: new Date().toISOString(),
      agents,
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

    if (key === "clara.agent") {
      return {
        stage: this.normalizeStage(input.stage),
        startupId: input.startupId ?? null,
        variables: {
          fromEmail: input.fromEmail ?? "unknown@example.com",
          subject: input.subject ?? "(no subject)",
          body: input.body ?? "(empty)",
          historyBlock: input.historyBlock ?? "No prior conversation.",
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
    const { templateVariables } = buildResearchPromptVariables({
      key: agentKey,
      agentName: agent.name,
      pipelineInput,
      agentContext: context,
      adminFeedback: feedbackContext,
    });

    return {
      stage: this.normalizeStage(input.stage ?? extraction.stage),
      startupId,
      variables: {
        ...templateVariables,
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
      startupSnapshot: buildEvaluationCommonBaseline({
        extraction,
        adminFeedback: feedbackNotes,
      }),
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
    const modelName = key.startsWith("research.")
      ? "gemini-3-flash-preview"
      : this.aiConfig.getModelForPurpose(purpose);
    const provider = this.resolveProviderForModel(modelName);

    const supportedSearchModes: Array<
      | "off"
      | "provider_grounded_search"
      | "brave_tool_search"
      | "provider_and_brave_search"
    > =
      purpose === ModelPurpose.RESEARCH && (provider === "google" || provider === "openai")
        ? [
            "off",
            "provider_grounded_search",
            "brave_tool_search",
            "provider_and_brave_search",
          ]
        : purpose === ModelPurpose.RESEARCH
          ? ["off", "brave_tool_search"]
        : ["off"];

    return {
      purpose,
      modelName,
      provider,
      searchMode:
        supportedSearchModes.includes("provider_grounded_search")
          ? "provider_grounded_search"
          : supportedSearchModes.includes("brave_tool_search")
            ? "brave_tool_search"
          : "off",
      supportedSearchModes,
    };
  }

  private resolveModelPurpose(key: AiPromptKey): ModelPurpose {
    if (key === "enrichment.gapFill") {
      return ModelPurpose.ENRICHMENT;
    }

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

  private getPipelinePromptKeys(): PipelinePromptKey[] {
    return AI_PROMPT_KEYS.filter(
      (key): key is PipelinePromptKey =>
        key.startsWith("research.") || key.startsWith("evaluation."),
    );
  }

  private getPipelineAgentKeyFromPromptKey(key: PipelinePromptKey): string {
    if (key.startsWith("research.")) {
      return this.getResearchAgentKeyFromPromptKey(
        key as Extract<AiPromptKey, `research.${string}`>,
      );
    }

    return this.getEvaluationAgentFromPromptKey(
      key as Extract<AiPromptKey, `evaluation.${string}`>,
    ).evaluationKey;
  }

  private parseContextJsonVariable(value: TemplateVariable): unknown | null {
    if (typeof value !== "string") {
      return null;
    }

    const payload = this.unwrapUserProvidedDataWrapper(value.trim());
    if (!payload) {
      return null;
    }

    return this.tryParseJson(payload) ?? payload;
  }

  private parseContextSectionsVariable(
    value: TemplateVariable,
  ): ParsedContextSection[] | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const sections: ParsedContextSection[] = [];
    const chunks = normalized.split(/\n\n(?=##\s)/g);

    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed.startsWith("## ")) {
        continue;
      }

      const firstLineBreak = trimmed.indexOf("\n");
      const title =
        firstLineBreak === -1
          ? trimmed.slice(3).trim()
          : trimmed.slice(3, firstLineBreak).trim();
      const body =
        firstLineBreak === -1
          ? ""
          : trimmed.slice(firstLineBreak + 1).trim();
      const payload = this.unwrapUserProvidedDataWrapper(body);

      sections.push({
        title,
        data: this.tryParseJson(payload) ?? payload,
      });
    }

    return sections.length > 0 ? sections : null;
  }

  private unwrapUserProvidedDataWrapper(value: string): string {
    const trimmed = value.trim();
    const match = trimmed.match(
      /^<user_provided_data>\s*([\s\S]*?)\s*<\/user_provided_data>$/i,
    );

    return match?.[1]?.trim() ?? trimmed;
  }

  private tryParseJson(value: string): unknown | null {
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
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

  private async applyDynamicVariables(
    template: string,
    startupId: string | null,
  ): Promise<string> {
    if (!startupId) {
      return template;
    }

    const tokens = Array.from(
      template.matchAll(/{{\s*([a-zA-Z0-9_-]+(?:\.[^{}|\s]+)?(?:\|[a-zA-Z0-9_-]+)?)\s*}}/g),
    ).map((match) => match[1]).filter((value): value is string => Boolean(value));

    if (tokens.length === 0) {
      return template;
    }

    const uniqueTokens = Array.from(new Set(tokens));
    const tokenValues = new Map<string, string>();
    const phaseCache = new Map<PipelinePhase, unknown | null>();

    for (const token of uniqueTokens) {
      const [rawToken, filter] = token.split("|");
      const [nodeId, ...fieldPathParts] = (rawToken ?? "").split(".");
      if (!nodeId) {
        continue;
      }

      const fieldPath = fieldPathParts.length > 0 ? fieldPathParts.join(".") : null;

      const value = await this.resolveDynamicTokenValue(
        startupId,
        nodeId,
        fieldPath,
        filter,
        phaseCache,
      );
      tokenValues.set(token, value);
    }

    let output = template;
    for (const [token, replacement] of tokenValues.entries()) {
      const pattern = new RegExp(`{{\\s*${this.escapeRegex(token)}\\s*}}`, "g");
      output = output.replace(pattern, replacement);
    }

    return output;
  }

  private async resolveDynamicTokenValue(
    startupId: string,
    nodeId: string,
    fieldPath: string | null,
    filter: string | undefined,
    phaseCache: Map<PipelinePhase, unknown | null>,
  ): Promise<string> {
    const resolved = await this.resolveNodeOutput(startupId, nodeId, phaseCache);
    if (resolved === null || resolved === undefined) {
      return "[not available]";
    }

    const value = fieldPath
      ? this.deepGet(resolved, fieldPath.replace(/\[\]/g, "").split("."))
      : resolved;
    if (value === undefined) {
      return "[not available]";
    }

    if (typeof value === "string") {
      return value;
    }

    if (filter === "pretty") {
      return JSON.stringify(value, null, 2);
    }

    return JSON.stringify(value);
  }

  private async resolveNodeOutput(
    startupId: string,
    nodeId: string,
    phaseCache: Map<PipelinePhase, unknown | null>,
  ): Promise<unknown> {
    const loadPhase = async (phase: PipelinePhase) => {
      if (!phaseCache.has(phase)) {
        const result = await this.pipelineState.getPhaseResult(startupId, phase);
        phaseCache.set(phase, result ?? null);
      }

      return phaseCache.get(phase) ?? null;
    };

    if (nodeId === "extract_fields") {
      return loadPhase(PipelinePhase.EXTRACTION);
    }

    if (nodeId === "scrape_website") {
      return loadPhase(PipelinePhase.SCRAPING);
    }

    if (nodeId === "gap_fill_hybrid" || nodeId === "linkedin_enrichment") {
      return loadPhase(PipelinePhase.ENRICHMENT);
    }

    if (nodeId === "synthesis_final") {
      return loadPhase(PipelinePhase.SYNTHESIS);
    }

    if (nodeId.startsWith("research_")) {
      const key = nodeId.replace(/^research_/, "");
      const research = (await loadPhase(PipelinePhase.RESEARCH)) as
        | Record<string, unknown>
        | null;
      return research?.[key] ?? null;
    }

    if (nodeId.startsWith("evaluation_")) {
      const rawKey = nodeId.replace(/^evaluation_/, "");
      const key = rawKey.replace(/_([a-z])/g, (_, char: string) =>
        char.toUpperCase(),
      );
      const evaluation = (await loadPhase(PipelinePhase.EVALUATION)) as
        | Record<string, unknown>
        | null;
      return evaluation?.[key] ?? null;
    }

    return null;
  }

  private deepGet(target: unknown, segments: string[]): unknown {
    let current = target;

    for (const segment of segments) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (Array.isArray(current)) {
        const numericIndex = Number(segment);
        if (Number.isInteger(numericIndex)) {
          current = current[numericIndex];
          continue;
        }

        current = current
          .map((value) =>
            value && typeof value === "object"
              ? (value as Record<string, unknown>)[segment]
              : undefined,
          )
          .filter((value) => value !== undefined);
        continue;
      }

      if (typeof current === "object") {
        current = (current as Record<string, unknown>)[segment];
        continue;
      }

      return undefined;
    }

    return current;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
