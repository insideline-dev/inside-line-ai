import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Bot,
  Workflow,
  Users,
  TrendingUp,
  Package,
  Target,
  DollarSign,
  BarChart3,
  Shield,
  Scale,
  Landmark,
  GitMerge,
  Save,
  X,
  Wrench,
  FileInput,
  FileOutput,
  RefreshCw,
  ArrowDown,
  FileSearch,
  Globe,
  Linkedin,
  Newspaper,
  Layers,
  FileText,
  Handshake,
} from "lucide-react";
import type { AgentPrompt } from "@/types/admin";

// Mock agents data - backend not connected
const MOCK_AGENTS: AgentPrompt[] = [
  // Stage 3: Research (5 agents)
  {
    id: 1,
    agentKey: "researchOrchestrator",
    displayName: "Research Orchestrator",
    description: "Orchestrates deep research agents to gather comprehensive data",
    category: "research",
    systemPrompt: "You are a research orchestration agent. Your job is to coordinate deep research on {companyName} across team, market, and product dimensions.\n\nDispatch the following research agents in parallel:\n- Team Deep Research\n- Market Deep Research\n- Product Deep Research\n- News Search\n\nConsolidate findings into a unified research report.",
    humanPrompt: "Research {companyName} thoroughly. Website: {websiteUrl}",
    tools: ["dispatch_agent", "aggregate_results"],
    inputs: [
      { key: "companyName", description: "The startup company name", required: true },
      { key: "websiteUrl", description: "Company website URL", required: true },
      { key: "pitchDeckText", description: "Extracted pitch deck text", required: false },
    ],
    outputs: [
      { key: "researchReport", type: "object", description: "Consolidated research findings" },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    agentKey: "teamDeepResearch",
    displayName: "Team Deep Research",
    description: "Deep research on founders and team backgrounds",
    category: "research-task",
    systemPrompt: "You are a team research specialist. Research the founders and key team members of {companyName}.\n\nFocus on:\n- Professional backgrounds\n- Previous startups/exits\n- Domain expertise\n- Educational credentials\n- Notable achievements",
    humanPrompt: "Research the team at {companyName}. Known founders: {founders}",
    tools: ["web_search", "linkedin_search"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "founders", description: "Known founder names", required: false },
    ],
    outputs: [
      { key: "teamResearch", type: "object", description: "Team background research" },
    ],
    parentAgent: "researchOrchestrator",
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 3,
    agentKey: "marketDeepResearch",
    displayName: "Market Deep Research",
    description: "Market analysis and validation research",
    category: "research-task",
    systemPrompt: "You are a market research analyst. Research the market opportunity for {companyName} in the {industry} space.\n\nAnalyze:\n- Total addressable market (TAM)\n- Market growth trends\n- Key competitors\n- Market dynamics\n- Regulatory landscape",
    humanPrompt: "Analyze the market for {companyName} in {industry}",
    tools: ["web_search", "market_data"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "industry", description: "Industry/sector", required: true },
    ],
    outputs: [
      { key: "marketResearch", type: "object", description: "Market analysis findings" },
    ],
    parentAgent: "researchOrchestrator",
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 4,
    agentKey: "productDeepResearch",
    displayName: "Product Deep Research",
    description: "Product/technology research and competitive analysis",
    category: "research-task",
    systemPrompt: "You are a product research specialist. Research {companyName}'s product and technology.\n\nInvestigate:\n- Product features and capabilities\n- Technology stack and innovation\n- Competitive differentiation\n- User reviews and feedback\n- Patents or proprietary tech",
    humanPrompt: "Research {companyName}'s product. Website: {websiteUrl}",
    tools: ["web_search", "product_hunt", "g2_crowd"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "websiteUrl", description: "Website URL", required: true },
    ],
    outputs: [
      { key: "productResearch", type: "object", description: "Product research findings" },
    ],
    parentAgent: "researchOrchestrator",
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 5,
    agentKey: "newsSearch",
    displayName: "News Search",
    description: "Recent news and press coverage search",
    category: "research-task",
    systemPrompt: "You are a news research agent. Find recent news and press coverage about {companyName}.\n\nSearch for:\n- Funding announcements\n- Product launches\n- Partnerships\n- Executive changes\n- Industry recognition",
    humanPrompt: "Find recent news about {companyName}",
    tools: ["news_api", "web_search"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
    ],
    outputs: [
      { key: "newsItems", type: "array", description: "Recent news articles" },
    ],
    parentAgent: "researchOrchestrator",
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },

  // Stage 4: Evaluation Pipeline (13 agents)
  {
    id: 6,
    agentKey: "orchestrator",
    displayName: "Evaluation Orchestrator",
    description: "Main orchestrator for the evaluation pipeline",
    category: "orchestrator",
    systemPrompt: "You are the main evaluation orchestrator for {companyName}. Coordinate the analysis agents to produce a comprehensive startup evaluation.\n\nDispatch agents for: Team, Market, Product, Traction, Business Model, GTM, Financials, Competitive Advantage, Legal, Deal Terms, and Exit Potential.\n\nAfter all analyses complete, trigger the Synthesis agent.",
    humanPrompt: "Evaluate {companyName} comprehensively using all analysis agents.",
    tools: ["dispatch_agent", "aggregate_results", "score_calculator"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "researchData", description: "Research findings from Stage 3", required: true },
    ],
    outputs: [
      { key: "evaluationResults", type: "object", description: "Complete evaluation results" },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 7,
    agentKey: "team",
    displayName: "Team Analysis",
    description: "Evaluate founders and team quality",
    category: "analysis",
    systemPrompt: "You are a team analysis expert. Evaluate the founders and team of {companyName}.\n\nScore (1-10) based on:\n- Founder-market fit\n- Relevant experience\n- Track record of execution\n- Team completeness\n- Ability to attract talent",
    humanPrompt: "Analyze the team at {companyName}. Team data: {teamData}",
    tools: ["scoring"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "teamData", description: "Team research data", required: true },
    ],
    outputs: [
      { key: "score", type: "number", description: "Team score 1-10" },
      { key: "analysis", type: "string", description: "Detailed analysis" },
    ],
    parentAgent: "orchestrator",
    executionOrder: 1,
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 8,
    agentKey: "market",
    displayName: "Market Analysis",
    description: "Evaluate market opportunity and timing",
    category: "analysis",
    systemPrompt: "You are a market opportunity analyst. Evaluate the market for {companyName}.\n\nScore (1-10) based on:\n- TAM/SAM/SOM attractiveness\n- Market growth rate\n- Timing (why now?)\n- Competitive landscape\n- Market accessibility",
    humanPrompt: "Analyze the market opportunity for {companyName}. Market data: {marketData}",
    tools: ["scoring", "market_data"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "marketData", description: "Market research data", required: true },
    ],
    outputs: [
      { key: "score", type: "number", description: "Market score 1-10" },
      { key: "analysis", type: "string", description: "Detailed analysis" },
    ],
    parentAgent: "orchestrator",
    executionOrder: 1,
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 9,
    agentKey: "product",
    displayName: "Product Analysis",
    description: "Evaluate product and technology",
    category: "analysis",
    systemPrompt: "You are a product analyst. Evaluate {companyName}'s product and technology.\n\nScore (1-10) based on:\n- Product-market fit signals\n- Technical innovation\n- Defensibility/moats\n- User experience\n- Scalability",
    humanPrompt: "Analyze the product for {companyName}. Product data: {productData}",
    tools: ["scoring"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "productData", description: "Product research data", required: true },
    ],
    outputs: [
      { key: "score", type: "number", description: "Product score 1-10" },
      { key: "analysis", type: "string", description: "Detailed analysis" },
    ],
    parentAgent: "orchestrator",
    executionOrder: 1,
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 10,
    agentKey: "traction",
    displayName: "Traction Analysis",
    description: "Evaluate traction and metrics",
    category: "analysis",
    systemPrompt: "You are a traction analyst. Evaluate {companyName}'s traction and key metrics.\n\nScore (1-10) based on:\n- Revenue/growth rate\n- User/customer growth\n- Engagement metrics\n- Unit economics\n- Milestone achievement",
    humanPrompt: "Analyze traction for {companyName}. Metrics: {tractionData}",
    tools: ["scoring", "metrics_analysis"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "tractionData", description: "Traction and metrics data", required: true },
    ],
    outputs: [
      { key: "score", type: "number", description: "Traction score 1-10" },
      { key: "analysis", type: "string", description: "Detailed analysis" },
    ],
    parentAgent: "orchestrator",
    executionOrder: 1,
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 11,
    agentKey: "businessModel",
    displayName: "Business Model Analysis",
    description: "Evaluate business model viability",
    category: "analysis",
    systemPrompt: "You are a business model analyst. Evaluate {companyName}'s business model.\n\nScore (1-10) based on:\n- Revenue model clarity\n- Pricing power\n- Scalability\n- Recurring revenue potential\n- Path to profitability",
    humanPrompt: "Analyze the business model for {companyName}. Model data: {businessModelData}",
    tools: ["scoring"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "businessModelData", description: "Business model information", required: true },
    ],
    outputs: [
      { key: "score", type: "number", description: "Business model score 1-10" },
      { key: "analysis", type: "string", description: "Detailed analysis" },
    ],
    parentAgent: "orchestrator",
    executionOrder: 1,
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 12,
    agentKey: "gtm",
    displayName: "GTM Strategy Analysis",
    description: "Evaluate go-to-market strategy",
    category: "analysis",
    systemPrompt: "You are a go-to-market strategist. Evaluate {companyName}'s GTM strategy.\n\nScore (1-10) based on:\n- Channel strategy clarity\n- Customer acquisition cost\n- Sales efficiency\n- Market positioning\n- Expansion strategy",
    humanPrompt: "Analyze GTM strategy for {companyName}. Strategy data: {gtmData}",
    tools: ["scoring"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "gtmData", description: "GTM strategy information", required: true },
    ],
    outputs: [
      { key: "score", type: "number", description: "GTM score 1-10" },
      { key: "analysis", type: "string", description: "Detailed analysis" },
    ],
    parentAgent: "orchestrator",
    executionOrder: 1,
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 13,
    agentKey: "financials",
    displayName: "Financial Analysis",
    description: "Evaluate financial health and projections",
    category: "analysis",
    systemPrompt: "You are a financial analyst. Evaluate {companyName}'s financials.\n\nScore (1-10) based on:\n- Current financial health\n- Burn rate vs runway\n- Revenue projections\n- Capital efficiency\n- Funding history",
    humanPrompt: "Analyze financials for {companyName}. Financial data: {financialData}",
    tools: ["scoring", "financial_analysis"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "financialData", description: "Financial information", required: true },
    ],
    outputs: [
      { key: "score", type: "number", description: "Financial score 1-10" },
      { key: "analysis", type: "string", description: "Detailed analysis" },
    ],
    parentAgent: "orchestrator",
    executionOrder: 1,
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 14,
    agentKey: "competitiveAdvantage",
    displayName: "Competitive Advantage Analysis",
    description: "Evaluate moats and defensibility",
    category: "analysis",
    systemPrompt: "You are a competitive strategy analyst. Evaluate {companyName}'s competitive advantage.\n\nScore (1-10) based on:\n- Proprietary technology\n- Network effects\n- Data moats\n- Brand/switching costs\n- First-mover advantage",
    humanPrompt: "Analyze competitive advantage for {companyName}. Competitive data: {competitiveData}",
    tools: ["scoring"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "competitiveData", description: "Competitive landscape data", required: true },
    ],
    outputs: [
      { key: "score", type: "number", description: "Competitive advantage score 1-10" },
      { key: "analysis", type: "string", description: "Detailed analysis" },
    ],
    parentAgent: "orchestrator",
    executionOrder: 1,
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 15,
    agentKey: "legal",
    displayName: "Legal & Regulatory Analysis",
    description: "Evaluate legal and regulatory risks",
    category: "analysis",
    systemPrompt: "You are a legal risk analyst. Evaluate legal and regulatory factors for {companyName}.\n\nScore (1-10) based on:\n- Regulatory compliance\n- IP protection\n- Legal structure\n- Industry-specific regulations\n- Potential legal risks",
    humanPrompt: "Analyze legal/regulatory factors for {companyName}. Legal data: {legalData}",
    tools: ["scoring"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "legalData", description: "Legal and regulatory information", required: true },
    ],
    outputs: [
      { key: "score", type: "number", description: "Legal score 1-10" },
      { key: "analysis", type: "string", description: "Detailed analysis" },
    ],
    parentAgent: "orchestrator",
    executionOrder: 1,
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 16,
    agentKey: "dealTerms",
    displayName: "Deal Terms Analysis",
    description: "Evaluate deal structure and terms",
    category: "analysis",
    systemPrompt: "You are a deal terms analyst. Evaluate the investment terms for {companyName}.\n\nScore (1-10) based on:\n- Valuation reasonableness\n- Round structure\n- Investor rights\n- Cap table health\n- Terms vs market",
    humanPrompt: "Analyze deal terms for {companyName}. Deal data: {dealData}",
    tools: ["scoring"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "dealData", description: "Deal terms information", required: true },
    ],
    outputs: [
      { key: "score", type: "number", description: "Deal terms score 1-10" },
      { key: "analysis", type: "string", description: "Detailed analysis" },
    ],
    parentAgent: "orchestrator",
    executionOrder: 1,
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 17,
    agentKey: "exitPotential",
    displayName: "Exit Potential Analysis",
    description: "Evaluate exit opportunities",
    category: "analysis",
    systemPrompt: "You are an exit strategy analyst. Evaluate exit potential for {companyName}.\n\nScore (1-10) based on:\n- M&A landscape\n- IPO potential\n- Comparable exits\n- Strategic acquirer interest\n- Timeline to exit",
    humanPrompt: "Analyze exit potential for {companyName}. Exit data: {exitData}",
    tools: ["scoring", "ma_data"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "exitData", description: "Exit landscape information", required: true },
    ],
    outputs: [
      { key: "score", type: "number", description: "Exit potential score 1-10" },
      { key: "analysis", type: "string", description: "Detailed analysis" },
    ],
    parentAgent: "orchestrator",
    executionOrder: 1,
    isParallel: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 18,
    agentKey: "synthesis",
    displayName: "Synthesis Agent",
    description: "Synthesize all analyses into final evaluation",
    category: "synthesis",
    systemPrompt: "You are the synthesis agent. Combine all analysis results for {companyName} into a comprehensive investment memo.\n\nCreate:\n- Executive summary\n- Overall score (weighted average)\n- Key strengths\n- Key risks/concerns\n- Investment recommendation\n- Suggested next steps",
    humanPrompt: "Synthesize evaluation for {companyName}. Analysis results: {analysisResults}",
    tools: ["scoring", "memo_generator"],
    inputs: [
      { key: "companyName", description: "Company name", required: true },
      { key: "analysisResults", description: "All analysis agent outputs", required: true },
    ],
    outputs: [
      { key: "memo", type: "object", description: "Investment memo" },
      { key: "overallScore", type: "number", description: "Overall score 1-10" },
    ],
    parentAgent: "orchestrator",
    executionOrder: 2,
    version: 1,
    createdAt: new Date().toISOString(),
  },

  // Stage 5: Investor Matching (2 agents)
  {
    id: 19,
    agentKey: "investorThesis",
    displayName: "Investor Thesis Extraction",
    description: "Extract and structure investor thesis",
    category: "investor",
    systemPrompt: "You are an investor thesis specialist. Analyze the investment thesis for {investorName}.\n\nExtract:\n- Investment focus areas\n- Stage preferences\n- Check size range\n- Geographic focus\n- Sector expertise\n- Value-add capabilities",
    humanPrompt: "Extract thesis for {investorName}. Profile data: {investorProfile}",
    tools: ["thesis_extraction"],
    inputs: [
      { key: "investorName", description: "Investor name", required: true },
      { key: "investorProfile", description: "Investor profile data", required: true },
    ],
    outputs: [
      { key: "thesis", type: "object", description: "Structured investment thesis" },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 20,
    agentKey: "thesisAlignment",
    displayName: "Thesis Alignment Scoring",
    description: "Score startup-investor thesis alignment",
    category: "investor",
    systemPrompt: "You are a matching specialist. Score the alignment between {companyName} and {investorName}.\n\nEvaluate fit on:\n- Sector alignment\n- Stage fit\n- Check size match\n- Geographic fit\n- Thesis alignment\n- Value-add relevance",
    humanPrompt: "Score alignment between {companyName} and {investorName}. Startup: {startupData}, Thesis: {investorThesis}",
    tools: ["scoring", "matching"],
    inputs: [
      { key: "companyName", description: "Startup name", required: true },
      { key: "investorName", description: "Investor name", required: true },
      { key: "startupData", description: "Startup evaluation data", required: true },
      { key: "investorThesis", description: "Investor thesis", required: true },
    ],
    outputs: [
      { key: "alignmentScore", type: "number", description: "Alignment score 0-100" },
      { key: "fitAnalysis", type: "object", description: "Detailed fit analysis" },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
  },
];

export const Route = createFileRoute("/_protected/admin/agents")({
  component: AdminAgentsPage,
});

const agentIcons: Record<string, typeof Bot> = {
  orchestrator: Workflow,
  team: Users,
  market: TrendingUp,
  product: Package,
  traction: Target,
  businessModel: DollarSign,
  gtm: BarChart3,
  financials: DollarSign,
  competitiveAdvantage: Shield,
  legal: Scale,
  dealTerms: Landmark,
  exitPotential: GitMerge,
  synthesis: GitMerge,
  dataExtraction: FileSearch,
  teamLinkedInResearch: Linkedin,
  researchOrchestrator: Layers,
  teamDeepResearch: Users,
  marketDeepResearch: TrendingUp,
  productDeepResearch: Package,
  newsSearch: Newspaper,
  investorThesis: FileText,
  thesisAlignment: Handshake,
};

const categoryColors: Record<string, string> = {
  orchestrator:
    "bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/50 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20",
  analysis:
    "bg-white dark:bg-gray-500/5 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-500/10",
  synthesis:
    "bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/50 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20",
  extraction:
    "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/50 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20",
  research:
    "bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/50 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20",
  "research-task":
    "bg-white dark:bg-red-500/10 border-red-200 dark:border-red-500/50 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/20",
  investor:
    "bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/50 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20",
};

const agentIconColors: Record<string, string> = {
  team: "text-rose-400 dark:text-rose-400",
  market: "text-teal-500 dark:text-teal-400",
  product: "text-violet-500 dark:text-violet-400",
  traction: "text-emerald-500 dark:text-emerald-400",
  businessModel: "text-emerald-600 dark:text-emerald-400",
  gtm: "text-blue-500 dark:text-blue-400",
  financials: "text-emerald-600 dark:text-emerald-400",
  competitiveAdvantage: "text-blue-500 dark:text-blue-400",
  legal: "text-amber-500 dark:text-amber-400",
  dealTerms: "text-blue-500 dark:text-blue-400",
  exitPotential: "text-emerald-500 dark:text-emerald-400",
};

// API functions removed - using mock data

function VariableHighlighter({ text }: { text: string }) {
  const parts = text.split(/(\{[^}]+\})/g);

  return (
    <div className="whitespace-pre-wrap font-mono text-sm">
      {parts.map((part, index) => {
        if (part.startsWith("{") && part.endsWith("}")) {
          return (
            <span
              key={index}
              className="bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1 py-0.5 rounded border border-amber-500/30 font-semibold"
            >
              {part}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
}

function AgentBox({
  agent,
  onClick,
  size = "normal",
}: {
  agent: AgentPrompt;
  onClick: () => void;
  size?: "normal" | "large";
}) {
  const Icon = agentIcons[agent.agentKey] || Bot;
  const colorClass = categoryColors[agent.category || "analysis"];
  const iconColor = agentIconColors[agent.agentKey];

  return (
    <button
      onClick={onClick}
      className={`${colorClass} border-2 rounded-lg cursor-pointer transition-all ${
        size === "large" ? "px-6 py-4" : "px-3 py-2"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`${size === "large" ? "w-6 h-6" : "w-4 h-4"} ${iconColor || ""}`} />
        <span className={`font-semibold ${size === "large" ? "text-base" : "text-xs"}`}>
          {agent.displayName.replace(" Agent", "").replace(" Analysis", "")}
        </span>
      </div>
    </button>
  );
}

function AgentEditorPanel({
  agent,
  isOpen,
  onClose,
  onSave,
  isSaving,
}: {
  agent: AgentPrompt | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<AgentPrompt>) => void;
  isSaving: boolean;
}) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [humanPrompt, setHumanPrompt] = useState("");
  const [description, setDescription] = useState("");

  const variables = useMemo(() => {
    if (!agent) return [];
    const allText = agent.systemPrompt + " " + (agent.humanPrompt || "");
    const matches = allText.match(/\{([^}]+)\}/g) || [];
    return Array.from(new Set(matches.map((m) => m.slice(1, -1))));
  }, [agent]);

  useEffect(() => {
    if (agent) {
      setSystemPrompt(agent.systemPrompt);
      setHumanPrompt(agent.humanPrompt || "");
      setDescription(agent.description || "");
    }
  }, [agent]);

  if (!agent) return null;

  const handleSave = () => {
    onSave({
      systemPrompt,
      humanPrompt,
      description,
    });
  };

  const hasChanges =
    systemPrompt !== agent.systemPrompt ||
    humanPrompt !== (agent.humanPrompt || "") ||
    description !== (agent.description || "");

  const Icon = agentIcons[agent.agentKey] || Bot;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[600px] sm:max-w-[600px] overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5" />
            {agent.displayName}
          </SheetTitle>
          <SheetDescription>
            Edit the prompts and configuration for this agent
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="prompts" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
            <TabsTrigger value="io">Inputs/Outputs</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="prompts" className="space-y-4 px-1">
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of what this agent does"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="systemPrompt">System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                  placeholder="The system instructions for this agent..."
                />
                <p className="text-xs text-muted-foreground">
                  Variables in curly braces (e.g., {"{companyName}"}) will be replaced
                  with actual values at runtime.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="humanPrompt">Human Prompt Template</Label>
                <Textarea
                  id="humanPrompt"
                  value={humanPrompt}
                  onChange={(e) => setHumanPrompt(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                  placeholder="The human message template..."
                />
              </div>

              <div className="space-y-2">
                <Label>Detected Variables</Label>
                <div className="flex flex-wrap gap-1">
                  {variables.map((variable) => (
                    <Badge
                      key={variable}
                      variant="outline"
                      className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    >
                      {"{" + variable + "}"}
                    </Badge>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="io" className="space-y-4 px-1">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileInput className="w-4 h-4" />
                  Inputs
                </Label>
                <div className="space-y-2">
                  {agent.inputs?.map((input: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 p-2 bg-muted/50 rounded-md"
                    >
                      <Badge
                        variant={input.required ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {input.key}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {input.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileOutput className="w-4 h-4" />
                  Outputs
                </Label>
                <div className="space-y-2">
                  {agent.outputs?.map((output: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 p-2 bg-muted/50 rounded-md"
                    >
                      <Badge variant="outline" className="text-xs">
                        {output.key}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {output.type}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {output.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Wrench className="w-4 h-4" />
                  Tools
                </Label>
                <div className="flex flex-wrap gap-1">
                  {agent.tools?.map((tool: string) => (
                    <Badge key={tool} variant="outline">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="space-y-4 px-1">
              <div className="space-y-2">
                <Label>System Prompt Preview</Label>
                <div className="p-3 bg-muted/50 rounded-md max-h-[250px] overflow-auto">
                  <VariableHighlighter text={systemPrompt} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Human Prompt Preview</Label>
                <div className="p-3 bg-muted/50 rounded-md max-h-[200px] overflow-auto">
                  <VariableHighlighter text={humanPrompt} />
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <SheetFooter className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              Version {agent.version}
              {agent.lastModifiedBy && ` • Last edited by ${agent.lastModifiedBy}`}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                {isSaving ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function AdminAgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState<AgentPrompt | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Using mock data - backend not connected
  const agents = MOCK_AGENTS;
  const isLoading = false;

  const updateMutation = useMutation({
    mutationFn: async (_data: { agentKey: string; updates: Partial<AgentPrompt> }) => {
      // No-op - mock save
    },
    onSuccess: () => {
      setIsPanelOpen(false);
      toast.success("Agent updated (mock)", {
        description: "Changes saved locally - backend not connected.",
      });
    },
  });

  const handleAgentClick = (agent: AgentPrompt) => {
    setSelectedAgent(agent);
    setIsPanelOpen(true);
  };

  const handleSave = (updates: Partial<AgentPrompt>) => {
    if (selectedAgent) {
      updateMutation.mutate({ agentKey: selectedAgent.agentKey, updates });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const noAgents = !agents || agents.length === 0;

  const researchOrchestrator = agents?.find((a) => a.agentKey === "researchOrchestrator");
  const researchAgentKeys = [
    "teamDeepResearch",
    "marketDeepResearch",
    "productDeepResearch",
    "newsSearch",
  ];
  const researchAgents = agents?.filter((a) => researchAgentKeys.includes(a.agentKey)) || [];

  const orchestrator = agents?.find((a) => a.agentKey === "orchestrator");
  const analysisAgents = agents?.filter((a) => a.category === "analysis") || [];
  const synthesisAgent = agents?.find((a) => a.agentKey === "synthesis");

  const investorAgents = agents?.filter((a) => a.category === "investor") || [];

  const row1Agents = analysisAgents.slice(0, 6);
  const row2Agents = analysisAgents.slice(6);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Prompts</h1>
          <p className="text-muted-foreground">
            View and edit the AI agents that analyze startups. Click on any agent to edit
            its prompts.
          </p>
        </div>
        {/* Seed button removed - using mock data */}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="w-5 h-5" />
            5-Stage Research, Evaluation & Matching Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {noAgents ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>
                  No agents configured. Click &quot;Initialize Agents&quot; to set up the
                  default agents.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 space-y-4">
              {/* Stage 1: Data Extraction */}
              <div className="text-center">
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Stage 1: Data Extraction
                </div>
                <div className="flex gap-3 justify-center">
                  <div className="px-4 py-3 rounded-lg border-2 border-dashed border-red-200 dark:border-red-600 bg-white dark:bg-red-950/30">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                      <FileSearch className="w-5 h-5" />
                      <span className="font-medium">Document Parsing</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Extract text from pitch deck
                    </p>
                  </div>
                  <div className="px-4 py-3 rounded-lg border-2 border-dashed border-red-200 dark:border-red-600 bg-white dark:bg-red-950/30">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                      <Globe className="w-5 h-5" />
                      <span className="font-medium">Website Scraping</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Deep scrape up to 20 pages
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-4 bg-border" />
                <ArrowDown className="w-5 h-5" />
              </div>

              {/* Stage 2: LinkedIn Research */}
              <div className="text-center">
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Stage 2: Team LinkedIn Research
                </div>
                <div className="px-4 py-3 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <Linkedin className="w-5 h-5" />
                    <span className="font-medium">LinkedIn Enrichment</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Discover team members & fetch profiles via Unipile
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-4 bg-border" />
                <ArrowDown className="w-5 h-5" />
              </div>

              {/* Stage 3: Research */}
              <div className="text-center">
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Stage 3: Deep Research
                </div>
                {researchOrchestrator && (
                  <AgentBox
                    agent={researchOrchestrator}
                    onClick={() => handleAgentClick(researchOrchestrator)}
                    size="large"
                  />
                )}
              </div>

              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-3 bg-border" />
                <ArrowDown className="w-4 h-4" />
              </div>

              <div className="flex flex-wrap justify-center gap-2 max-w-3xl">
                {researchAgents.map((agent) => (
                  <AgentBox
                    key={agent.agentKey}
                    agent={agent}
                    onClick={() => handleAgentClick(agent)}
                  />
                ))}
              </div>

              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-4 bg-border" />
                <ArrowDown className="w-5 h-5" />
              </div>

              {/* Stage 4: Evaluation */}
              <div className="text-center">
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Stage 4: Evaluation Pipeline
                </div>
                {orchestrator && (
                  <AgentBox
                    agent={orchestrator}
                    onClick={() => handleAgentClick(orchestrator)}
                    size="large"
                  />
                )}
              </div>

              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-3 bg-border" />
                <ArrowDown className="w-4 h-4" />
              </div>

              <div className="flex flex-wrap justify-center gap-2 max-w-4xl">
                {row1Agents.map((agent) => (
                  <AgentBox
                    key={agent.agentKey}
                    agent={agent}
                    onClick={() => handleAgentClick(agent)}
                  />
                ))}
              </div>

              <div className="flex flex-wrap justify-center gap-2 max-w-4xl">
                {row2Agents.map((agent) => (
                  <AgentBox
                    key={agent.agentKey}
                    agent={agent}
                    onClick={() => handleAgentClick(agent)}
                  />
                ))}
              </div>

              <div className="flex flex-col items-center text-muted-foreground">
                <div className="w-px h-3 bg-border" />
                <ArrowDown className="w-4 h-4" />
              </div>

              {synthesisAgent && (
                <AgentBox
                  agent={synthesisAgent}
                  onClick={() => handleAgentClick(synthesisAgent)}
                  size="large"
                />
              )}

              {investorAgents.length > 0 && (
                <>
                  <div className="flex flex-col items-center text-muted-foreground">
                    <div className="w-px h-4 bg-border" />
                    <ArrowDown className="w-5 h-5" />
                  </div>

                  <div className="text-center">
                    <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                      Stage 5: Investor Matching
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {investorAgents.map((agent) => (
                        <AgentBox
                          key={agent.agentKey}
                          agent={agent}
                          onClick={() => handleAgentClick(agent)}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AgentEditorPanel
        agent={selectedAgent}
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onSave={handleSave}
        isSaving={updateMutation.isPending}
      />
    </div>
  );
}
