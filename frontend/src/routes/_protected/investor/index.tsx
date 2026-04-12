import { useState, useMemo, useEffect, useRef, type DragEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/api/client";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchAndFilters, defaultFilters, type FilterState, STAGES, REGIONS, SOURCE_OPTIONS } from "@/components/SearchAndFilters";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useInvestorControllerGetPipeline,
  useInvestorControllerUpdateMatchStatus,
  useInvestorControllerToggleSaved,
  useInvestorControllerGetThesis,
  getInvestorControllerGetMatchDetailsQueryKey,
  getInvestorControllerGetPipelineQueryKey,
} from "@/api/generated/investor/investor";
import { AnalysisProgressBar } from "@/components/AnalysisProgressBar";
import {
  useStartupControllerFindAll,
  useStartupControllerUpdate,
  getStartupControllerFindAllQueryKey,
} from "@/api/generated/startups/startups";
import { useToast } from "@/hooks/use-toast";
import {
  Target,
  Star,
  Eye,
  Clock,
  Plus,
  List,
  Columns3,
  FileSearch,
  Lock,
  Loader2,
  Search,
  GripVertical,
  Sparkles,
  CheckCircle2,
  CircleX,
  Check,
  Bookmark,
  Wand2,
  AlertTriangle,
  X,
} from "lucide-react";
import type { PrivateInvestorPipelineStatus } from "@/types/startup";

export const Route = createFileRoute("/_protected/investor/")({
  component: InvestorDashboard,
});

// ─── Types ───────────────────────────────────────────────────────────────────

type PipelineMatch = {
  id: string;
  startupId: string;
  overallScore: number;
  isSaved?: boolean;
  status: "new" | "reviewing" | "engaged" | "closed" | "passed";
  statusChangedAt: string | null;
  passReason: string | null;
  investmentAmount: number | null;
  investmentCurrency: string | null;
  meetingRequested: boolean;
  thesisFitScore: number | null;
  createdAt: string;
  startupName: string | null;
  startupLogoUrl: string | null;
  startupStage: string | null;
  startupIndustry: string | null;
  startupDescription: string | null;
};

type PipelineData = {
  new: PipelineMatch[];
  reviewing: PipelineMatch[];
  engaged: PipelineMatch[];
  closed: PipelineMatch[];
  passed: PipelineMatch[];
  stats: { total: number; byStatus: Record<string, number> };
};

type Status = PipelineMatch["status"];
type ViewMode = "list" | "kanban";
type PrivateStartup = {
  id: string;
  name: string;
  description: string;
  stage: string;
  industry: string;
  sectorIndustryGroup?: string;
  location: string;
  normalizedRegion?: string;
  logoUrl?: string | null;
  privateInvestorPipelineStatus?: Status | null;
  overallScore: number;
  status: string;
  createdAt: string;
};

type PipelineCardItem = {
  displayName: string;
  description: string | null;
  stage: string | null;
  industry: string | null;
  location: string | null;
  logoUrl: string | null;
  overallScore: number;
  thesisFitScore: number | null;
  createdAt: string;
  matchId: string | null;
  startupId: string;
  pipelineStatus: Status;
  isAnalyzing: boolean;
  isPrivate: boolean;
  isSaved?: boolean;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUSES: Status[] = ["new", "reviewing", "engaged", "closed", "passed"];

const STATUS_CONFIG: Record<
  Status,
  { label: string; icon: typeof Sparkles; iconClass: string; badgeClass: string; borderClass: string }
> = {
  new: {
    label: "New",
    icon: Sparkles,
    iconClass: "text-blue-500",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    borderClass: "border-blue-500",
  },
  reviewing: {
    label: "Reviewing",
    icon: Eye,
    iconClass: "text-amber-500",
    badgeClass: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    borderClass: "border-yellow-500",
  },
  engaged: {
    label: "Engaged",
    icon: Star,
    iconClass: "text-violet-500",
    badgeClass: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    borderClass: "border-green-500",
  },
  closed: {
    label: "Closed",
    icon: CheckCircle2,
    iconClass: "text-green-500",
    badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    borderClass: "border-purple-500",
  },
  passed: {
    label: "Passed",
    icon: CircleX,
    iconClass: "text-muted-foreground",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    borderClass: "border-red-500",
  },
};

const PASS_REASONS = ["Valuation", "Market Fit", "Team", "Timing", "Competition", "Other"] as const;
const CURRENCIES = ["USD", "EUR", "GBP"] as const;

const STATUS_TABS = ["all", "new", "reviewing", "engaged", "closed", "passed", "bookmarked"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: T[] }).data;
  }
  return [];
}

function extractResponseData<T>(payload: unknown): T | null {
  if (payload === null || payload === undefined) return null;
  if (
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "data" in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function formatDate(date: string | null) {
  if (!date) return "--";
  return format(new Date(date), "MMM d, yyyy");
}

function formatStageLabel(stage: string | null | undefined): string {
  if (!stage) return "Unknown stage";
  return stage.replace(/_/g, " ");
}

function mapPrivateStartupStatus(status: string, pipelineStatus?: Status | null): Status {
  if (pipelineStatus) {
    return pipelineStatus;
  }

  switch (status) {
    case "pending_review":
      return "reviewing";
    case "approved":
      return "new";
    case "submitted":
    case "analyzing":
    default:
      return "new";
  }
}

function mergeStartups(pipeline: PipelineData | null, privateStartups: PrivateStartup[]) {
  const matchItems: PipelineCardItem[] = pipeline
    ? STATUSES.flatMap((status) =>
        pipeline[status].map((m) => ({
          displayName: m.startupName ?? "Untitled",
          description: m.startupDescription ?? null,
          stage: m.startupStage ?? null,
          industry: m.startupIndustry ?? null,
          location: null,
          logoUrl: m.startupLogoUrl ?? null,
          overallScore: m.overallScore,
          thesisFitScore: m.thesisFitScore,
          createdAt: m.createdAt,
          matchId: m.id,
          startupId: m.startupId,
          pipelineStatus: m.status,
          isAnalyzing: false,
          isPrivate: false,
          isSaved: m.isSaved,
        })),
      )
    : [];

  const matchedStartupIds = new Set(matchItems.map((m) => m.startupId));

  const privateItems: PipelineCardItem[] = privateStartups
    .filter((s) => !matchedStartupIds.has(s.id))
    .map((s) => ({
      displayName: s.name || "Untitled",
      description: s.description ?? null,
      stage: s.stage ?? null,
      industry: s.industry ?? null,
      location: s.location ?? null,
      logoUrl: s.logoUrl ?? null,
      overallScore: s.overallScore ?? 0,
      thesisFitScore: null,
      createdAt: s.createdAt,
      matchId: null,
      startupId: s.id,
      pipelineStatus: mapPrivateStartupStatus(s.status, s.privateInvestorPipelineStatus ?? null),
      isAnalyzing: s.status === "submitted" || s.status === "analyzing",
      isPrivate: true,
      isSaved: false,
    }));

  const allItems = [...matchItems, ...privateItems];

  const grouped = Object.fromEntries(
    STATUSES.map((s) => [s, allItems.filter((item) => item.pipelineStatus === s)]),
  ) as Record<Status, PipelineCardItem[]>;

  return { allItems, grouped };
}

function applyStatusOverrides(
  items: PipelineCardItem[],
  statusOverrides: Record<string, Status>,
): PipelineCardItem[] {
  return items.map((item) => {
    const key = item.matchId ?? item.startupId;
    const overriddenStatus = statusOverrides[key];
    return overriddenStatus ? { ...item, pipelineStatus: overriddenStatus } : item;
  });
}

function groupPipelineItems(items: PipelineCardItem[]): Record<Status, PipelineCardItem[]> {
  return Object.fromEntries(
    STATUSES.map((status) => [status, items.filter((item) => item.pipelineStatus === status)]),
  ) as Record<Status, PipelineCardItem[]>;
}

function filterPipelineItems(
  items: PipelineCardItem[],
  search: string,
  filters: FilterState,
  activeTab: StatusTab,
): PipelineCardItem[] {
  const query = search.trim().toLowerCase();
  const filterQuery = filters.search.trim().toLowerCase();
  const source = filters.source ?? "all";

  return items.filter((item) => {
    if (source === "my_submissions" && !item.isPrivate) return false;
    if (source === "matched" && item.isPrivate) return false;

    if (activeTab !== "all") {
      if (activeTab === "bookmarked") {
        if (!item.isSaved) return false;
      } else if (item.pipelineStatus !== activeTab) {
        return false;
      }
    }

    if (query) {
      const matchesQuery =
        item.displayName.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.industry?.toLowerCase().includes(query) ||
        item.stage?.toLowerCase().includes(query);
      if (!matchesQuery) return false;
    }

    if (filterQuery) {
      const matchesFilterQuery =
        item.displayName.toLowerCase().includes(filterQuery) ||
        item.description?.toLowerCase().includes(filterQuery) ||
        item.industry?.toLowerCase().includes(filterQuery) ||
        item.stage?.toLowerCase().includes(filterQuery);
      if (!matchesFilterQuery) return false;
    }

    if (filters.stages.length > 0) {
      if (!item.stage || !filters.stages.includes(item.stage)) return false;
    }

    if (filters.industries.length > 0) {
      const matchesIndustry = filters.industries.some((industry) =>
        item.industry?.toLowerCase().includes(industry.toLowerCase()),
      );
      if (!matchesIndustry) return false;
    }

    if (filters.regions.length > 0) {
      const location = item.location?.toLowerCase() ?? "";
      const matchesRegion = filters.regions.some((region) => location.includes(region.toLowerCase()));
      if (!matchesRegion) return false;
    }

    if (filters.scoreRange[0] > 0 || filters.scoreRange[1] < 100) {
      if (item.overallScore < filters.scoreRange[0] || item.overallScore > filters.scoreRange[1]) {
        return false;
      }
    }

    return true;
  });
}

// ─── Shared Cards ─────────────────────────────────────────────────────────────

function PipelineCard({
  item,
  onToggleBookmark,
  onRunMatching,
  isMatching = false,
}: {
  item: PipelineCardItem;
  onToggleBookmark?: (startupId: string) => void;
  onRunMatching?: (startupId: string) => void;
  isMatching?: boolean;
}) {
  const config = STATUS_CONFIG[item.pipelineStatus];
  const hasOverallScore = item.overallScore > 0;
  const hasThesisScore = typeof item.thesisFitScore === "number";
  const canRunMatching = Boolean(onRunMatching);
  const canBookmark = Boolean(onToggleBookmark && item.matchId);

  const handleRunMatching = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onRunMatching) onRunMatching(item.startupId);
  };

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleBookmark) onToggleBookmark(item.startupId);
  };

  return (
    <Card className="group relative h-full flex flex-col overflow-hidden border-border/70 transition-all hover:border-primary/40 hover:shadow-md">
      <Link
        to="/investor/startup/$id"
        params={{ id: item.startupId }}
        className="flex h-full flex-col"
        onContextMenu={(e) => e.preventDefault()}
      >
        <CardContent className="flex h-full flex-col gap-4 p-4">
          {/* Header: status + quick actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {item.isPrivate && (
                <Badge variant="outline" className="gap-1 text-[11px]">
                  <Lock className="h-3 w-3" />
                  Private
                </Badge>
              )}
              {item.isAnalyzing ? (
                <Badge variant="outline" className="gap-1 text-[11px]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Analyzing
                </Badge>
              ) : (
                <Badge className={`${config.badgeClass} text-[11px]`}>
                  {item.isSaved ? "Bookmarked" : config.label}
                </Badge>
              )}
            </div>
            {canBookmark && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-60 hover:opacity-100"
                onClick={handleBookmark}
                aria-label={item.isSaved ? "Remove bookmark" : "Bookmark"}
              >
                <Bookmark
                  className={`h-4 w-4 ${item.isSaved ? "fill-current text-primary" : ""}`}
                />
              </Button>
            )}
          </div>

          {/* Identity: avatar + name + description */}
          <div className="flex items-start gap-3">
            <Avatar className="h-11 w-11 shrink-0 rounded-lg border bg-muted/40">
              {item.logoUrl ? (
                <AvatarImage
                  src={item.logoUrl}
                  alt={item.displayName}
                  className="object-contain"
                />
              ) : null}
              <AvatarFallback className="rounded-lg text-xs font-medium">
                {item.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-base font-semibold leading-tight">
                {item.displayName}
              </p>
              <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm leading-snug text-muted-foreground">
                {item.description ?? ""}
              </p>
            </div>
          </div>

          {/* Tags */}
          {(item.stage || item.industry) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {item.stage && (
                <Badge variant="outline" className="capitalize text-[11px]">
                  {formatStageLabel(item.stage)}
                </Badge>
              )}
              {item.industry && (
                <Badge variant="outline" className="capitalize text-[11px]">
                  {item.industry}
                </Badge>
              )}
            </div>
          )}

          {item.isAnalyzing && (
            <AnalysisProgressBar startupId={Number(item.startupId)} compact />
          )}

          {/* Scores row */}
          {!item.isAnalyzing && (
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3">
              <ScoreTile
                label="Overall"
                score={hasOverallScore ? item.overallScore : null}
                placeholder={hasOverallScore ? null : "Not scored"}
              />
              <ScoreTile
                label="Thesis fit"
                score={hasThesisScore ? (item.thesisFitScore as number) : null}
                variant="secondary"
                placeholder={hasThesisScore ? null : "Run match"}
                onAction={canRunMatching && !hasThesisScore ? handleRunMatching : undefined}
                isActing={isMatching}
              />
            </div>
          )}

          {/* Footer: date + actions + CTA */}
          <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            <span>{formatDate(item.createdAt)}</span>
            <div className="flex items-center gap-1">
              {canRunMatching && hasThesisScore && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-60 hover:opacity-100"
                  onClick={handleRunMatching}
                  disabled={isMatching}
                  aria-label="Re-run thesis matching"
                  title="Re-run thesis matching"
                >
                  {isMatching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
              <span className="font-medium text-foreground/80 group-hover:text-primary">
                {item.pipelineStatus === "reviewing" ? "Review Analysis" : "View Analysis"}
              </span>
            </div>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

function ScoreTile({
  label,
  score,
  variant = "default",
  placeholder,
  onAction,
  isActing = false,
}: {
  label: string;
  score: number | null;
  variant?: "default" | "secondary";
  placeholder?: string | null;
  onAction?: (e: React.MouseEvent) => void;
  isActing?: boolean;
}) {
  if (score !== null) {
    return (
      <div className="flex items-center gap-2.5">
        <ScoreRing score={score} size="sm" showLabel={false} variant={variant} />
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-sm font-semibold leading-tight">{score}</p>
        </div>
      </div>
    );
  }

  if (onAction) {
    return (
      <button
        type="button"
        onClick={onAction}
        disabled={isActing}
        className="flex items-center gap-2.5 rounded-md text-left transition-colors hover:bg-primary/5 disabled:opacity-60"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40">
          {isActing ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Wand2 className="h-4 w-4 text-primary" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-xs font-medium text-primary leading-tight">
            {isActing ? "Matching..." : placeholder}
          </p>
        </div>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2.5 opacity-60">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
        <FileSearch className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-xs text-muted-foreground leading-tight">{placeholder ?? "—"}</p>
      </div>
    </div>
  );
}

function CardsView({
  items,
  onStatusChange,
  onToggleBookmark,
  onRunMatching,
  matchingJobs,
}: {
  items: PipelineCardItem[];
  onStatusChange: (dragId: string, status: Status) => void;
  onToggleBookmark: (startupId: string) => void;
  onRunMatching: (startupId: string) => void;
  matchingJobs: Record<string, "queued" | "running">;
}) {
  if (items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
            <Target className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No deals found</h3>
          <p className="text-muted-foreground">Try adjusting your filters or search.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => {
        const key = item.matchId ?? item.startupId;

        const isMatching = Boolean(matchingJobs[item.startupId]);

        if (item.isAnalyzing) {
          return (
            <PipelineCard
              key={key}
              item={item}
              onToggleBookmark={onToggleBookmark}
              onRunMatching={onRunMatching}
              isMatching={isMatching}
            />
          );
        }

        return (
          <ContextMenu key={key}>
            <ContextMenuTrigger className="block h-full">
              <PipelineCard
                item={item}
                onToggleBookmark={onToggleBookmark}
                onRunMatching={onRunMatching}
                isMatching={isMatching}
              />
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <ContextMenuItem
                onClick={() => onRunMatching(item.startupId)}
                className="gap-2"
              >
                <Wand2 className="h-4 w-4 text-primary" />
                Run thesis matching
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuLabel>Move to</ContextMenuLabel>
              {STATUSES.map((status) => {
                const cfg = STATUS_CONFIG[status];
                const Icon = cfg.icon;
                const isCurrent = item.pipelineStatus === status;
                return (
                  <ContextMenuItem
                    key={status}
                    disabled={isCurrent}
                    onClick={() => onStatusChange(item.matchId ?? item.startupId, status)}
                    className="gap-2"
                  >
                    <Icon className={`h-4 w-4 ${cfg.iconClass}`} />
                    {cfg.label}
                    {isCurrent && <Check className="ml-auto h-4 w-4" />}
                  </ContextMenuItem>
                );
              })}
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}

// ─── Kanban Board ────────────────────────────────────────────────────────────

function BoardView({
  grouped,
  onDrop,
  draggingMatchId,
  onDragStart,
  onDragEnd,
  onToggleBookmark,
  onRunMatching,
  matchingJobs,
}: {
  grouped: Record<Status, PipelineCardItem[]>;
  onDrop: (matchId: string, status: Status) => void;
  draggingMatchId: string | null;
  onDragStart: (matchId: string) => void;
  onDragEnd: () => void;
  onToggleBookmark: (startupId: string) => void;
  onRunMatching: (startupId: string) => void;
  matchingJobs: Record<string, "queued" | "running">;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5 md:grid-cols-2">
      {STATUSES.map((status) => {
        const items = grouped[status];
        return (
          <KanbanColumn
            key={status}
            status={status}
            items={items}
            onDrop={onDrop}
            draggingMatchId={draggingMatchId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onToggleBookmark={onToggleBookmark}
            onRunMatching={onRunMatching}
            matchingJobs={matchingJobs}
          />
        );
      })}
    </div>
  );
}

function KanbanColumn({
  status,
  items,
  onDrop,
  draggingMatchId,
  onDragStart,
  onDragEnd,
  onToggleBookmark,
  onRunMatching,
  matchingJobs,
}: {
  status: Status;
  items: PipelineCardItem[];
  onDrop: (matchId: string, status: Status) => void;
  draggingMatchId: string | null;
  onDragStart: (matchId: string) => void;
  onDragEnd: () => void;
  onToggleBookmark: (startupId: string) => void;
  onRunMatching: (startupId: string) => void;
  matchingJobs: Record<string, "queued" | "running">;
}) {
  const [dragOver, setDragOver] = useState(false);
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dragId = e.dataTransfer.getData("text/plain");
    if (dragId) onDrop(dragId, status);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex min-h-[420px] flex-col overflow-hidden rounded-xl border bg-card transition-colors ${
        dragOver ? `${config.borderClass} border-2` : "border-border"
      }`}
    >
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-4.5 w-4.5 ${config.iconClass}`} />
          <h3 className="text-sm font-semibold">{config.label}</h3>
        </div>
        <Badge variant="secondary" className="rounded-lg px-3 text-xs tabular-nums">
          {items.length}
        </Badge>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
        {items.map((item) => (
          <KanbanCard
            key={item.matchId ?? item.startupId}
            item={item}
            draggingMatchId={draggingMatchId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onToggleBookmark={onToggleBookmark}
            onRunMatching={onRunMatching}
            isMatching={Boolean(matchingJobs[item.startupId])}
          />
        ))}
        {items.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No startups</p>
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  item,
  draggingMatchId,
  onDragStart,
  onDragEnd,
  onToggleBookmark,
  onRunMatching,
  isMatching = false,
}: {
  item: PipelineCardItem;
  draggingMatchId: string | null;
  onDragStart: (matchId: string) => void;
  onDragEnd: () => void;
  onToggleBookmark: (startupId: string) => void;
  onRunMatching?: (startupId: string) => void;
  isMatching?: boolean;
}) {
  const dragId = item.matchId ?? item.startupId;
  const navigate = useNavigate();
  const dragMovedRef = useRef(false);
  const hasOverallScore = item.overallScore > 0;
  const hasThesisScore = typeof item.thesisFitScore === "number";

  function handleDragStart(e: DragEvent) {
    dragMovedRef.current = true;
    e.dataTransfer.setData("text/plain", dragId);
    e.dataTransfer.effectAllowed = "move";
    onDragStart(dragId);
  }

  function handleDragEnd() {
    window.setTimeout(() => {
      dragMovedRef.current = false;
    }, 0);
    onDragEnd();
  }

  function handleClick() {
    if (dragMovedRef.current) return;
    navigate({ to: "/investor/startup/$id", params: { id: item.startupId } });
  }

  return (
    <Card
      draggable={!item.isAnalyzing}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={
        item.isAnalyzing
          ? "cursor-pointer opacity-75"
          : dragId === draggingMatchId
            ? "cursor-grabbing opacity-60"
            : "cursor-grab active:cursor-grabbing"
      }
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <Avatar className="h-8 w-8 shrink-0 rounded-md border bg-muted/40">
              {item.logoUrl ? (
                <AvatarImage src={item.logoUrl} alt={item.displayName} className="object-contain" />
              ) : null}
              <AvatarFallback className="rounded-md text-[10px] font-medium">
                {item.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{item.displayName}</p>
            </div>
          </div>
          {item.isAnalyzing ? (
            <Badge variant="outline" className="gap-1 shrink-0 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analyzing...
            </Badge>
          ) : (
            <div className="flex items-center gap-1 shrink-0">
              {item.matchId && (
                <button
                  type="button"
                  draggable={false}
                  className="p-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleBookmark(item.startupId);
                  }}
                >
                  <Bookmark className={`h-3.5 w-3.5 ${item.isSaved ? "fill-current text-primary" : "text-muted-foreground"}`} />
                </button>
              )}
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
        {!item.isAnalyzing && (
          <>
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                {hasOverallScore ? (
                  <ScoreRing score={item.overallScore} size="sm" showLabel={false} />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                    <FileSearch className="h-3 w-3 text-muted-foreground" />
                  </div>
                )}
                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  Overall
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {hasThesisScore ? (
                  <ScoreRing
                    score={item.thesisFitScore as number}
                    size="sm"
                    showLabel={false}
                    variant="secondary"
                  />
                ) : onRunMatching ? (
                  <button
                    type="button"
                    draggable={false}
                    disabled={isMatching}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRunMatching(item.startupId);
                    }}
                    title="Run thesis matching"
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 hover:border-primary/60 hover:bg-primary/5 disabled:opacity-60"
                  >
                    {isMatching ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    ) : (
                      <Wand2 className="h-3 w-3 text-primary" />
                    )}
                  </button>
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                    <span className="text-xs text-muted-foreground">—</span>
                  </div>
                )}
                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  Thesis
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              {item.industry && (
                <p className="text-xs text-muted-foreground truncate">{item.industry}</p>
              )}
              {item.stage && (
                <p className="text-xs text-muted-foreground truncate">
                  {formatStageLabel(item.stage)}
                </p>
              )}
            </div>
          </>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatDate(item.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

function PassDialog({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string, notes: string) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pass on Deal</DialogTitle>
          <DialogDescription>Select a reason for passing on this opportunity.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pass-reason">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="pass-reason">
                <SelectValue placeholder="Select reason..." />
              </SelectTrigger>
              <SelectContent>
                {PASS_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pass-notes">Notes (optional)</Label>
            <Textarea
              id="pass-notes"
              placeholder="Additional context..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onSubmit(reason, notes)}
            disabled={!reason || isPending}
          >
            {isPending ? "Saving..." : "Confirm Pass"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDealDialog({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { amount: number; currency: string; date: string; notes: string }) => void;
  isPending: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close Deal</DialogTitle>
          <DialogDescription>Record the investment details for this deal.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invest-amount">Investment Amount</Label>
              <Input
                id="invest-amount"
                type="number"
                min={0}
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invest-currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="invest-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invest-date">Date</Label>
            <Input
              id="invest-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invest-notes">Notes (optional)</Label>
            <Textarea
              id="invest-notes"
              placeholder="Deal terms, round details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                amount: Number(amount),
                currency,
                date: date ? new Date(date).toISOString() : "",
                notes,
              })
            }
            disabled={!amount || Number(amount) <= 0 || isPending}
          >
            {isPending ? "Saving..." : "Close Deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function InvestorDashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [passDialog, setPassDialog] = useState<{ matchId: string } | null>(null);
  const [closeDialog, setCloseDialog] = useState<{ matchId: string } | null>(null);
  const [draggingMatchId, setDraggingMatchId] = useState<string | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, Status>>({});

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ─ Pipeline data
  const pipelineResponse = useInvestorControllerGetPipeline();
  const pipeline = extractResponseData<PipelineData>(pipelineResponse.data);

  // ─ Thesis presence (drives warning banner & matching gating)
  const thesisResponse = useInvestorControllerGetThesis();
  const thesisLoaded = !thesisResponse.isLoading;
  const hasThesis = Boolean(extractResponseData<unknown>(thesisResponse.data));
  const showThesisWarning = thesisLoaded && !hasThesis;

  useEffect(() => {
    setStatusOverrides({});
  }, [pipeline]);

  const pipelineItemsByStatus = useMemo(() => {
    if (!pipeline) return null;
    return groupPipelineItems(applyStatusOverrides(mergeStartups(pipeline, []).allItems, statusOverrides));
  }, [pipeline, statusOverrides]);

  // ─ Private startups
  const myStartupsResponse = useStartupControllerFindAll(undefined, {
    query: {
      refetchInterval: (query) => {
        const rows = extractList<PrivateStartup>(query.state.data);
        const hasInFlight = rows.some(
          (row) => row.status === "submitted" || row.status === "analyzing",
        );
        return hasInFlight ? 5000 : false;
      },
    },
  });
  const myStartups = extractList<PrivateStartup>(myStartupsResponse.data);

  // ─ Status mutation
  const updateStatus = useInvestorControllerUpdateMatchStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getInvestorControllerGetPipelineQueryKey() });
      },
      onError: () => {
        toast.error("Failed to update status");
      },
    },
  });

  const updatePrivateStartup = useStartupControllerUpdate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getStartupControllerFindAllQueryKey() });
      },
      onError: () => {
        toast.error("Failed to update status");
      },
    },
  });

  const [matchingJobs, setMatchingJobs] = useState<Record<string, "queued" | "running">>({});

  const runMatching = useMutation({
    mutationFn: (startupId: string) =>
      customFetch(`/investor/startups/${startupId}/match`, { method: "POST" }),
    onMutate: (startupId) => {
      setMatchingJobs((prev) => ({ ...prev, [startupId]: "queued" }));
    },
    onSuccess: (_data, startupId) => {
      toast.success("Matching queued");
      setMatchingJobs((prev) => ({ ...prev, [startupId]: "running" }));
    },
    onError: (error, startupId) => {
      setMatchingJobs((prev) => {
        const next = { ...prev };
        delete next[startupId];
        return next;
      });
      const message = error instanceof Error ? error.message : "Failed to queue matching";
      toast.error(message);
    },
  });

  const handleRunMatching = (startupId: string) => {
    if (!hasThesis) {
      toast.error("Create your investment thesis first to run matching");
      return;
    }
    if (matchingJobs[startupId]) return;
    runMatching.mutate(startupId);
  };

  // ─ Poll matching status for running jobs
  useEffect(() => {
    const runningIds = Object.keys(matchingJobs);
    if (runningIds.length === 0) return;

    let cancelled = false;

    const tick = async () => {
      for (const id of runningIds) {
        try {
          const status = await customFetch<{
            status: string;
            error?: string | null;
            result?: { matchesFound?: number };
          }>(`/investor/startups/${id}/matching/status`);
          if (cancelled) return;

          if (status.status === "completed") {
            setMatchingJobs((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            toast.success(
              status.result?.matchesFound !== undefined
                ? `Matching complete for ${id} (${status.result.matchesFound} match${
                    status.result.matchesFound === 1 ? "" : "es"
                  } found)`
                : `Matching complete for ${id}`,
            );
            await Promise.all([
              queryClient.refetchQueries({ queryKey: getInvestorControllerGetPipelineQueryKey() }),
              queryClient.refetchQueries({ queryKey: getStartupControllerFindAllQueryKey() }),
              queryClient.refetchQueries({
                queryKey: getInvestorControllerGetMatchDetailsQueryKey(id),
              }),
            ]);
          } else if (status.status === "failed") {
            setMatchingJobs((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            toast.error(status.error || "Matching failed");
          } else if (status.status === "processing" && matchingJobs[id] !== "running") {
            setMatchingJobs((prev) => ({ ...prev, [id]: "running" }));
          }
        } catch {
          // ignore transient errors; next tick retries
        }
      }
    };

    const interval = setInterval(tick, 3000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [matchingJobs, queryClient, toast]);

  const toggleBookmark = useInvestorControllerToggleSaved({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getInvestorControllerGetPipelineQueryKey() });
      },
      onError: () => {
        toast.error("Failed to update bookmark");
      },
    },
  });

  const handleToggleBookmark = (startupId: string) => {
    toggleBookmark.mutate({ startupId });
  };

  // ─ Merged & filtered data
  const allItems = useMemo(
    () => applyStatusOverrides(mergeStartups(pipeline, myStartups).allItems, statusOverrides),
    [pipeline, myStartups, statusOverrides],
  );

  const filteredItems = useMemo(
    () => filterPipelineItems(allItems, search, filters, activeTab),
    [allItems, search, filters, activeTab],
  );

  const filteredGrouped = useMemo(() => {
    if (filters.source === "matched" && pipelineItemsByStatus) {
      const baseGrouped = Object.fromEntries(
        STATUSES.map((status) => [
          status,
          filterPipelineItems(pipelineItemsByStatus[status], search, filters, "all"),
        ]),
      ) as Record<Status, PipelineCardItem[]>;

      if (activeTab === "all") return baseGrouped;
      if (activeTab === "bookmarked") {
        return Object.fromEntries(
          STATUSES.map((status) => [status, baseGrouped[status].filter((item) => item.isSaved)]),
        ) as Record<Status, PipelineCardItem[]>;
      }
      return Object.fromEntries(
        STATUSES.map((status) => [status, status === activeTab ? baseGrouped[status] : []]),
      ) as Record<Status, PipelineCardItem[]>;
    }

    const baseFiltered = filterPipelineItems(allItems, search, filters, "all");
    if (activeTab === "all") {
      return Object.fromEntries(
        STATUSES.map((s) => [s, baseFiltered.filter((item) => item.pipelineStatus === s)]),
      ) as Record<Status, PipelineCardItem[]>;
    }
    if (activeTab === "bookmarked") {
      return Object.fromEntries(
        STATUSES.map((s) => [s, baseFiltered.filter((item) => item.pipelineStatus === s && item.isSaved)]),
      ) as Record<Status, PipelineCardItem[]>;
    }
    return Object.fromEntries(
      STATUSES.map((s) => [s, s === activeTab ? baseFiltered.filter((item) => item.pipelineStatus === s) : []]),
    ) as Record<Status, PipelineCardItem[]>;
  }, [allItems, search, filters, activeTab, pipelineItemsByStatus]);

  const tabCounts = useMemo(() => {
    const source = filters.source ?? "all";
    const items = source === "my_submissions" ? allItems.filter(i => i.isPrivate)
      : source === "matched" ? allItems.filter(i => !i.isPrivate)
      : allItems;
    return {
      all: items.length,
      new: items.filter(i => i.pipelineStatus === "new").length,
      reviewing: items.filter(i => i.pipelineStatus === "reviewing").length,
      engaged: items.filter(i => i.pipelineStatus === "engaged").length,
      closed: items.filter(i => i.pipelineStatus === "closed").length,
      passed: items.filter(i => i.pipelineStatus === "passed").length,
      bookmarked: items.filter(i => i.isSaved).length,
    };
  }, [allItems, filters.source]);

  // ─ Handlers
  const handleDrop = (dragId: string, newStatus: Status) => {
    const currentItem = allItems.find((item) => (item.matchId ?? item.startupId) === dragId);
    if (!currentItem || currentItem.pipelineStatus === newStatus) {
      setDraggingMatchId(null);
      return;
    }

    const itemKey = currentItem.matchId ?? currentItem.startupId;
    setStatusOverrides((current) => ({ ...current, [itemKey]: newStatus }));

    // Private items persist via startup record update
    if (!currentItem.matchId) {
      updatePrivateStartup.mutate(
        {
          id: currentItem.startupId,
          data: {
            privateInvestorPipelineStatus: newStatus as PrivateInvestorPipelineStatus,
          },
        },
        {
          onError: () => {
            setStatusOverrides((current) => {
              const next = { ...current };
              delete next[itemKey];
              return next;
            });
          },
        },
      );
      setDraggingMatchId(null);
      return;
    }

    if (newStatus === "passed") {
      setPassDialog({ matchId: currentItem.matchId });
      setDraggingMatchId(null);
      return;
    }
    if (newStatus === "closed") {
      setCloseDialog({ matchId: currentItem.matchId });
      setDraggingMatchId(null);
      return;
    }

    updateStatus.mutate(
      { matchId: currentItem.matchId, data: { status: newStatus } },
      {
        onError: () => {
          setStatusOverrides((current) => {
            const next = { ...current };
            delete next[itemKey];
            return next;
          });
        },
      },
    );
    setDraggingMatchId(null);
  };

  // ─── Loading ───
  if (pipelineResponse.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pipeline</h1>
            <p className="text-muted-foreground">Startups matched to your investment thesis</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showThesisWarning && (
        <div className="flex flex-col gap-3 border border-amber-300 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-semibold">No investment thesis yet</p>
              <p className="text-sm text-amber-900/80">
                Thesis alignment scores can&apos;t be generated until you define your investment thesis.
                Matching will fall back to empty scores.
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link to="/investor/thesis">Create thesis</Link>
          </Button>
        </div>
      )}

      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-muted-foreground">Startups matched to your investment thesis</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex rounded-md border overflow-hidden">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-none border-r"
              onClick={() => setViewMode("list")}
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-none"
              onClick={() => setViewMode("kanban")}
            >
              <Columns3 className="w-4 h-4" />
            </Button>
          </div>
          <Button asChild data-testid="button-submit-startup">
            <Link to="/investor/submit">
              <Plus className="w-4 h-4 mr-2" />
              Analyze Startup
            </Link>
          </Button>
        </div>
      </div>

      {/* ─── Status Tabs ─── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as StatusTab)}>
        <TabsList>
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} data-testid={`tab-${tab}`}>
              {tab === "all" ? "All" : tab === "bookmarked" ? "Bookmarked" : STATUS_CONFIG[tab as Status]?.label ?? tab}
              {tabCounts[tab] > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {tabCounts[tab]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, stage, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <SearchAndFilters
          filters={filters}
          onFiltersChange={setFilters}
          showScoreFilter={true}
          hideSearch={true}
          showSourceFilter={true}
          hideActiveChips={true}
        />
      </div>

      {/* ─── Active Filter Chips ─── */}
      {(filters.stages.length > 0 || filters.industries.length > 0 || filters.regions.length > 0 || (filters.source && filters.source !== "all") || filters.scoreRange[0] > 0 || filters.scoreRange[1] < 100) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {filters.stages.map((stage) => (
            <Badge key={stage} variant="secondary" className="gap-1">
              {STAGES.find(s => s.value === stage)?.label || stage}
              <X className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, stages: filters.stages.filter(s => s !== stage) })} />
            </Badge>
          ))}
          {filters.industries.map((industry) => (
            <Badge key={industry} variant="secondary" className="gap-1">
              {industry}
              <X className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, industries: filters.industries.filter(i => i !== industry) })} />
            </Badge>
          ))}
          {filters.regions.map((region) => (
            <Badge key={region} variant="secondary" className="gap-1">
              {REGIONS.find(r => r.value === region)?.label || region}
              <X className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, regions: filters.regions.filter(r => r !== region) })} />
            </Badge>
          ))}
          {filters.source && filters.source !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {SOURCE_OPTIONS.find(o => o.value === filters.source)?.label}
              <X className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, source: "all" })} />
            </Badge>
          )}
          {(filters.scoreRange[0] > 0 || filters.scoreRange[1] < 100) && (
            <Badge variant="secondary" className="gap-1">
              Score: {filters.scoreRange[0]}-{filters.scoreRange[1]}
              <X className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, scoreRange: [0, 100] })} />
            </Badge>
          )}
        </div>
      )}

      {/* ─── Content Area ─── */}
      {viewMode === "list" ? (
        <CardsView
          items={filteredItems}
          onStatusChange={handleDrop}
          onToggleBookmark={handleToggleBookmark}
          onRunMatching={handleRunMatching}
          matchingJobs={matchingJobs}
        />
      ) : (
        <BoardView
          grouped={filteredGrouped}
          onDrop={handleDrop}
          draggingMatchId={draggingMatchId}
          onDragStart={setDraggingMatchId}
          onDragEnd={() => setDraggingMatchId(null)}
          onToggleBookmark={handleToggleBookmark}
          onRunMatching={handleRunMatching}
          matchingJobs={matchingJobs}
        />
      )}

      {/* ─── Dialogs ─── */}
      {passDialog && (
        <PassDialog
          open
          onClose={() => setPassDialog(null)}
          onSubmit={(reason, notes) => {
            updateStatus.mutate(
              {
                matchId: passDialog.matchId,
                data: { status: "passed", passReason: reason, passNotes: notes || undefined },
              },
              {
                onSuccess: () => setPassDialog(null),
                onError: () => {
                  setStatusOverrides((current) => {
                    const next = { ...current };
                    delete next[passDialog.matchId];
                    return next;
                  });
                },
              },
            );
          }}
          isPending={updateStatus.isPending}
        />
      )}

      {closeDialog && (
        <CloseDealDialog
          open
          onClose={() => setCloseDialog(null)}
          onSubmit={(data) => {
            updateStatus.mutate(
              {
                matchId: closeDialog.matchId,
                data: {
                  status: "closed",
                  investmentAmount: data.amount,
                  investmentCurrency: data.currency,
                  investmentDate: data.date || undefined,
                  investmentNotes: data.notes || undefined,
                },
              },
              {
                onSuccess: () => setCloseDialog(null),
                onError: () => {
                  setStatusOverrides((current) => {
                    const next = { ...current };
                    delete next[closeDialog.matchId];
                    return next;
                  });
                },
              },
            );
          }}
          isPending={updateStatus.isPending}
        />
      )}
    </div>
  );
}
