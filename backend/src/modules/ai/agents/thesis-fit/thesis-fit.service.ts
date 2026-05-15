import { Injectable, Logger } from "@nestjs/common";
import { ModelPurpose } from "../../interfaces/pipeline.interface";
import {
  THESIS_FIT_HUMAN_PROMPT,
  THESIS_FIT_SYSTEM_PROMPT,
} from "../../prompts/thesis-fit.prompt";
import { AiProviderService } from "../../providers/ai-provider.service";
import {
  ThesisFitOutputSchema,
  type ThesisFitOutput,
} from "../../schemas/thesis-fit.schema";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";

export interface InvestorThesisInput {
  industries: string[] | null;
  stages: string[] | null;
  checkSizeMin: number | null;
  checkSizeMax: number | null;
  geographicFocus: string[] | null;
  businessModels: string[] | null;
  mustHaveFeatures: string[] | null;
  dealBreakers: string[] | null;
  thesisNarrative: string | null;
}

export interface StartupProfileInput {
  companyName: string;
  industry: string | null;
  stage: string | null;
  geography: string | null;
  checkContext: string | null;
  classification: Record<string, unknown> | null;
  additionalSignals: string | null;
}

@Injectable()
export class ThesisFitService {
  private readonly logger = new Logger(ThesisFitService.name);

  constructor(
    private readonly providers: AiProviderService,
    private readonly modelExecution: AiModelExecutionService,
  ) {}

  async assess(
    thesis: InvestorThesisInput,
    startup: StartupProfileInput,
  ): Promise<ThesisFitOutput> {
    const thesisBlock = this.formatThesis(thesis);
    const prompt = THESIS_FIT_HUMAN_PROMPT.replace("{{thesis}}", thesisBlock)
      .replace("{{companyName}}", startup.companyName)
      .replace("{{industry}}", startup.industry ?? "unknown")
      .replace("{{stage}}", startup.stage ?? "unknown")
      .replace("{{geography}}", startup.geography ?? "unknown")
      .replace("{{checkContext}}", startup.checkContext ?? "unknown")
      .replace(
        "{{classification}}",
        startup.classification
          ? JSON.stringify(startup.classification, null, 2)
          : "n/a",
      )
      .replace("{{additionalSignals}}", startup.additionalSignals ?? "n/a");

    const response = await this.modelExecution.generateText<ThesisFitOutput>({
      model: this.providers.resolveModelForPurpose(ModelPurpose.THESIS_ALIGNMENT),
      schema: ThesisFitOutputSchema,
      temperature: 0.1,
      system: THESIS_FIT_SYSTEM_PROMPT,
      prompt,
    });

    const output = response.output ?? response.experimental_output;
    if (!output) {
      this.logger.warn(
        `[ThesisFit] Empty LLM output for "${startup.companyName}"; returning neutral fallback`,
      );
      return this.neutralFallback();
    }

    return ThesisFitOutputSchema.parse(output);
  }

  private formatThesis(thesis: InvestorThesisInput): string {
    const lines: string[] = [];
    const push = (label: string, value: string | null | undefined) => {
      if (value && value.trim().length > 0) lines.push(`- ${label}: ${value}`);
    };
    const pushList = (label: string, value: string[] | null | undefined) => {
      if (value && value.length > 0) push(label, value.join(", "));
    };

    pushList("Sectors / industries", thesis.industries);
    pushList("Stages", thesis.stages);
    pushList("Geography", thesis.geographicFocus);
    pushList("Business models", thesis.businessModels);

    if (thesis.checkSizeMin != null || thesis.checkSizeMax != null) {
      const min = thesis.checkSizeMin != null ? `$${thesis.checkSizeMin.toLocaleString()}` : "?";
      const max = thesis.checkSizeMax != null ? `$${thesis.checkSizeMax.toLocaleString()}` : "?";
      push("Check size range", `${min} – ${max}`);
    }

    pushList("Must-have features", thesis.mustHaveFeatures);
    pushList("Deal breakers", thesis.dealBreakers);
    push("Narrative", thesis.thesisNarrative);

    return lines.length > 0 ? lines.join("\n") : "(no explicit thesis criteria; treat as open)";
  }

  private neutralFallback(): ThesisFitOutput {
    return {
      geography: { status: "borderline", note: "fit assessment unavailable" },
      stage: { status: "borderline", note: "fit assessment unavailable" },
      sector: { status: "borderline", note: "fit assessment unavailable" },
      checkSize: { status: "borderline", note: "fit assessment unavailable" },
      overall: 50,
      rationale:
        "Thesis fit could not be assessed automatically. Defaulting to neutral until inputs are reviewed.",
    };
  }
}
