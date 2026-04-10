import type { EvaluationAgentKey } from "../../interfaces/agent.interface";

export interface MemoChunkDefinition {
  id: string;
  label: string;
  sections: Array<{ key: EvaluationAgentKey; title: string }>;
  researchKeys: readonly string[];
}

export const MEMO_CHUNKS: MemoChunkDefinition[] = [
  {
    id: "chunk1",
    label: "Foundations",
    sections: [
      { key: "team", title: "Team" },
      { key: "market", title: "Market Opportunity" },
      { key: "product", title: "Product and Technology" },
      { key: "competitiveAdvantage", title: "Competitive Advantage" },
    ],
    researchKeys: ["team", "market", "product", "competitor"],
  },
  {
    id: "chunk2",
    label: "Execution",
    sections: [
      { key: "traction", title: "Traction and Metrics" },
      { key: "businessModel", title: "Business Model" },
      { key: "gtm", title: "Go-to-Market Strategy" },
      { key: "financials", title: "Financials" },
    ],
    researchKeys: ["market", "news"],
  },
  {
    id: "chunk3",
    label: "Terms & Exit",
    sections: [
      { key: "legal", title: "Legal and Regulatory" },
      { key: "dealTerms", title: "Deal Terms" },
      { key: "exitPotential", title: "Exit Potential" },
    ],
    researchKeys: ["news", "competitor"],
  },
];

export const MEMO_SECTION_ORDER = MEMO_CHUNKS.flatMap(
  (chunk) => chunk.sections,
);
