import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  Target,
  Cpu,
  TrendingUp,
  DollarSign,
  Megaphone,
  PiggyBank,
  Shield,
  Scale,
  Handshake,
  LogOut,
  CheckCircle,
  Loader2,
  FileText,
  Search,
  Brain,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@/api/client";

interface ScoringWeights {
  team: number;
  market: number;
  product: number;
  traction: number;
  businessModel: number;
  gtm: number;
  financials: number;
  competitiveAdvantage: number;
  legal: number;
  dealTerms: number;
  exitPotential: number;
}

interface StageProgress {
  stage: number;
  label: string;
  status: "pending" | "running" | "completed";
  startedAt?: string;
  completedAt?: string;
}

interface AnalysisProgressData {
  currentStage: number;
  currentStageLabel: string;
  completedAgents: string[];
  currentAgent: string | null;
  runningAgents: string[];
  deepResearchAgents: string[];
  completedDeepResearchAgents: string[];
  runningDeepResearchAgents: string[];
  startedAt: string;
  lastUpdatedAt: string;
  stageProgress: StageProgress[];
}

interface AnalysisProgressResponse {
  status: string;
  progress: AnalysisProgressData | null;
}

interface AnalysisProgressProps {
  startupId: number;
  isAnalyzing: boolean;
  weights: ScoringWeights;
  progress?: AnalysisProgressData | null;
}

const STAGES = [
  { stage: 1, label: "Extracting pitch deck", icon: FileText, weight: 10 },
  { stage: 2, label: "Scraping company website", icon: Search, weight: 10 },
  { stage: 3, label: "Deep research agents", icon: Brain, weight: 50 },
  { stage: 4, label: "AI evaluation", icon: Sparkles, weight: 20 },
  { stage: 5, label: "Final synthesis", icon: Brain, weight: 10 },
];

const DEEP_RESEARCH_AGENTS = [
  {
    id: "teamResearch",
    name: "Team Research",
    icon: Users,
    description: "Discovering team members, LinkedIn profiles, past accomplishments",
  },
  {
    id: "newsResearch",
    name: "News & PR",
    icon: FileText,
    description: "Recent news, press releases, funding announcements",
  },
  {
    id: "marketResearch",
    name: "Market Research",
    icon: Target,
    description: "TAM/SAM/SOM validation, market trends, growth forecasts",
  },
  {
    id: "productResearch",
    name: "Product & Competitors",
    icon: Cpu,
    description: "Competitive analysis, product positioning, technology assessment",
  },
];

function getAgents(weights: ScoringWeights) {
  return [
    {
      id: "team",
      name: "Team Analysis",
      icon: Users,
      weight: `${weights.team}%`,
      description: "Founder-market fit, track record, team composition",
    },
    {
      id: "market",
      name: "Market Analysis",
      icon: Target,
      weight: `${weights.market}%`,
      description: "TAM/SAM/SOM, market dynamics, competitive landscape",
    },
    {
      id: "product",
      name: "Product/Technology",
      icon: Cpu,
      weight: `${weights.product}%`,
      description: "Product differentiation, technology readiness",
    },
    {
      id: "traction",
      name: "Traction Analysis",
      icon: TrendingUp,
      weight: `${weights.traction}%`,
      description: "Revenue stage, growth signals, momentum",
    },
    {
      id: "businessModel",
      name: "Business Model",
      icon: DollarSign,
      weight: `${weights.businessModel}%`,
      description: "Unit economics, CAC/LTV, revenue model",
    },
    {
      id: "gtm",
      name: "Go-to-Market",
      icon: Megaphone,
      weight: `${weights.gtm}%`,
      description: "Sales motion, channel strategy, virality",
    },
    {
      id: "financials",
      name: "Financials",
      icon: PiggyBank,
      weight: `${weights.financials}%`,
      description: "Capital efficiency, burn rate, runway",
    },
    {
      id: "competitiveAdvantage",
      name: "Competitive Advantage",
      icon: Shield,
      weight: `${weights.competitiveAdvantage}%`,
      description: "Moat analysis, barriers to entry",
    },
    {
      id: "legal",
      name: "Legal/Regulatory",
      icon: Scale,
      weight: `${weights.legal}%`,
      description: "Compliance, IP analysis, regulatory outlook",
    },
    {
      id: "dealTerms",
      name: "Deal Terms",
      icon: Handshake,
      weight: `${weights.dealTerms}%`,
      description: "Valuation, deal structure, dilution",
    },
    {
      id: "exitPotential",
      name: "Exit Potential",
      icon: LogOut,
      weight: `${weights.exitPotential}%`,
      description: "M&A activity, IPO feasibility",
    },
  ];
}

export function AnalysisProgress({
  startupId,
  isAnalyzing,
  weights,
  progress: progressOverride = null,
}: AnalysisProgressProps) {
  const agents = getAgents(weights);

  const { data: progressData } = useQuery<AnalysisProgressResponse>({
    queryKey: ["/startups", startupId, "progress"],
    queryFn: () =>
      customFetch<AnalysisProgressResponse>(`/startups/${startupId}/progress`),
    enabled: isAnalyzing && !progressOverride,
    refetchInterval: isAnalyzing && !progressOverride ? 2000 : false,
  });

  const progress = progressOverride ?? progressData?.progress;
  const completedAgents = new Set(progress?.completedAgents || []);
  const runningAgents = new Set(progress?.runningAgents || []);
  const currentStage = progress?.currentStage || 1;
  const stageProgress = progress?.stageProgress || [];

  const completedDeepResearchAgents = new Set(
    progress?.completedDeepResearchAgents || [],
  );
  const runningDeepResearchAgents = new Set(
    progress?.runningDeepResearchAgents || [],
  );

  const completedAgentCount = completedAgents.size;
  const totalAgents = agents.length;
  const completedDeepResearchCount = completedDeepResearchAgents.size;
  const totalDeepResearchAgents = DEEP_RESEARCH_AGENTS.length;

  const STAGE_WEIGHTS = [0, 10, 10, 50, 20, 10];

  const calculateProgress = () => {
    if (!isAnalyzing) return 100;

    let progressValue = 0;
    for (let i = 1; i < currentStage; i++) {
      progressValue += STAGE_WEIGHTS[i];
    }

    if (currentStage === 3 && totalDeepResearchAgents > 0) {
      progressValue +=
        (completedDeepResearchCount / totalDeepResearchAgents) *
        STAGE_WEIGHTS[3];
    } else if (currentStage === 4 && totalAgents > 0) {
      progressValue +=
        (completedAgentCount / totalAgents) * STAGE_WEIGHTS[4];
    } else if (currentStage <= 5) {
      progressValue += STAGE_WEIGHTS[currentStage] * 0.5;
    }

    return Math.min(95, progressValue);
  };

  const overallProgress = calculateProgress();
  const isComplete = !isAnalyzing;

  return (
    <Card
      data-testid="card-analysis-progress"
      className={isComplete ? "border-chart-2/50" : ""}
    >
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          {isComplete ? (
            <>
              <Sparkles className="w-5 h-5 text-chart-2 animate-fade-in" />
              <span className="text-chart-2 animate-fade-in">
                Analysis Complete
              </span>
            </>
          ) : (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              AI Analysis in Progress
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span
              className={`font-medium transition-colors duration-300 ${
                isComplete ? "text-chart-2" : ""
              }`}
            >
              {Math.round(overallProgress)}%
            </span>
          </div>
          <Progress
            value={overallProgress}
            className="h-2"
            animated={isAnalyzing}
            data-testid="progress-overall"
          />
        </div>

        {isAnalyzing && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Analysis Stages</h4>
            <div className="space-y-2">
              {STAGES.map((stage) => {
                const stageData = stageProgress.find(
                  (s) => s.stage === stage.stage,
                );
                const status =
                  stageData?.status ||
                  (stage.stage < currentStage
                    ? "completed"
                    : stage.stage === currentStage
                    ? "running"
                    : "pending");
                const Icon = stage.icon;

                return (
                  <div
                    key={stage.stage}
                    className={`flex items-center gap-3 p-2 rounded-lg transition-all duration-300 ${
                      status === "running"
                        ? "bg-primary/10"
                        : status === "completed"
                        ? "bg-chart-2/10"
                        : ""
                    }`}
                    data-testid={`stage-${stage.stage}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                        status === "completed"
                          ? "bg-chart-2/20 text-chart-2"
                          : status === "running"
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {status === "completed" ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : status === "running" ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Icon className="w-3 h-3" />
                      )}
                    </div>
                    <span
                      className={`text-sm transition-colors duration-300 ${
                        status === "completed"
                          ? "text-chart-2"
                          : status === "running"
                          ? "text-primary font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {stage.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {currentStage === 3 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">
              Deep Research Agents
              <span className="text-muted-foreground ml-2">
                ({completedDeepResearchCount}/{totalDeepResearchAgents})
              </span>
            </h4>
            <div className="space-y-2">
              {DEEP_RESEARCH_AGENTS.map((agent) => {
                const isCompleted = completedDeepResearchAgents.has(agent.id);
                const isRunning = runningDeepResearchAgents.has(agent.id);
                const Icon = agent.icon;

                return (
                  <div
                    key={agent.id}
                    className={`flex items-center gap-3 p-2 rounded-lg transition-all duration-300 ${
                      isRunning ? "bg-primary/10" : isCompleted ? "bg-muted/30" : ""
                    }`}
                    data-testid={`deep-research-agent-status-${agent.id}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isCompleted
                          ? "bg-chart-2/20 text-chart-2"
                          : isRunning
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : isRunning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-sm font-medium transition-colors duration-300 ${
                          isCompleted
                            ? "text-chart-2"
                            : isRunning
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        {agent.name}
                      </span>
                      <p className="text-xs text-muted-foreground truncate">
                        {agent.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {currentStage >= 4 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">
              {isComplete
                ? "11-Section Framework Results"
                : "11-Section Framework Agents"}
              {!isComplete && (
                <span className="text-muted-foreground ml-2">
                  ({completedAgentCount}/{totalAgents})
                </span>
              )}
            </h4>
            <div className="space-y-2">
              {agents.map((agent) => {
                const isCompleted = completedAgents.has(agent.id) || isComplete;
                const isRunning = runningAgents.has(agent.id);
                const Icon = agent.icon;

                return (
                  <div
                    key={agent.id}
                    className={`flex items-center gap-3 p-2 rounded-lg transition-all duration-300 ${
                      isRunning ? "bg-primary/10" : isCompleted ? "bg-muted/30" : ""
                    }`}
                    data-testid={`agent-status-${agent.id}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isCompleted
                          ? "bg-chart-2/20 text-chart-2"
                          : isRunning
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : isRunning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-medium transition-colors duration-300 ${
                            isCompleted
                              ? "text-chart-2"
                              : isRunning
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}
                        >
                          {agent.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {agent.weight}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {agent.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p
          className={`text-sm text-center transition-colors duration-300 ${
            isComplete ? "text-chart-2" : "text-muted-foreground"
          }`}
        >
          {isComplete
            ? "All AI agents have completed their analysis successfully!"
            : progress?.currentStageLabel || "Initializing analysis pipeline..."}
        </p>
      </CardContent>
    </Card>
  );
}
