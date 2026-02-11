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
import { AiPromptService } from "./services/ai-prompt.service";
import {
  EvaluationProcessor,
  ExtractionProcessor,
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
import { PipelineFeedbackService } from "./services/pipeline-feedback.service";
import { PdfTextExtractorService } from "./services/pdf-text-extractor.service";
import { LinkedinEnrichmentService } from "./services/linkedin-enrichment.service";
import { InvestorMatchingService } from "./services/investor-matching.service";
import { LocationNormalizerService } from "./services/location-normalizer.service";
import { MemoGeneratorService } from "./services/memo-generator.service";
import { ResearchService } from "./services/research.service";
import { ScoreComputationService } from "./services/score-computation.service";
import { ScrapingCacheService } from "./services/scraping-cache.service";
import { ScrapingService } from "./services/scraping.service";
import { SynthesisAgent } from "./agents/synthesis";
import { SynthesisService } from "./services/synthesis.service";
import { WebsiteScraperService } from "./services/website-scraper.service";

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
    AiPromptService,
    PipelineStateService,
    PipelineFeedbackService,
    PipelineService,
    GeminiResearchService,
    ExtractionService,
    PdfTextExtractorService,
    MistralOcrService,
    FieldExtractorService,
    ScrapingService,
    WebsiteScraperService,
    LinkedinEnrichmentService,
    ScrapingCacheService,
    ResearchService,
    SynthesisAgent,
    ScoreComputationService,
    LocationNormalizerService,
    InvestorMatchingService,
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
    ExtractionProcessor,
    ScrapingProcessor,
    ResearchProcessor,
    EvaluationProcessor,
    SynthesisProcessor,
  ],
  exports: [
    AiProviderService,
    AiConfigService,
    AiPromptService,
    PipelineStateService,
    PipelineFeedbackService,
    PipelineService,
  ],
})
export class AiModule {}
