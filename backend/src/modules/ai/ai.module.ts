import { Global, Module } from "@nestjs/common";
import { DatabaseModule } from "../../database";
import { NotificationModule } from "../../notification/notification.module";
import { QueueModule } from "../../queue";
import { UnipileModule } from "../integrations/unipile/unipile.module";
import { StartupModule } from "../startup";
import { OrchestratorModule } from "./orchestrator";
import { AiProviderService } from "./providers/ai-provider.service";
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
} from "./agents/evaluation";
import { AiConfigService } from "./services/ai-config.service";
import { AiDebugLogService } from "./services/ai-debug-log.service";
import { AiModelConfigService } from "./services/ai-model-config.service";
import { AiModelOverrideService } from "./services/ai-model-override.service";
import { AiPromptService } from "./services/ai-prompt.service";
import { AiPromptRuntimeService } from "./services/ai-prompt-runtime.service";
import {
  ClassificationProcessor,
  EnrichmentProcessor,
  EvaluationProcessor,
  ExtractionProcessor,
  MatchingProcessor,
  ResearchProcessor,
  ScrapingProcessor,
  SynthesisProcessor,
} from "./processors";
import { EvaluationAgentRegistryService } from "./services/evaluation-agent-registry.service";
import { EvaluationService } from "./services/evaluation.service";
import { ExtractionService } from "./services/extraction.service";
import { FieldExtractorService } from "./services/field-extractor.service";
import { GeminiResearchService } from "./services/gemini-research.service";
import { MistralOcrService } from "./services/mistral-ocr.service";
import { PipelineService } from "./services/pipeline.service";
import { PipelineStateService } from "./services/pipeline-state.service";
import { PipelineStateSnapshotService } from "./services/pipeline-state-snapshot.service";
import { PipelineFeedbackService } from "./services/pipeline-feedback.service";
import { PipelineAgentTraceService } from "./services/pipeline-agent-trace.service";
import { PdfTextExtractorService } from "./services/pdf-text-extractor.service";
import { DocumentClassificationService } from "./services/document-classification.service";
import { ExcelTextExtractorService } from "./services/excel-text-extractor.service";
import { PptxTextExtractorService } from "./services/pptx-text-extractor.service";
import { LinkedinEnrichmentService } from "./services/linkedin-enrichment.service";
import { InvestorMatchingService } from "./services/investor-matching.service";
import { LocationNormalizerService } from "./services/location-normalizer.service";
import { MemoGeneratorService } from "./services/memo-generator.service";
import { ResearchParametersService } from "./services/research-parameters.service";
import { ResearchService } from "./services/research.service";
import { ScoreComputationService } from "./services/score-computation.service";
import { ScrapingCacheService } from "./services/scraping-cache.service";
import { ScrapingService } from "./services/scraping.service";
import { MemoSynthesisAgent } from "./agents/synthesis/memo-synthesis.agent";
import { ReportSynthesisAgent } from "./agents/synthesis/report-synthesis.agent";
import { SynthesisService } from "./services/synthesis.service";
import { StartupMatchingPipelineService } from "./services/startup-matching-pipeline.service";
import { WebsiteScraperService } from "./services/website-scraper.service";
import { BraveSearchService } from "./services/brave-search.service";
import { EnrichmentService } from "./services/enrichment.service";
import { ClaraEmailContextService } from "./services/clara-email-context.service";
import { AgentSchemaRegistryService } from "./services/agent-schema-registry.service";
import { AgentConfigService } from "./services/agent-config.service";
import { DynamicFlowCatalogService } from "./services/dynamic-flow-catalog.service";
import { DynamicAgentRunnerService } from "./services/dynamic-agent-runner.service";
import { AiModelExecutionService } from "./services/ai-model-execution.service";
import { PipelineTemplateService } from "./services/pipeline-template.service";
import { SchemaCompilerService } from "./services/schema-compiler.service";
import { EvaluationInputResolverService } from "./services/evaluation-input-resolver.service";
import { OpenAiDeepResearchService } from "./services/openai-deep-research.service";
import { OpenAiDirectClientService } from "./services/openai-direct-client.service";
import { OpenAiTextGenerationService } from "./services/openai-text-generation.service";

@Global()
@Module({
  imports: [
    DatabaseModule,
    QueueModule,
    NotificationModule,
    UnipileModule,
    StartupModule,
    OrchestratorModule,
  ],
  providers: [
    AiProviderService,
    AiConfigService,
    AiDebugLogService,
    AiModelConfigService,
    AiModelOverrideService,
    AiPromptService,
    AiPromptRuntimeService,
    SchemaCompilerService,
    AgentSchemaRegistryService,
    AgentConfigService,
    DynamicFlowCatalogService,
    DynamicAgentRunnerService,
    AiModelExecutionService,
    PipelineTemplateService,
    EvaluationInputResolverService,
    PipelineStateService,
    PipelineStateSnapshotService,
    PipelineFeedbackService,
    PipelineAgentTraceService,
    PipelineService,
    GeminiResearchService,
    OpenAiDeepResearchService,
    OpenAiDirectClientService,
    OpenAiTextGenerationService,
    DocumentClassificationService,
    ExtractionService,
    PdfTextExtractorService,
    PptxTextExtractorService,
    ExcelTextExtractorService,
    MistralOcrService,
    FieldExtractorService,
    ScrapingService,
    WebsiteScraperService,
    LinkedinEnrichmentService,
    BraveSearchService,
    EnrichmentService,
    ClaraEmailContextService,
    ScrapingCacheService,
    ResearchParametersService,
    ResearchService,
    MemoSynthesisAgent,
    ReportSynthesisAgent,
    ScoreComputationService,
    LocationNormalizerService,
    InvestorMatchingService,
    StartupMatchingPipelineService,
    MemoGeneratorService,
    TeamEvaluationAgent,
    MarketEvaluationAgent,
    ProductEvaluationAgent,
    TractionEvaluationAgent,
    BusinessModelEvaluationAgent,
    GtmEvaluationAgent,
    FinancialsEvaluationAgent,
    CompetitiveAdvantageEvaluationAgent,
    LegalEvaluationAgent,
    DealTermsEvaluationAgent,
    ExitPotentialEvaluationAgent,
    EvaluationAgentRegistryService,
    EvaluationService,
    SynthesisService,
    ClassificationProcessor,
    ExtractionProcessor,
    EnrichmentProcessor,
    ScrapingProcessor,
    ResearchProcessor,
    EvaluationProcessor,
    SynthesisProcessor,
    MatchingProcessor,
  ],
  exports: [
    AiProviderService,
    AiConfigService,
    AiModelConfigService,
    AiModelOverrideService,
    AiPromptService,
    AiPromptRuntimeService,
    SchemaCompilerService,
    AgentSchemaRegistryService,
    AgentConfigService,
    DynamicFlowCatalogService,
    DynamicAgentRunnerService,
    AiModelExecutionService,
    PipelineTemplateService,
    EvaluationInputResolverService,
    OpenAiDeepResearchService,
    OpenAiDirectClientService,
    OpenAiTextGenerationService,
    DocumentClassificationService,
    PipelineStateService,
    PipelineStateSnapshotService,
    PipelineFeedbackService,
    PipelineService,
    InvestorMatchingService,
    StartupMatchingPipelineService,
    OrchestratorModule,
  ],
})
export class AiModule {}
