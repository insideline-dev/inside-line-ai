import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { customFetch } from "@/api/client";
import { useAdminControllerGetStats } from "@/api/generated/admin/admin";
import { useInvestorControllerGetPipeline } from "@/api/generated/investor/investor";
import { cn } from "@/lib/utils";

export interface StageCounts {
  screening?: number;
  dd?: number;
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

interface AdminStatsLike {
  startups?: {
    total?: number;
    ddCount?: number;
    byStatus?: Record<string, number | undefined>;
  };
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
  const screeningQ = useQuery({
    queryKey: [surface, "screening"],
    queryFn: () =>
      customFetch<Array<{ verdict?: string }>>(`/${surface}/screening`),
    staleTime: 30_000,
    enabled: overrides.screening === undefined,
  });

  const pipelineQ = useInvestorControllerGetPipeline({
    query: {
      staleTime: 30_000,
      enabled: surface === "investor" && overrides.dd === undefined,
    },
  });

  const adminStatsQ = useAdminControllerGetStats({
    query: {
      staleTime: 30_000,
      enabled: surface === "admin" && overrides.dd === undefined,
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
  const adminStats = unwrap<AdminStatsLike>(adminStatsQ.data);
  const adminDdCount = adminStats?.startups?.ddCount ?? adminStats?.startups?.total;

  return {
    screening:
      overrides.screening ??
      (Array.isArray(screeningQ.data)
        ? screeningQ.data.filter((r) => r.verdict === "review").length
        : undefined),
    dd:
      overrides.dd ??
      (surface === "admin"
        ? adminDdCount
        : pipeline?.stats?.total !== undefined
          ? pipeline.stats.total
          : undefined),
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
            <Badge
              variant="secondary"
              className={cn(
                "h-5 px-1.5 text-xs",
                (count ?? 0) === 0 && !active && "opacity-60",
              )}
            >
              {count ?? 0}
            </Badge>
          </Link>
        );
      })}
    </nav>
  );
}
