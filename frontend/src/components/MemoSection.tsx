import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, Info, RefreshCw, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface AdminFeedbackProps {
  sectionKey: string;
  evaluationId: number;
  existingComment?: string;
  onReanalyze: (sectionKey: string, comment: string) => Promise<void>;
  isReanalyzing?: boolean;
}

interface MemoSectionProps {
  title: string;
  icon: LucideIcon;
  score?: number | null;
  weight?: string;
  summary: string | null;
  details?: React.ReactNode;
  evaluationNote?: string;
  trend?: "up" | "down" | "neutral";
  defaultExpanded?: boolean;
  adminFeedback?: AdminFeedbackProps;
  animateOnChange?: boolean;
  animateOnMount?: boolean;
}

export function MemoSection({
  title,
  icon: Icon,
  score,
  weight,
  summary,
  details,
  evaluationNote,
  trend,
  adminFeedback,
  animateOnChange = true,
  animateOnMount = false,
}: MemoSectionProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState(adminFeedback?.existingComment || "");
  const [isAnimating, setIsAnimating] = useState(false);
  const prevSummaryRef = useRef<string | null>(null);
  const prevScoreRef = useRef<number | null | undefined>(undefined);
  const hasAnimatedOnMount = useRef(false);

  // Detect content changes and trigger animation
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (animateOnChange) {
      const isFirstLoad = prevSummaryRef.current === null && summary !== null;
      const summaryChanged = prevSummaryRef.current !== null && prevSummaryRef.current !== summary;
      const scoreChanged = prevScoreRef.current !== undefined && prevScoreRef.current !== score;

      // Animate on first load if animateOnMount is true, or on subsequent changes
      const shouldAnimate = (isFirstLoad && animateOnMount && !hasAnimatedOnMount.current) || summaryChanged || scoreChanged;

      if (shouldAnimate) {
        setIsAnimating(true);
        hasAnimatedOnMount.current = true;
        timer = setTimeout(() => setIsAnimating(false), 1500);
      }
    }

    // Always update refs to track current values
    prevSummaryRef.current = summary;
    prevScoreRef.current = score;

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [summary, score, animateOnChange, animateOnMount]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-chart-2 bg-chart-2/10";
    if (score >= 60) return "text-chart-3 bg-chart-3/10";
    if (score >= 40) return "text-chart-4 bg-chart-4/10";
    return "text-chart-5 bg-chart-5/10";
  };

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  const handleReanalyze = async () => {
    if (adminFeedback && feedbackComment.trim()) {
      await adminFeedback.onReanalyze(adminFeedback.sectionKey, feedbackComment.trim());
      setShowFeedback(false);
    }
  };

  if (!summary && !details) return null;

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardContent className="p-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">{title}</h3>
          {weight && (
            <Badge variant="outline" className="text-xs font-normal py-0 h-5">
              Weight: {weight}
            </Badge>
          )}
          {score !== null && score !== undefined && (
            <Badge className={`${getScoreColor(score)} border-0 py-0 h-5`}>
              Score: {score}/100
            </Badge>
          )}
          {trend && (
            <TrendIcon className={`w-3 h-3 ${
              trend === "up" ? "text-chart-2" :
              trend === "down" ? "text-chart-5" :
              "text-muted-foreground"
            }`} />
          )}
          {evaluationNote && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm text-xs">
                <p>{evaluationNote}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {adminFeedback && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 ml-auto"
              onClick={() => setShowFeedback(!showFeedback)}
              data-testid={`button-feedback-${adminFeedback.sectionKey}`}
            >
              <MessageSquare className="w-3 h-3 mr-1" />
              Feedback
              {showFeedback ? (
                <ChevronUp className="w-3 h-3 ml-1" />
              ) : (
                <ChevronDown className="w-3 h-3 ml-1" />
              )}
            </Button>
          )}
        </div>

        {adminFeedback && showFeedback && (
          <div className="p-3 border rounded-md bg-muted/30 space-y-2">
            <Textarea
              placeholder="Provide specific guidance for the AI to re-analyze this section (e.g., 'Focus more on the CTO's technical background' or 'The market size seems understated, consider these data points...')"
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              className="min-h-[80px] text-sm"
              data-testid={`input-feedback-${adminFeedback.sectionKey}`}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                The AI will re-analyze this section with your guidance.
              </p>
              <Button
                size="sm"
                onClick={handleReanalyze}
                disabled={!feedbackComment.trim() || adminFeedback.isReanalyzing}
                data-testid={`button-reanalyze-${adminFeedback.sectionKey}`}
              >
                {adminFeedback.isReanalyzing ? (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                    Re-analyzing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Re-analyze Section
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {summary && (
          <div className={`text-sm text-muted-foreground leading-relaxed rounded-md ${isAnimating ? "animate-content-update" : ""}`}>
            {summary.split('\n\n').map((paragraph, idx) => (
              <p key={idx} className="mb-2 last:mb-0">{paragraph}</p>
            ))}
          </div>
        )}

        {details && (
          <div className={`text-sm text-muted-foreground ${isAnimating ? "animate-content-update" : ""}`}>
            {details}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CompetitorCardProps {
  name: string;
  description?: string;
  positioning?: string;
  threat?: "high" | "medium" | "low";
  differentiator?: string;
}

export function CompetitorCard({ name, description, positioning, threat, differentiator }: CompetitorCardProps) {
  const threatColors = {
    high: "text-chart-5 bg-chart-5/10",
    medium: "text-chart-4 bg-chart-4/10",
    low: "text-chart-2 bg-chart-2/10",
  };

  return (
    <div className="p-4 border rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">{name}</h4>
        {threat && (
          <Badge className={`${threatColors[threat]} border-0 text-xs`}>
            {threat} threat
          </Badge>
        )}
      </div>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {positioning && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Position:</span> {positioning}
        </p>
      )}
      {differentiator && (
        <p className="text-xs text-primary">
          <span className="font-medium">Our edge:</span> {differentiator}
        </p>
      )}
    </div>
  );
}

interface FundingRoundProps {
  round: string;
  date?: string;
  amount?: string;
  valuation?: string;
  leadInvestor?: string;
  investors?: string[];
}

export function FundingRoundCard({ round, date, amount, valuation, leadInvestor, investors }: FundingRoundProps) {
  return (
    <div className="flex items-start gap-4 p-4 border rounded-lg">
      <div className="w-3 h-3 rounded-full bg-primary mt-1.5 shrink-0" />
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">{round}</h4>
          {date && <span className="text-xs text-muted-foreground">{date}</span>}
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {amount && (
            <span className="text-chart-2 font-medium">{amount}</span>
          )}
          {valuation && (
            <span className="text-muted-foreground">@ {valuation}</span>
          )}
        </div>
        {leadInvestor && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Lead:</span> {leadInvestor}
          </p>
        )}
        {investors && investors.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Participants:</span> {investors.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
