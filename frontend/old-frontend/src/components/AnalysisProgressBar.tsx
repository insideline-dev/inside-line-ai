import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

interface AnalysisProgressResponse {
  progress: {
    currentStage: number;
    completedAgents?: string[];
    runningAgents?: string[];
    completedDeepResearchAgents?: string[];
    runningDeepResearchAgents?: string[];
  } | null;
}

const STAGE_LABELS = ["", "Extracting deck", "Scraping website", "Deep research", "AI evaluation", "Synthesizing"];
const STAGE_WEIGHTS = [0, 10, 10, 50, 20, 10];
const TOTAL_AI_AGENTS = 11;
const TOTAL_DEEP_RESEARCH_AGENTS = 4;

interface AnalysisProgressBarProps {
  startupId: number;
}

export function AnalysisProgressBar({ startupId }: AnalysisProgressBarProps) {
  const { data: progressData } = useQuery<AnalysisProgressResponse>({
    queryKey: ["/api/startups", startupId, "progress"],
    refetchInterval: 2000,
  });

  const progress = progressData?.progress;
  const currentStage = progress?.currentStage || 1;
  const completedAgentCount = progress?.completedAgents?.length || 0;
  const completedDeepResearchCount = progress?.completedDeepResearchAgents?.length || 0;

  const calculateProgress = () => {
    let progressValue = 0;
    for (let i = 1; i < currentStage; i++) {
      progressValue += STAGE_WEIGHTS[i];
    }
    
    if (currentStage === 3 && TOTAL_DEEP_RESEARCH_AGENTS > 0) {
      progressValue += (completedDeepResearchCount / TOTAL_DEEP_RESEARCH_AGENTS) * STAGE_WEIGHTS[3];
    } else if (currentStage === 4 && TOTAL_AI_AGENTS > 0) {
      progressValue += (completedAgentCount / TOTAL_AI_AGENTS) * STAGE_WEIGHTS[4];
    } else if (currentStage <= 5) {
      progressValue += STAGE_WEIGHTS[currentStage] * 0.5;
    }
    
    return Math.min(95, progressValue);
  };

  const overallProgress = calculateProgress();
  const stageLabel = STAGE_LABELS[currentStage] || "Analyzing";

  return (
    <div className="w-full space-y-2" data-testid={`progress-bar-startup-${startupId}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          {stageLabel}
        </span>
        <span className="text-muted-foreground font-medium">{Math.round(overallProgress)}%</span>
      </div>
      <Progress value={overallProgress} className="h-1.5" />
    </div>
  );
}
