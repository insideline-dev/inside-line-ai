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
}

interface StageDef {
  key: keyof StageCounts;
  label: string;
  to: string;
  matches: (pathname: string) => boolean;
}

const STAGES: StageDef[] = [
  {
    key: "screening",
    label: "Screening",
    to: "/investor/screening",
    matches: (p) => p.startsWith("/investor/screening"),
  },
  {
    key: "dd",
    label: "Due Diligence",
    to: "/investor",
    matches: (p) =>
      p === "/investor" ||
      p === "/investor/" ||
      p.startsWith("/investor/startup"),
  },
  {
    key: "contracting",
    label: "Contracting",
    to: "/investor/contracting",
    matches: (p) => p.startsWith("/investor/contracting"),
  },
  {
    key: "portfolio",
    label: "Portfolio",
    to: "/investor/portfolio",
    matches: (p) => p.startsWith("/investor/portfolio"),
  },
];

export function StageNav({ counts = {}, className }: StageNavProps) {
  const { pathname } = useLocation();

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
