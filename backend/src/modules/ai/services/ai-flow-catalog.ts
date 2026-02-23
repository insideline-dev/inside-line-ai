import type { AiPromptKey } from "./ai-prompt-catalog";

export type AiFlowId = "pipeline" | "clara";
export type AiFlowNodeKind = "prompt" | "system";
export type AiFlowPortType = "text" | "object" | "array" | "number";

export interface AiFlowPort {
  label: string;
  type: AiFlowPortType;
  fromNodeId?: string;
  toNodeIds?: string[];
}

export interface AiFlowNodeDefinition {
  id: string;
  label: string;
  description: string;
  kind: AiFlowNodeKind;
  promptKeys: AiPromptKey[];
  inputs: AiFlowPort[];
  outputs: AiFlowPort[];
  enabled?: boolean;
  runtimeModel?: {
    modelName: string;
    provider: string;
    searchMode:
      | "off"
      | "provider_grounded_search"
      | "brave_tool_search"
      | "provider_and_brave_search";
    source: "default" | "published" | "revision_override";
  };
}

export interface AiFlowStageDefinition {
  id: string;
  title: string;
  description: string;
  nodeIds: string[];
}

export interface AiFlowEdgeDefinition {
  from: string;
  to: string;
  label?: string;
}

export interface AiFlowDefinition {
  id: AiFlowId;
  name: string;
  description: string;
  stages: AiFlowStageDefinition[];
  nodes: AiFlowNodeDefinition[];
  edges: AiFlowEdgeDefinition[];
}

function linkNodePorts(
  nodes: AiFlowNodeDefinition[],
  edges: AiFlowEdgeDefinition[],
): AiFlowNodeDefinition[] {
  const incomingByNode = new Map<string, string[]>();
  const outgoingByNode = new Map<string, string[]>();

  for (const edge of edges) {
    const incoming = incomingByNode.get(edge.to) ?? [];
    incoming.push(edge.from);
    incomingByNode.set(edge.to, incoming);

    const outgoing = outgoingByNode.get(edge.from) ?? [];
    outgoing.push(edge.to);
    outgoingByNode.set(edge.from, outgoing);
  }

  return nodes.map((node) => {
    const incoming = incomingByNode.get(node.id) ?? [];
    const outgoing = outgoingByNode.get(node.id) ?? [];

    return {
      ...node,
      inputs: node.inputs.map((port, index) => {
        if (port.fromNodeId) {
          return port;
        }

        const inferredFromNodeId = incoming[index];
        if (!inferredFromNodeId) {
          return port;
        }

        return {
          ...port,
          fromNodeId: inferredFromNodeId,
        };
      }),
      outputs: node.outputs.map((port) => {
        if (port.toNodeIds) {
          return port;
        }

        if (outgoing.length === 0) {
          return port;
        }

        return {
          ...port,
          toNodeIds: outgoing,
        };
      }),
    };
  });
}

const PIPELINE_STAGES: AiFlowStageDefinition[] = [
  {
    id: "stage_1_extraction",
    title: "Stage 1: Extraction & Scraping",
    description: "Parse pitch materials and collect website content.",
    nodeIds: ["extract_fields", "scrape_website"],
  },
  {
    id: "stage_2_enrichment",
    title: "Stage 2: Enrichment",
    description: "Fill missing fields and enrich LinkedIn context.",
    nodeIds: ["gap_fill_hybrid", "linkedin_enrichment"],
  },
  {
    id: "stage_3_research",
    title: "Stage 3: Deep Research",
    description: "Run specialized research agents in parallel.",
    nodeIds: [
      "research_orchestrator",
      "research_team",
      "research_market",
      "research_product",
      "research_news",
      "research_competitor",
    ],
  },
  {
    id: "stage_4_evaluation",
    title: "Stage 4: Evaluation Pipeline",
    description: "Run scoring agents and compile scorecards.",
    nodeIds: [
      "evaluation_orchestrator",
      "evaluation_team",
      "evaluation_market",
      "evaluation_product",
      "evaluation_traction",
      "evaluation_business_model",
      "evaluation_gtm",
      "evaluation_financials",
      "evaluation_competitive_advantage",
      "evaluation_legal",
      "evaluation_deal_terms",
      "evaluation_exit_potential",
    ],
  },
  {
    id: "stage_5_synthesis",
    title: "Stage 5: Synthesis",
    description: "Generate the final memo and recommendation.",
    nodeIds: ["synthesis_final"],
  },
  {
    id: "stage_6_matching",
    title: "Stage 6: Investor Matching",
    description: "Score fit between startup profile and investor thesis.",
    nodeIds: ["matching_thesis"],
  },
];

const PIPELINE_NODES: AiFlowNodeDefinition[] = [
  {
    id: "gap_fill_hybrid",
    label: "Hybrid Gap Fill",
    description: "Use AI synthesis + Brave Search evidence to fill missing startup fields.",
    kind: "prompt",
    promptKeys: [],
    inputs: [
      { label: "Extraction result", type: "object", fromNodeId: "extract_fields" },
      { label: "Scraping context", type: "object", fromNodeId: "scrape_website" },
      { label: "Startup profile (DB/form)", type: "object" },
      { label: "Email context", type: "object" },
      { label: "Brave search results", type: "array" },
    ],
    outputs: [
      { label: "Gap-filled fields", type: "object" },
      { label: "Corrections", type: "array" },
      { label: "Evidence summary", type: "text" },
    ],
  },
  {
    id: "extract_fields",
    label: "Document Parsing",
    description: "Extract startup fields from pitch deck text.",
    kind: "prompt",
    promptKeys: ["extraction.fields"],
    inputs: [
      { label: "Pitch deck text", type: "text" },
      { label: "Startup form hints", type: "object" },
    ],
    outputs: [{ label: "Structured extraction result", type: "object" }],
  },
  {
    id: "scrape_website",
    label: "Website Scraping",
    description: "Collect website content and metadata for research context.",
    kind: "system",
    promptKeys: [],
    inputs: [{ label: "Startup website URL", type: "text" }],
    outputs: [
      { label: "Website pages", type: "array" },
      { label: "Content snippets", type: "array" },
    ],
  },
  {
    id: "linkedin_enrichment",
    label: "LinkedIn Enrichment",
    description:
      "Discover and enrich founder/team profiles from LinkedIn and company context.",
    kind: "system",
    promptKeys: [],
    inputs: [
      { label: "Extracted founders", type: "array" },
      { label: "Website team links", type: "array" },
      { label: "Company metadata", type: "object" },
    ],
    outputs: [
      { label: "LinkedIn profile snapshots", type: "array" },
      { label: "Enriched team context", type: "object" },
    ],
  },
  {
    id: "research_orchestrator",
    label: "Research Orchestrator",
    description: "Coordinates all research agents and aggregates outputs.",
    kind: "system",
    promptKeys: [],
    inputs: [
      { label: "Gap fill", type: "object", fromNodeId: "gap_fill_hybrid" },
      { label: "Scraping context", type: "object", fromNodeId: "scrape_website" },
      { label: "LinkedIn context", type: "object", fromNodeId: "linkedin_enrichment" },
    ],
    outputs: [{ label: "Research phase result", type: "object" }],
  },
  {
    id: "research_team",
    label: "Team Research",
    description: "Research founder and leadership quality.",
    kind: "prompt",
    promptKeys: ["research.team"],
    inputs: [
      { label: "Company context", type: "object" },
      { label: "Team data", type: "object" },
    ],
    outputs: [{ label: "Team diligence findings", type: "object" }],
  },
  {
    id: "research_market",
    label: "Market Research",
    description: "Research market, TAM, and competitive dynamics.",
    kind: "prompt",
    promptKeys: ["research.market"],
    inputs: [
      { label: "Industry", type: "text" },
      { label: "Company context", type: "object" },
    ],
    outputs: [{ label: "Market diligence findings", type: "object" }],
  },
  {
    id: "research_product",
    label: "Product Research",
    description: "Research product capabilities and differentiation.",
    kind: "prompt",
    promptKeys: ["research.product"],
    inputs: [
      { label: "Product context", type: "object" },
      { label: "Web/product signals", type: "object" },
    ],
    outputs: [{ label: "Product diligence findings", type: "object" }],
  },
  {
    id: "research_news",
    label: "News Research",
    description: "Research recent external events and signals.",
    kind: "prompt",
    promptKeys: ["research.news"],
    inputs: [
      { label: "Company identity", type: "object" },
      { label: "Public signals", type: "array" },
    ],
    outputs: [{ label: "News/event findings", type: "object" }],
  },
  {
    id: "research_competitor",
    label: "Competitor Research",
    description: "Deep-dive competitive analysis of direct and indirect competitors.",
    kind: "prompt",
    promptKeys: ["research.competitor"],
    inputs: [
      { label: "Product research", type: "object" },
      { label: "Market research", type: "object" },
      { label: "Company context", type: "object" },
    ],
    outputs: [
      { label: "Competitor profiles", type: "array" },
      { label: "Market positioning", type: "object" },
    ],
  },
  {
    id: "evaluation_orchestrator",
    label: "Evaluation Orchestrator",
    description: "Coordinates evaluation agents and composes scorecards.",
    kind: "system",
    promptKeys: [],
    inputs: [
      { label: "Extraction", type: "object" },
      { label: "Research outputs", type: "object" },
    ],
    outputs: [{ label: "Evaluation phase result", type: "object" }],
  },
  {
    id: "evaluation_team",
    label: "Team Evaluation",
    description: "Score team quality and execution potential.",
    kind: "prompt",
    promptKeys: ["evaluation.team"],
    inputs: [{ label: "Research + extraction context", type: "object" }],
    outputs: [{ label: "Team scorecard", type: "object" }],
  },
  {
    id: "evaluation_market",
    label: "Market Evaluation",
    description: "Score market quality and opportunity credibility.",
    kind: "prompt",
    promptKeys: ["evaluation.market"],
    inputs: [{ label: "Research + extraction context", type: "object" }],
    outputs: [{ label: "Market scorecard", type: "object" }],
  },
  {
    id: "evaluation_product",
    label: "Product Evaluation",
    description: "Score product quality and technical strength.",
    kind: "prompt",
    promptKeys: ["evaluation.product"],
    inputs: [{ label: "Research + extraction context", type: "object" }],
    outputs: [{ label: "Product scorecard", type: "object" }],
  },
  {
    id: "evaluation_traction",
    label: "Traction Evaluation",
    description: "Score traction, growth signal, and KPI quality.",
    kind: "prompt",
    promptKeys: ["evaluation.traction"],
    inputs: [{ label: "Research + extraction context", type: "object" }],
    outputs: [{ label: "Traction scorecard", type: "object" }],
  },
  {
    id: "evaluation_business_model",
    label: "Business Model Evaluation",
    description: "Score monetization model and scalability.",
    kind: "prompt",
    promptKeys: ["evaluation.businessModel"],
    inputs: [{ label: "Research + extraction context", type: "object" }],
    outputs: [{ label: "Business model scorecard", type: "object" }],
  },
  {
    id: "evaluation_gtm",
    label: "GTM Evaluation",
    description: "Score go-to-market quality and channel strategy.",
    kind: "prompt",
    promptKeys: ["evaluation.gtm"],
    inputs: [{ label: "Research + extraction context", type: "object" }],
    outputs: [{ label: "GTM scorecard", type: "object" }],
  },
  {
    id: "evaluation_financials",
    label: "Financials Evaluation",
    description: "Score burn, runway, and financial quality.",
    kind: "prompt",
    promptKeys: ["evaluation.financials"],
    inputs: [{ label: "Research + extraction context", type: "object" }],
    outputs: [{ label: "Financial scorecard", type: "object" }],
  },
  {
    id: "evaluation_competitive_advantage",
    label: "Competitive Advantage Evaluation",
    description: "Score defensibility and moat strength.",
    kind: "prompt",
    promptKeys: ["evaluation.competitiveAdvantage"],
    inputs: [{ label: "Research + extraction context", type: "object" }],
    outputs: [{ label: "Moat scorecard", type: "object" }],
  },
  {
    id: "evaluation_legal",
    label: "Legal Evaluation",
    description: "Score legal/regulatory risk profile.",
    kind: "prompt",
    promptKeys: ["evaluation.legal"],
    inputs: [{ label: "Research + extraction context", type: "object" }],
    outputs: [{ label: "Legal risk scorecard", type: "object" }],
  },
  {
    id: "evaluation_deal_terms",
    label: "Deal Terms Evaluation",
    description: "Score valuation and round terms quality.",
    kind: "prompt",
    promptKeys: ["evaluation.dealTerms"],
    inputs: [{ label: "Research + extraction context", type: "object" }],
    outputs: [{ label: "Deal terms scorecard", type: "object" }],
  },
  {
    id: "evaluation_exit_potential",
    label: "Exit Potential Evaluation",
    description: "Score long-term exit path potential.",
    kind: "prompt",
    promptKeys: ["evaluation.exitPotential"],
    inputs: [{ label: "Research + extraction context", type: "object" }],
    outputs: [{ label: "Exit scorecard", type: "object" }],
  },
  {
    id: "synthesis_final",
    label: "Synthesis",
    description: "Generate final memo and recommendation.",
    kind: "prompt",
    promptKeys: ["synthesis.final"],
    inputs: [{ label: "All evaluation outputs", type: "object" }],
    outputs: [
      { label: "Final synthesis", type: "object" },
      { label: "Recommendation", type: "text" },
      { label: "Overall score", type: "number" },
    ],
  },
  {
    id: "matching_thesis",
    label: "Thesis Alignment",
    description: "Score fit against investor thesis preferences.",
    kind: "prompt",
    promptKeys: ["matching.thesis"],
    inputs: [
      { label: "Synthesis result", type: "object" },
      { label: "Investor thesis", type: "text" },
    ],
    outputs: [
      { label: "Thesis fit score", type: "number" },
      { label: "Fit rationale", type: "text" },
    ],
  },
];

const PIPELINE_EDGES: AiFlowEdgeDefinition[] = [
  { from: "extract_fields", to: "gap_fill_hybrid" },
  { from: "scrape_website", to: "gap_fill_hybrid" },
  { from: "extract_fields", to: "linkedin_enrichment" },
  { from: "scrape_website", to: "linkedin_enrichment" },
  { from: "gap_fill_hybrid", to: "research_orchestrator" },
  { from: "scrape_website", to: "research_orchestrator" },
  { from: "linkedin_enrichment", to: "research_orchestrator" },
  { from: "research_orchestrator", to: "research_team" },
  { from: "research_orchestrator", to: "research_market" },
  { from: "research_orchestrator", to: "research_product" },
  { from: "research_orchestrator", to: "research_news" },
  { from: "research_orchestrator", to: "research_competitor" },
  { from: "research_product", to: "research_competitor", label: "Phase 2 input" },
  { from: "research_market", to: "research_competitor", label: "Phase 2 input" },
  { from: "research_team", to: "evaluation_orchestrator" },
  { from: "research_market", to: "evaluation_orchestrator" },
  { from: "research_product", to: "evaluation_orchestrator" },
  { from: "research_news", to: "evaluation_orchestrator" },
  { from: "research_competitor", to: "evaluation_orchestrator" },
  { from: "evaluation_orchestrator", to: "evaluation_team" },
  { from: "evaluation_orchestrator", to: "evaluation_market" },
  { from: "evaluation_orchestrator", to: "evaluation_product" },
  { from: "evaluation_orchestrator", to: "evaluation_traction" },
  { from: "evaluation_orchestrator", to: "evaluation_business_model" },
  { from: "evaluation_orchestrator", to: "evaluation_gtm" },
  { from: "evaluation_orchestrator", to: "evaluation_financials" },
  { from: "evaluation_orchestrator", to: "evaluation_competitive_advantage" },
  { from: "evaluation_orchestrator", to: "evaluation_legal" },
  { from: "evaluation_orchestrator", to: "evaluation_deal_terms" },
  { from: "evaluation_orchestrator", to: "evaluation_exit_potential" },
  { from: "evaluation_team", to: "synthesis_final" },
  { from: "evaluation_market", to: "synthesis_final" },
  { from: "evaluation_product", to: "synthesis_final" },
  { from: "evaluation_traction", to: "synthesis_final" },
  { from: "evaluation_business_model", to: "synthesis_final" },
  { from: "evaluation_gtm", to: "synthesis_final" },
  { from: "evaluation_financials", to: "synthesis_final" },
  { from: "evaluation_competitive_advantage", to: "synthesis_final" },
  { from: "evaluation_legal", to: "synthesis_final" },
  { from: "evaluation_deal_terms", to: "synthesis_final" },
  { from: "evaluation_exit_potential", to: "synthesis_final" },
  { from: "synthesis_final", to: "matching_thesis" },
];

const CLARA_STAGES: AiFlowStageDefinition[] = [
  {
    id: "clara_stage_1",
    title: "Stage 1: Intent Classification",
    description: "Classify inbound messages with startup/thread context.",
    nodeIds: ["clara_intent"],
  },
  {
    id: "clara_stage_2",
    title: "Stage 2: Response Generation",
    description: "Generate contextual outbound responses.",
    nodeIds: ["clara_response"],
  },
];

const CLARA_NODES: AiFlowNodeDefinition[] = [
  {
    id: "clara_intent",
    label: "Clara Intent",
    description: "Classify incoming email intent and extract routing context.",
    kind: "prompt",
    promptKeys: ["clara.intent"],
    inputs: [
      { label: "Inbound email", type: "object" },
      { label: "History", type: "array" },
      { label: "Startup context", type: "object" },
    ],
    outputs: [{ label: "Intent classification", type: "object" }],
  },
  {
    id: "clara_response",
    label: "Clara Response",
    description: "Generate concise and contextual response drafts.",
    kind: "prompt",
    promptKeys: ["clara.response"],
    inputs: [
      { label: "Detected intent", type: "object" },
      { label: "Conversation history", type: "array" },
      { label: "Startup status", type: "object" },
    ],
    outputs: [{ label: "Response text", type: "text" }],
  },
];

const CLARA_EDGES: AiFlowEdgeDefinition[] = [
  { from: "clara_intent", to: "clara_response" },
];

export const PIPELINE_DEFINITION: AiFlowDefinition = {
  id: "pipeline",
  name: "Startup Evaluation Pipeline",
  description: "End-to-end flow from ingestion through matching.",
  stages: PIPELINE_STAGES,
  nodes: linkNodePorts(PIPELINE_NODES, PIPELINE_EDGES),
  edges: PIPELINE_EDGES,
};

const CLARA_DEFINITION: AiFlowDefinition = {
  id: "clara",
  name: "Clara Assistant Flow",
  description: "Intent classification and response generation for inbound threads.",
  stages: CLARA_STAGES,
  nodes: linkNodePorts(CLARA_NODES, CLARA_EDGES),
  edges: CLARA_EDGES,
};

export const AI_FLOW_DEFINITIONS: AiFlowDefinition[] = [
  PIPELINE_DEFINITION,
  CLARA_DEFINITION,
];
