import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, FileSearch } from "lucide-react";
import { useScreeningOutput } from "@/lib/screening/useScreeningOutput";
import { useTriageDecision } from "@/lib/screening/useTriageDecision";
import {
  collectScreeningEvidenceSeeds,
  collectScreeningFollowUpSeeds,
} from "@/lib/screening/screening-evidence";
import { OpenQuestionsLedger } from "@/components/screening/OpenQuestionsLedger";
import { Skeleton } from "@/components/ui/skeleton";

interface ScreeningInsightsTabProps {
  startupId: string;
}

export function ScreeningInsightsTab({ startupId }: ScreeningInsightsTabProps) {
  const { data: screeningOutput, isLoading: outputLoading } =
    useScreeningOutput(startupId);
  const { data: triageDecision, isLoading: decisionLoading } =
    useTriageDecision(startupId);

  const evidenceSeeds = useMemo(
    () => collectScreeningEvidenceSeeds(screeningOutput),
    [screeningOutput],
  );
  const followUpSeeds = useMemo(
    () => collectScreeningFollowUpSeeds(screeningOutput, triageDecision),
    [screeningOutput, triageDecision],
  );

  const isLoading = outputLoading || decisionLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const hasEvidence = evidenceSeeds.length > 0;
  const hasFollowUps = followUpSeeds.length > 0;
  const isEmpty = !hasEvidence && !hasFollowUps && !screeningOutput;

  if (isEmpty) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-12 text-center text-muted-foreground">
          <FileSearch className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          No screening data available for this deal.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <OpenQuestionsLedger startupId={startupId} />

      {hasEvidence && (
        <Card data-testid="dd-screening-evidence">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              <span>Evidence Seeds</span>
              <Badge variant="secondary" className="text-xs">
                {evidenceSeeds.length}
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Claim-level evidence from screening — carried forward as the
              starting facts for due diligence.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {evidenceSeeds.map((item, index) => (
                <li
                  key={`${item.lensKey}-${index}`}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {item.claim}
                      </p>
                      <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">
                          Lens: {item.lensLabel}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          Confidence: {item.confidence}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          Signal: {item.signal}
                        </Badge>
                      </div>
                      {item.source && (
                        <p className="text-xs text-muted-foreground break-all">
                          Source:{" "}
                          {item.source.startsWith("http") ? (
                            <a
                              href={item.source}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-violet-600 hover:underline"
                            >
                              {item.source}
                            </a>
                          ) : (
                            item.source
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {hasFollowUps && (
        <Card data-testid="dd-screening-follow-ups">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span>Screening Open Issues</span>
              <Badge variant="secondary" className="text-xs">
                {followUpSeeds.length}
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Gaps and blockers identified during screening that carry into due
              diligence.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {followUpSeeds.map((item) => (
                <li
                  key={item.key}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.summary}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      {item.source === "triage-decision" ? "Decision" : "Output"}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
