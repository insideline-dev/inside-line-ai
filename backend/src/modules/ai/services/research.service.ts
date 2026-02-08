import { Injectable } from "@nestjs/common";
import { RESEARCH_AGENTS } from "../agents/research";
import type {
  ResearchAgentConfig,
  ResearchAgentKey,
  ResearchPipelineInput,
} from "../interfaces/agent.interface";
import type {
  ResearchResult,
  SourceEntry,
} from "../interfaces/phase-results.interface";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { PipelineStateService } from "./pipeline-state.service";
import { GeminiResearchService } from "./gemini-research.service";

type ResearchAgentOutput =
  | NonNullable<ResearchResult["team"]>
  | NonNullable<ResearchResult["market"]>
  | NonNullable<ResearchResult["product"]>
  | NonNullable<ResearchResult["news"]>;

@Injectable()
export class ResearchService {
  constructor(
    private pipelineState: PipelineStateService,
    private geminiResearchService: GeminiResearchService,
  ) {}

  async run(startupId: string): Promise<ResearchResult> {
    const extraction = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.EXTRACTION,
    );
    const scraping = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.SCRAPING,
    );

    if (!extraction || !scraping) {
      throw new Error("Research requires extraction and scraping results");
    }

    const pipelineInput: ResearchPipelineInput = { extraction, scraping };
    const keys = Object.keys(RESEARCH_AGENTS) as ResearchAgentKey[];

    const settled = await Promise.allSettled(
      keys.map((key) => this.runSingleAgent(key, RESEARCH_AGENTS[key], pipelineInput)),
    );

    const result: ResearchResult = {
      team: null,
      market: null,
      product: null,
      news: null,
      sources: [],
      errors: [],
    };

    const dedupeSources = new Map<string, SourceEntry>();

    for (let index = 0; index < settled.length; index += 1) {
      const settledResult = settled[index];
      const key = keys[index];

      if (settledResult.status === "rejected") {
        result.errors.push({
          agent: key,
          error:
            settledResult.reason instanceof Error
              ? settledResult.reason.message
              : String(settledResult.reason),
        });
        continue;
      }

      const { output, sources, error } = settledResult.value;

      if (key === "team") {
        result.team = output as ResearchResult["team"];
      } else if (key === "market") {
        result.market = output as ResearchResult["market"];
      } else if (key === "product") {
        result.product = output as ResearchResult["product"];
      } else {
        result.news = output as ResearchResult["news"];
      }

      for (const source of sources) {
        const sourceKey = source.url ?? source.name;
        if (!dedupeSources.has(sourceKey)) {
          dedupeSources.set(sourceKey, source);
        }
      }

      if (error) {
        result.errors.push({ agent: key, error });
      }
    }

    result.sources = Array.from(dedupeSources.values());

    return result;
  }

  private async runSingleAgent(
    key: ResearchAgentKey,
    agent: ResearchAgentConfig<ResearchAgentOutput>,
    pipelineInput: ResearchPipelineInput,
  ): Promise<{
    output: ResearchAgentOutput;
    sources: SourceEntry[];
    error?: string;
  }> {
    const context = agent.contextBuilder(pipelineInput);
    const prompt = this.renderPrompt(agent.humanPromptTemplate, {
      contextJson: JSON.stringify(context, null, 2),
      agentName: agent.name,
      agentKey: key,
    });

    const response = await this.geminiResearchService.research({
      agent: key,
      prompt,
      systemPrompt: agent.systemPrompt,
      schema: agent.schema,
      fallback: () => agent.fallback(pipelineInput),
    });

    return {
      output: response.output,
      sources: response.sources,
      error: response.error,
    };
  }

  private renderPrompt(
    template: string,
    variables: Record<string, string>,
  ): string {
    return template.replace(
      /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
      (_, variableName: string) => variables[variableName] ?? "",
    );
  }
}
