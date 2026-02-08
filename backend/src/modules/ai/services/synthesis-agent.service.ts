import { Injectable } from "@nestjs/common";
import { generateText, Output } from "ai";
import { SynthesisSchema } from "../schemas";
import { ModelPurpose } from "../interfaces/pipeline.interface";
import type {
  EvaluationResult,
  ExtractionResult,
  ResearchResult,
  ScrapingResult,
  SynthesisResult,
} from "../interfaces/phase-results.interface";
import { AiProviderService } from "../providers/ai-provider.service";
import { AiConfigService } from "./ai-config.service";

export interface SynthesisAgentInput {
  extraction: ExtractionResult;
  scraping: ScrapingResult;
  research: ResearchResult;
  evaluation: EvaluationResult;
}

export type SynthesisAgentOutput = Omit<
  SynthesisResult,
  "sectionScores" | "investorMemoUrl" | "founderReportUrl"
>;

@Injectable()
export class SynthesisAgentService {
  constructor(
    private providers: AiProviderService,
    private aiConfig: AiConfigService,
  ) {}

  async generate(input: SynthesisAgentInput): Promise<SynthesisAgentOutput> {
    const { output } = await generateText({
      model: this.providers.resolveModelForPurpose(ModelPurpose.SYNTHESIS),
      output: Output.object({ schema: SynthesisSchema }),
      temperature: this.aiConfig.getSynthesisTemperature(),
      maxOutputTokens: this.aiConfig.getSynthesisMaxOutputTokens(),
      system: [
        "You are producing final venture diligence synthesis for an investment committee.",
        "Ground all claims in provided data and avoid unsupported assumptions.",
        "Return concise executive language and clear actionable recommendations.",
        "",
        "## Required Output Fields",
        "- executiveSummary, strengths, concerns, investmentThesis, nextSteps",
        "- confidenceLevel, recommendation, overallScore",
        "- investorMemo and founderReport (markdown format)",
        "- dataConfidenceNotes",
      ].join("\n"),
      prompt: this.buildSynthesisBrief(input),
    });

    return SynthesisSchema.parse(output);
  }

  private buildSynthesisBrief(input: SynthesisAgentInput): string {
    const { extraction, research, evaluation } = input;
    const sections: string[] = [];

    sections.push(
      [
        "## Company Overview",
        `Company: ${extraction.companyName}`,
        `Industry: ${extraction.industry}`,
        `Stage: ${extraction.stage}`,
        extraction.tagline ? `Tagline: ${extraction.tagline}` : "",
        extraction.location ? `Location: ${extraction.location}` : "",
        extraction.fundingAsk
          ? `Funding Ask: $${extraction.fundingAsk.toLocaleString()}`
          : "",
        extraction.valuation
          ? `Valuation: $${extraction.valuation.toLocaleString()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    if (extraction.founderNames.length > 0) {
      sections.push(
        [
          "## Team",
          ...extraction.founderNames.map((name) => `- ${name}`),
        ].join("\n"),
      );
    }

    if (research.team) {
      sections.push(
        [
          "## Team Research",
          research.team.previousCompanies.length
            ? `Previous companies: ${research.team.previousCompanies.join(", ")}`
            : "",
          research.team.achievements.length
            ? `Achievements: ${research.team.achievements.join("; ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    if (research.market) {
      sections.push(
        [
          "## Market Research",
          research.market.marketSize.tam
            ? `TAM: $${research.market.marketSize.tam.toLocaleString()}`
            : "",
          research.market.marketSize.sam
            ? `SAM: $${research.market.marketSize.sam.toLocaleString()}`
            : "",
          research.market.marketTrends.length
            ? `Trends: ${research.market.marketTrends.join("; ")}`
            : "",
          research.market.competitors.length
            ? `Competitors: ${research.market.competitors.map((c) => c.name).join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    if (research.product) {
      sections.push(
        [
          "## Product Research",
          research.product.features.length
            ? `Features: ${research.product.features.join(", ")}`
            : "",
          research.product.techStack.length
            ? `Tech Stack: ${research.product.techStack.join(", ")}`
            : "",
          research.product.customerReviews?.summary
            ? `Customer Reviews: ${research.product.customerReviews.summary}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    if (research.news) {
      sections.push(
        [
          "## News & Sentiment",
          `Sentiment: ${research.news.sentiment}`,
          research.news.articles.length
            ? `Recent articles: ${research.news.articles.map((a) => a.title).join("; ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    const evalEntries = Object.entries(evaluation).filter(
      ([key]) => key !== "summary",
    );
    if (evalEntries.length > 0) {
      const evalLines = evalEntries.map(([key, val]) => {
        const ev = val as {
          score: number;
          confidence: number;
          keyFindings?: string[];
          risks?: string[];
        };
        const findings = ev.keyFindings?.length
          ? ` | Findings: ${ev.keyFindings.join("; ")}`
          : "";
        const risks = ev.risks?.length
          ? ` | Risks: ${ev.risks.join("; ")}`
          : "";
        return `- ${key}: Score ${ev.score}/100 (confidence ${ev.confidence})${findings}${risks}`;
      });
      sections.push(["## Evaluation Scores", ...evalLines].join("\n"));
    }

    return sections.join("\n\n");
  }
}
