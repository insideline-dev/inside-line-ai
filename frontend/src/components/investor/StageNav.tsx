import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { customFetch } from "@/api/client";
import { useInvestorControllerGetPipeline } from "@/api/generated/investor/investor";
import { cn } from "@/lib/utils";

export interface StageCounts {
  screening?: number;
  dd?: number;
  contracting?: number;
  portfolio?: number;
}

interface StageNavProps {
  /** Optional manual override. Counts not supplied here are fetched. */
  counts?: StageCounts;
  className?: string;
  /**
   * Route surface this nav is mounted on. Controls which set of routes
   * the four tabs link to. Defaults to "investor" for back-compat with
   * the original mount on /investor/screening.
   */
  surface?: "investor" | "admin";
}

interface StageDef {
  key: keyof StageCounts;
  label: string;
  to: string;
  matches: (pathname: string) => boolean;
}

function stagesFor(surface: "investor" | "admin"): StageDef[] {
  const root = surface === "admin" ? "/admin" : "/investor";
  return [
    {
      key: "screening",
      label: "Screening",
      to: `${root}/screening`,
      matches: (p) => p.startsWith(`${root}/screening`),
    },
    {
      key: "dd",
      label: "Due Diligence",
      to: root,
      matches: (p) =>
        p === root ||
        p === `${root}/` ||
        p.startsWith(`${root}/startup`),
    },
    {
      key: "contracting",
      label: "Contracting",
      to: `${root}/contracting`,
      matches: (p) => p.startsWith(`${root}/contracting`),
    },
    {
      key: "portfolio",
      label: "Portfolio",
      to: `${root}/portfolio`,
      matches: (p) => p.startsWith(`${root}/portfolio`),
    },
  ];
}

interface PipelineLike {
  stats?: { total?: number; inFlight?: number };
}

function unwrap<T>(payload: unknown): T | null {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>)
  ) {
    return ((payload as Record<string, unknown>).data ?? null) as T | null;
  }
  return (payload ?? null) as T | null;
}

function useAutoCounts(surface: "investor" | "admin", overrides: StageCounts) {
  // Screening: count REVIEW-verdict rows. Shared key with the screening
  // page so a single fetch serves both.
  const screeningEnabled =
    surface === "investor" && overrides.screening === undefined;
  const screeningQ = useQuery({
    queryKey: ["investor", "screening"],
    queryFn: () =>
      customFetch<Array<{ verdict?: string }>>("/investor/screening"),
    staleTime: 30_000,
    enabled: screeningEnabled,
  });

  // DD: investor pipeline stats.total (active deals). Reuses the Orval hook
  // so it shares cache with the DD home page.
  const pipelineQ = useInvestorControllerGetPipeline({
    query: {
      staleTime: 30_000,
      enabled: surface === "investor" && overrides.dd === undefined,
    },
  });

  // Portfolio: number of items in the investor portfolio.
  const portfolioQ = useQuery({
    queryKey: ["investor", "portfolio"],
    queryFn: () => customFetch<unknown[]>("/investor/portfolio"),
    staleTime: 60_000,
    enabled: surface === "investor" && overrides.portfolio === undefined,
  });

  const pipeline = unwrap<PipelineLike>(pipelineQ.data);

  return {
    screening:
      overrides.screening ??
      (Array.isArray(screeningQ.data)
        ? screeningQ.data.filter((r) => r.verdict === "review").length
        : undefined),
    dd:
      overrides.dd ??
      (pipeline?.stats?.total !== undefined ? pipeline.stats.total : undefined),
    contracting: overrides.contracting ?? 0,
    portfolio:
      overrides.portfolio ??
      (Array.isArray(portfolioQ.data) ? portfolioQ.data.length : undefined),
  };
}

export function StageNav({
  counts = {},
  className,
  surface = "investor",
}: StageNavProps) {
  const { pathname } = useLocation();
  const STAGES = stagesFor(surface);
  const resolved = useAutoCounts(surface, counts);

  return (
    <nav
      className={cn(
        "flex flex-wrap items-center gap-1 border-b border-border pb-2",
        className,
      )}
      aria-label="Deal stages"
    >
      {STAGES.map((stage) => {
        const active = stage.matches(pathname);
        const count = resolved[stage.key];
        return (
          <Link
            key={stage.key}
            to={stage.to}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            data-testid={`stage-nav-${stage.key}`}
          >
            {stage.label}
            {typeof count === "number" && (
              <Badge
                variant="secondary"
                className={cn(
                  "h-5 px-1.5 text-xs",
                  count === 0 && !active && "opacity-60",
                )}
              >
                {count}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
