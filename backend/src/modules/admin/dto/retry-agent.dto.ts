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
    agent: z.string().min(1).optional(),
    agents: z.array(z.string().min(1)).min(1).optional(),
    feedback: z.string().trim().min(10).max(3000).optional(),
    skipSynthesis: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    const agentList = value.agents ?? (value.agent ? [value.agent] : []);
    if (agentList.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either 'agent' or 'agents' must be provided",
        path: ["agent"],
      });
      return;
    }

    for (const ag of agentList) {
      if (value.phase === PipelinePhase.RESEARCH) {
        if (!ResearchAgentKeys.includes(ag as (typeof ResearchAgentKeys)[number])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unsupported research agent "${ag}"`,
            path: ["agents"],
          });
        }
      } else {
        if (!EvaluationAgentKeys.includes(ag as (typeof EvaluationAgentKeys)[number])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unsupported evaluation agent "${ag}"`,
            path: ["agents"],
          });
        }
      }
    }
  });

export type RetryAgent = z.infer<typeof RetryAgentSchema>;

export class RetryAgentDto extends createZodDto(RetryAgentSchema) {}
