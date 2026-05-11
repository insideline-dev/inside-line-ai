import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, Info, RefreshCw, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { CitedText } from "./CitedText";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

interface AdminFeedbackProps {
  sectionKey: string;
  evaluationId: string;
  existingComment?: string;
  onReanalyze: (sectionKey: string, evaluationId: string, comment: string) => Promise<void>;
  isReanalyzing?: boolean;
}

/**
 * DG-E1-F1-S2 — section-scoped memo regenerate handler. When provided, the
 * section header renders a Regenerate button that triggers a single-section
 * synthesis re-run. Confirmation behavior lives in the caller (parent
 * decides whether to prompt before invoking — required when operator edits
 * exist for the section).
 */
interface RegenerateSectionProps {
  sectionKey: string;
  onRegenerate: (sectionKey: string) => void;
  isRegenerating?: boolean;
  /**
   * Set when this section was previously regenerated via the section-scoped
   * endpoint — surfaced as a "Last regenerated" indicator on the header.
   */
  lastRegeneratedAt?: string;
}

interface MemoSectionProps {
  title: string;
  icon: LucideIcon;
  score?: number | null;
  weight?: string;
  summary: string | null;
  sources?: Array<{ label: string; url: string }>;
  details?: React.ReactNode;
  evaluationNote?: string;
  trend?: "up" | "down" | "neutral";
  defaultExpanded?: boolean;
  adminFeedback?: AdminFeedbackProps;
  regenerateSection?: RegenerateSectionProps;
  animateOnChange?: boolean;
  animateOnMount?: boolean;
  forcePrint?: boolean;
}

export function MemoSection({
  title,
  icon: Icon,
  score,
  weight,
  summary,
  sources,
  details,
  evaluationNote,
  trend,
  adminFeedback,
  regenerateSection,
  animateOnChange = true,
  animateOnMount = false,
  forcePrint = false,
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
    if (score >= 80) {
      return "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800";
    }
    if (score >= 60) {
      return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-800";
    }
    if (score >= 40) {
      return "text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-950/30 dark:border-orange-800";
    }
    return "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/30 dark:border-rose-800";
  };

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  const handleReanalyze = async () => {
    const trimmed = feedbackComment.trim();
    if (adminFeedback && trimmed) {
      if (trimmed.length < 10) {
        toast.error("Feedback is too short", {
          description: "Please provide at least 10 characters of guidance.",
        });
        return;
      }
      await adminFeedback.onReanalyze(adminFeedback.sectionKey, adminFeedback.evaluationId, trimmed);
      setShowFeedback(false);
    }
  };

  if (!summary && !details) return null;

  return (
    <Card className="border-0 shadow-none bg-transparent" data-print-memo-section={forcePrint ? "true" : undefined}>
      <CardContent className="p-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap print-memo-section__header">
          <Icon className="w-4 h-4 text-primary print-memo-section__icon" />
          <h3 className="text-sm font-semibold">{title}</h3>
          {weight && (
            <Badge variant="outline" className="text-xs font-normal py-0 h-5" data-print-badge={forcePrint ? "weight" : undefined}>
              Weight: {weight}
            </Badge>
          )}
          {score !== null && score !== undefined && (
            <Badge variant="outline" className={`${getScoreColor(score)} py-0 h-5`} data-print-badge={forcePrint ? "score" : undefined}>
              Score: {Math.round(score)}/100
            </Badge>
          )}
          {trend && (
            <TrendIcon className={`w-3 h-3 ${
              trend === "up" ? "text-chart-2" :
              trend === "down" ? "text-chart-5" :
              "text-muted-foreground"
            }`} />
          )}
          {!forcePrint && evaluationNote && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm text-xs">
                <p>{evaluationNote}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {regenerateSection && !forcePrint && (
            <div className="ml-auto flex items-center gap-1">
              {regenerateSection.lastRegeneratedAt && (
                <span
                  className="text-[10px] text-muted-foreground"
                  data-testid={`memo-section-last-regenerated-${regenerateSection.sectionKey}`}
                >
                  Regenerated
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={() => regenerateSection.onRegenerate(regenerateSection.sectionKey)}
                disabled={regenerateSection.isRegenerating}
                data-testid={`button-regenerate-${regenerateSection.sectionKey}`}
                aria-label={`Regenerate ${title} section`}
              >
                <RefreshCw
                  className={`w-3 h-3 mr-1 ${regenerateSection.isRegenerating ? "animate-spin" : ""}`}
                />
                {regenerateSection.isRegenerating ? "Regenerating…" : "Regenerate"}
              </Button>
            </div>
          )}
          {adminFeedback && (
            <Button
              size="sm"
              variant="ghost"
              className={regenerateSection ? "h-6 px-2" : "h-6 px-2 ml-auto"}
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
                disabled={feedbackComment.trim().length < 10 || adminFeedback.isReanalyzing}
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
          <CitedText
            text={summary}
            sources={sources}
            stripCitations={forcePrint}
            className={`text-sm text-muted-foreground leading-relaxed rounded-md ${isAnimating ? "animate-content-update" : ""}`}
          />
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
