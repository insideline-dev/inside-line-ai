import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { StatusBadge } from "@/components/analysis/StatusBadge";
import { AnalysisProgressBar } from "@/components/AnalysisProgressBar";
import { ExternalLink, MapPin, Calendar, DollarSign, ChevronRight } from "lucide-react";
import type { Startup, StartupStatus } from "@/types";
import { cn } from "@/lib/utils";

interface StartupCardProps {
  startup: Startup;
  basePath: string;
  showScore?: boolean;
  showActions?: boolean;
  className?: string;
}

const stageLabels: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c: "Series C",
  series_d: "Series D",
  series_e: "Series E",
  series_f_plus: "Series F+",
};

function formatCurrency(amount: number, currency = "USD"): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M ${currency}`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}K ${currency}`;
  }
  return `${amount} ${currency}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function StartupCard({ startup, basePath, showScore = true, showActions = true, className }: StartupCardProps) {
  const [effectiveStatus, setEffectiveStatus] = useState<StartupStatus>(startup.status);

  useEffect(() => {
    setEffectiveStatus(startup.status);
  }, [startup.status]);

  const handleTerminalStatus = useCallback((status: "pending_review" | "submitted") => {
    setEffectiveStatus((current) => (current === status ? current : status));
  }, []);

  return (
    <Card className={cn("hover:shadow-md transition-shadow", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-lg truncate">{startup.name}</CardTitle>
              {startup.website && (
                <a
                  href={startup.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {startup.stage && <Badge variant="secondary">{stageLabels[startup.stage] || startup.stage}</Badge>}
              {startup.sectorIndustry && <span>{startup.sectorIndustry.replace(/_/g, " ")}</span>}
            </div>
          </div>
          {showScore && startup.overallScore && <ScoreRing score={startup.overallScore} size="sm" showLabel={false} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {startup.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{startup.description}</p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {startup.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {startup.location}
            </span>
          )}
          {startup.fundingTarget && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />
              {formatCurrency(startup.fundingTarget, startup.roundCurrency)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(startup.createdAt)}
          </span>
        </div>

        {(effectiveStatus === "analyzing" || effectiveStatus === "submitted") && (
          <AnalysisProgressBar
            startupId={startup.id}
            onTerminalStatus={handleTerminalStatus}
            compact
          />
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <StatusBadge status={effectiveStatus} />
          {showActions && (
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <Link to={`${basePath}/startup/${startup.id}` as any}>
                View Details
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
