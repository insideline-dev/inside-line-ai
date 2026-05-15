import { Link, useLocation } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface StageCounts {
  screening?: number;
  dd?: number;
  contracting?: number;
  portfolio?: number;
}

interface StageNavProps {
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

export function StageNav({
  counts = {},
  className,
  surface = "investor",
}: StageNavProps) {
  const { pathname } = useLocation();
  const STAGES = stagesFor(surface);

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
        const count = counts[stage.key];
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
            {typeof count === "number" && count > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {count}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
