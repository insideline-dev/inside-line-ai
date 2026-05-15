import { useMemo, type ReactNode } from "react";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  Clock,
  AlertTriangle,
  Forward,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStartupRealtimeProgress } from "@/lib/startup/useStartupRealtimeProgress";
import { cn } from "@/lib/utils";
import type { PipelinePhaseProgress } from "@/types/pipeline-progress";

interface ScreeningPipelineLiveProps {
  startupId: string;
}

/**
 * Live admin view of the DS (Deal Screening) phases only:
 *   classification → extraction → enrichment → scraping → research → screening
 *
 * Evaluation + synthesis (the DD-only phases) are intentionally hidden —
 * admin who wants DD live should open the full startup detail page.
 *
 * Within the SCREENING phase, surfaces each lens agent (market / team /
 * traction) as a sub-row so admins can see which lens is in flight and
 * which has completed. Lens agents are emitted by the screening processor
 * as `lens_market` / `lens_team` / `lens_traction` keys via
 * `pipelineService.onAgentProgress`.
 */
export function ScreeningPipelineLive({ startupId }: ScreeningPipelineLiveProps) {
  const { progress, isLoading } = useStartupRealtimeProgress(startupId, {
    enabled: true,
    pollMs: 1500,
    useSocket: true,
  });

  const phases = useMemo(() => {
    const order = [
      "classification",
      "extraction",
      "enrichment",
      "scraping",
      "research",
      "screening",
    ] as const;
    return order.map((phase) => ({
      phase,
      data: (progress?.phases?.[phase] ?? {
        status: "pending",
        progress: 0,
      }) as PipelinePhaseProgress,
    }));
  }, [progress]);

  const lensAgents = useMemo(() => {
    const screeningPhase = progress?.phases?.["screening"];
    const agents = Object.entries(screeningPhase?.agents ?? {});
    return agents
      .filter(([k]) => k.startsWith("lens_"))
      .map(([key, data]) => ({
        key,
        label: key.replace("lens_", "").replace(/^./, (c) => c.toUpperCase()),
        status: data.status,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        usedFallback: data.usedFallback,
        error: data.error,
      }));
  }, [progress]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading screening pipeline progress…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Screening Pipeline (Live)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {phases.map(({ phase, data }, idx) => (
            <PhaseRow
              key={phase}
              label={phaseLabel(phase)}
              status={data.status}
              progress={data.progress}
              durationMs={readDuration(data)}
              isLast={idx === phases.length - 1}
              error={data.error}
            />
          ))}
        </div>

        {lensAgents.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Screening lenses
            </div>
            <div className="space-y-1.5">
              {lensAgents.map(({ key, ...rest }) => (
                <LensRow key={key} {...rest} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PhaseRow(props: {
  label: string;
  status: string;
  progress: number;
  durationMs?: number;
  isLast: boolean;
  error?: string;
}) {
  const { icon, tone } = statusIconAndTone(props.status);
  return (
    <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
      <div className={cn("flex h-7 w-7 items-center justify-center rounded-full", tone)}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>{props.label}</span>
          <Badge variant="outline" className="text-xs capitalize">
            {props.status}
          </Badge>
        </div>
        {props.status === "running" && (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.max(2, Math.min(100, props.progress))}%` }}
            />
          </div>
        )}
        {props.durationMs != null && props.status === "completed" && (
          <div className="mt-1 text-xs text-muted-foreground">
            {(props.durationMs / 1000).toFixed(1)}s
          </div>
        )}
        {props.error && (
          <div className="mt-1 text-xs text-destructive">{props.error}</div>
        )}
      </div>
    </div>
  );
}

function LensRow(props: {
  label: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  usedFallback?: boolean;
  error?: string;
}) {
  const { icon, tone } = statusIconAndTone(props.status);
  const duration =
    props.startedAt && props.completedAt
      ? Date.parse(props.completedAt) - Date.parse(props.startedAt)
      : undefined;
  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-1.5">
      <div className={cn("flex h-5 w-5 items-center justify-center rounded-full", tone)}>
        {icon}
      </div>
      <div className="flex-1 flex items-center justify-between text-sm">
        <span>{props.label}</span>
        <div className="flex items-center gap-2">
          {props.usedFallback && (
            <Badge variant="secondary" className="text-xs">fallback</Badge>
          )}
          {duration != null && (
            <span className="text-xs text-muted-foreground">
              {(duration / 1000).toFixed(1)}s
            </span>
          )}
          <Badge variant="outline" className="text-xs capitalize">
            {props.status}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function phaseLabel(phase: string): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function readDuration(phase: PipelinePhaseProgress): number | undefined {
  if (phase.startedAt && phase.completedAt) {
    return Date.parse(phase.completedAt) - Date.parse(phase.startedAt);
  }
  return undefined;
}

function statusIconAndTone(status: string): {
  icon: ReactNode;
  tone: string;
} {
  switch (status) {
    case "completed":
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
        tone: "bg-emerald-50",
      };
    case "running":
      return {
        icon: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
        tone: "bg-primary/10",
      };
    case "failed":
      return {
        icon: <XCircle className="h-4 w-4 text-destructive" />,
        tone: "bg-destructive/10",
      };
    case "skipped":
      return {
        icon: <Forward className="h-4 w-4 text-muted-foreground" />,
        tone: "bg-muted",
      };
    case "waiting":
      return {
        icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
        tone: "bg-amber-50",
      };
    default:
      return {
        icon: <Clock className="h-4 w-4 text-muted-foreground" />,
        tone: "bg-muted",
      };
  }
}
