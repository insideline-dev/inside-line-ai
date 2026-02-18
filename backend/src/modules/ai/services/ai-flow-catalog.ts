import type { AiPromptKey } from "./ai-prompt-catalog";

export type AiFlowId = "pipeline" | "clara";
export type AiFlowNodeKind = "prompt" | "system";

export interface AiFlowNodeDefinition {
  id: string;
  label: string;
  description: string;
  kind: AiFlowNodeKind;
  promptKeys: AiPromptKey[];
  inputs: string[];
  outputs: string[];
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

export const AI_FLOW_DEFINITIONS: AiFlowDefinition[] = [
  {
    id: "pipeline",
    name: "Startup Evaluation Pipeline",
    description: "End-to-end flow from ingestion through matching.",
    stages: [
      {
        id: "stage_1",
        title: "Stage 1: Hybrid Gap Fill",
        description: "Run AI + Brave Search to fill missing startup profile fields first.",
        nodeIds: ["gap_fill_hybrid"],
      },
      {
        id: "stage_2",
        title: "Stage 2: Data Extraction",
        description: "Parse pitch materials and scrape the website on top of gap-filled context.",
        nodeIds: ["extract_fields", "scrape_website"],
      },
      {
        id: "stage_3",
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
        id: "stage_4",
        title: "Stage 4: Evaluation Pipeline",
        description: "Run scoring agents and produce final synthesis.",
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
          "synthesis_final",
        ],
      },
      {
        id: "stage_5",
        title: "Stage 5: Investor Matching",
        description: "Score fit between startup profile and investor thesis.",
        nodeIds: ["matching_thesis"],
      },
    ],
    nodes: [
      {
        id: "gap_fill_hybrid",
        label: "Hybrid Gap Fill",
        description: "Use AI synthesis + Brave Search evidence to fill missing startup fields.",
        kind: "system",
        promptKeys: [],
        inputs: ["Startup profile", "Existing company metadata", "Brave search results"],
        outputs: ["Gap-filled fields", "Corrections", "Evidence summary"],
      },
      {
        id: "extract_fields",
        label: "Document Parsing",
        description: "Extract startup fields from pitch deck text.",
        kind: "prompt",
        promptKeys: ["extraction.fields"],
        inputs: ["Pitch deck text", "Startup form hints"],
        outputs: ["Structured extraction result"],
      },
      {
        id: "scrape_website",
        label: "Website Scraping",
        description: "Collect website content and metadata for research context.",
        kind: "system",
        promptKeys: [],
        inputs: ["Startup website URL"],
        outputs: ["Website pages", "Content snippets"],
      },
      {
        id: "research_orchestrator",
        label: "Research Orchestrator",
        description: "Coordinates all research agents and aggregates outputs.",
        kind: "system",
        promptKeys: [],
        inputs: ["Gap fill", "Extraction", "Scraping context"],
        outputs: ["Research phase result"],
      },
      {
        id: "research_team",
        label: "Team Research",
        description: "Research founder and leadership quality.",
        kind: "prompt",
        promptKeys: ["research.team"],
        inputs: ["Company context", "Team data"],
        outputs: ["Team diligence findings"],
      },
      {
        id: "research_market",
        label: "Market Research",
        description: "Research market, TAM, and competitive dynamics.",
        kind: "prompt",
        promptKeys: ["research.market"],
        inputs: ["Industry", "Company context"],
        outputs: ["Market diligence findings"],
      },
      {
        id: "research_product",
        label: "Product Research",
        description: "Research product capabilities and differentiation.",
        kind: "prompt",
        promptKeys: ["research.product"],
        inputs: ["Product context", "Web/product signals"],
        outputs: ["Product diligence findings"],
      },
      {
        id: "research_news",
        label: "News Research",
        description: "Research recent external events and signals.",
        kind: "prompt",
        promptKeys: ["research.news"],
        inputs: ["Company identity", "Public signals"],
        outputs: ["News/event findings"],
      },
      {
        id: "research_competitor",
        label: "Competitor Research",
        description: "Deep-dive competitive analysis of direct and indirect competitors.",
        kind: "prompt",
        promptKeys: ["research.competitor"],
        inputs: ["Product research", "Market research", "Company context"],
        outputs: ["Competitor profiles", "Market positioning"],
      },
      {
        id: "evaluation_orchestrator",
        label: "Evaluation Orchestrator",
        description: "Coordinates evaluation agents and composes scorecards.",
        kind: "system",
        promptKeys: [],
        inputs: ["Extraction", "Research outputs"],
        outputs: ["Evaluation phase result"],
      },
      {
        id: "evaluation_team",
        label: "Team Evaluation",
        description: "Score team quality and execution potential.",
        kind: "prompt",
        promptKeys: ["evaluation.team"],
        inputs: ["Research + extraction context"],
        outputs: ["Team scorecard"],
      },
      {
        id: "evaluation_market",
        label: "Market Evaluation",
        description: "Score market quality and opportunity credibility.",
        kind: "prompt",
        promptKeys: ["evaluation.market"],
        inputs: ["Research + extraction context"],
        outputs: ["Market scorecard"],
      },
      {
        id: "evaluation_product",
        label: "Product Evaluation",
        description: "Score product quality and technical strength.",
        kind: "prompt",
        promptKeys: ["evaluation.product"],
        inputs: ["Research + extraction context"],
        outputs: ["Product scorecard"],
      },
      {
        id: "evaluation_traction",
        label: "Traction Evaluation",
        description: "Score traction, growth signal, and KPI quality.",
        kind: "prompt",
        promptKeys: ["evaluation.traction"],
        inputs: ["Research + extraction context"],
        outputs: ["Traction scorecard"],
      },
      {
        id: "evaluation_business_model",
        label: "Business Model Evaluation",
        description: "Score monetization model and scalability.",
        kind: "prompt",
        promptKeys: ["evaluation.businessModel"],
        inputs: ["Research + extraction context"],
        outputs: ["Business model scorecard"],
      },
      {
        id: "evaluation_gtm",
        label: "GTM Evaluation",
        description: "Score go-to-market quality and channel strategy.",
        kind: "prompt",
        promptKeys: ["evaluation.gtm"],
        inputs: ["Research + extraction context"],
        outputs: ["GTM scorecard"],
      },
      {
        id: "evaluation_financials",
        label: "Financials Evaluation",
        description: "Score burn, runway, and financial quality.",
        kind: "prompt",
        promptKeys: ["evaluation.financials"],
        inputs: ["Research + extraction context"],
        outputs: ["Financial scorecard"],
      },
      {
        id: "evaluation_competitive_advantage",
        label: "Competitive Advantage Evaluation",
        description: "Score defensibility and moat strength.",
        kind: "prompt",
        promptKeys: ["evaluation.competitiveAdvantage"],
        inputs: ["Research + extraction context"],
        outputs: ["Moat scorecard"],
      },
      {
        id: "evaluation_legal",
        label: "Legal Evaluation",
        description: "Score legal/regulatory risk profile.",
        kind: "prompt",
        promptKeys: ["evaluation.legal"],
        inputs: ["Research + extraction context"],
        outputs: ["Legal risk scorecard"],
      },
      {
        id: "evaluation_deal_terms",
        label: "Deal Terms Evaluation",
        description: "Score valuation and round terms quality.",
        kind: "prompt",
        promptKeys: ["evaluation.dealTerms"],
        inputs: ["Research + extraction context"],
        outputs: ["Deal terms scorecard"],
      },
      {
        id: "evaluation_exit_potential",
        label: "Exit Potential Evaluation",
        description: "Score long-term exit path potential.",
        kind: "prompt",
        promptKeys: ["evaluation.exitPotential"],
        inputs: ["Research + extraction context"],
        outputs: ["Exit scorecard"],
      },
      {
        id: "synthesis_final",
        label: "Synthesis",
        description: "Generate final memo and recommendation.",
        kind: "prompt",
        promptKeys: ["synthesis.final"],
        inputs: ["All evaluation outputs"],
        outputs: ["Final synthesis", "Recommendation", "Overall score"],
      },
      {
        id: "matching_thesis",
        label: "Thesis Alignment",
        description: "Score fit against investor thesis preferences.",
        kind: "prompt",
        promptKeys: ["matching.thesis"],
        inputs: ["Synthesis result", "Investor thesis"],
        outputs: ["Thesis fit score", "Fit rationale"],
      },
    ],
    edges: [
      { from: "gap_fill_hybrid", to: "extract_fields" },
      { from: "gap_fill_hybrid", to: "scrape_website" },
      { from: "gap_fill_hybrid", to: "research_orchestrator" },
      { from: "extract_fields", to: "research_orchestrator" },
      { from: "scrape_website", to: "research_orchestrator" },
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
    ],
  },
  {
    id: "clara",
    name: "Clara Assistant Flow",
    description: "Intent classification and response generation for inbound threads.",
    stages: [
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
    ],
    nodes: [
      {
        id: "clara_intent",
        label: "Clara Intent",
        description: "Classify incoming email intent and extract routing context.",
        kind: "prompt",
        promptKeys: ["clara.intent"],
        inputs: ["Inbound email", "History", "Startup context"],
        outputs: ["Intent classification"],
      },
      {
        id: "clara_response",
        label: "Clara Response",
        description: "Generate concise and contextual response drafts.",
        kind: "prompt",
        promptKeys: ["clara.response"],
        inputs: ["Detected intent", "Conversation history", "Startup status"],
        outputs: ["Response text"],
      },
    ],
    edges: [{ from: "clara_intent", to: "clara_response" }],
  },
];
