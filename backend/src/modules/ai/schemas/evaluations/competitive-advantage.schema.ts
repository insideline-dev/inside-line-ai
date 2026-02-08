import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

export const CompetitiveAdvantageEvaluationSchema = BaseEvaluationSchema.extend(
  {
    moats: z.array(z.string()).default([]),
    competitivePosition: z.string().min(1),
    barriers: z.array(z.string()).default([]),
  },
);

export type CompetitiveAdvantageEvaluation = z.infer<
  typeof CompetitiveAdvantageEvaluationSchema
>;
