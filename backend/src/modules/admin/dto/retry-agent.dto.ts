import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { PipelinePhase } from "../../ai/interfaces/pipeline.interface";

const EvaluationAgentKeys = [
  "team",
  "market",
  "product",
  "traction",
  "businessModel",
  "gtm",
  "financials",
  "competitiveAdvantage",
  "legal",
  "dealTerms",
  "exitPotential",
] as const;

const ResearchAgentKeys = ["team", "market", "product", "news", "competitor"] as const;

export const RetryAgentSchema = z
  .object({
    phase: z.enum([PipelinePhase.RESEARCH, PipelinePhase.EVALUATION]),
    agent: z.string().min(1),
    feedback: z.string().trim().min(10).max(3000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.phase === PipelinePhase.RESEARCH) {
      if (!ResearchAgentKeys.includes(value.agent as (typeof ResearchAgentKeys)[number])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsupported research agent "${value.agent}"`,
          path: ["agent"],
        });
      }
      return;
    }

    if (!EvaluationAgentKeys.includes(value.agent as (typeof EvaluationAgentKeys)[number])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported evaluation agent "${value.agent}"`,
        path: ["agent"],
      });
    }
  });

export type RetryAgent = z.infer<typeof RetryAgentSchema>;

export class RetryAgentDto extends createZodDto(RetryAgentSchema) {}
