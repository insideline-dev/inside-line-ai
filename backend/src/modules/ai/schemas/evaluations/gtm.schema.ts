import { z } from "zod";
import { BaseEvaluationSchema } from "../base-evaluation.schema";

export const GtmEvaluationSchema = BaseEvaluationSchema.extend({
  customerSegments: z.array(z.string()).default([]),
  acquisitionChannels: z.array(z.string()).default([]),
  salesStrategy: z.string().min(1),
  pricingStrategy: z.string().min(1),
});

export type GtmEvaluation = z.infer<typeof GtmEvaluationSchema>;
