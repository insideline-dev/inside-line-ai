import { useState, useMemo, useEffect, type DragEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchAndFilters, defaultFilters, type FilterState } from "@/components/SearchAndFilters";
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
  getInvestorControllerGetPipelineQueryKey,
} from "@/api/generated/investor/investor";
import { AnalysisProgressBar } from "@/components/AnalysisProgressBar";
import {
  useStartupControllerFindAll,
} from "@/api/generated/startup/startup";
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
} from "lucide-react";

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
  id: number;
  name: string;
  description: string;
  stage: string;
  industry: string;
  sectorIndustryGroup?: string;
  location: string;
  normalizedRegion?: string;
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
  overallScore: number;
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

function mapPrivateStartupStatus(status: string): Status {
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
          overallScore: m.overallScore,
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
    .filter((s) => !matchedStartupIds.has(String(s.id)))
    .map((s) => ({
      displayName: s.name || "Untitled",
      description: s.description ?? null,
      stage: s.stage ?? null,
      industry: s.industry ?? null,
      location: s.location ?? null,
      overallScore: s.status === "approved" ? s.overallScore : 0,
      createdAt: s.createdAt,
      matchId: null,
      startupId: String(s.id),
      pipelineStatus: mapPrivateStartupStatus(s.status),
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
    if (!item.matchId) return item;
    const overriddenStatus = statusOverrides[item.matchId];
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

function PipelineCard({ item, onToggleBookmark }: { item: PipelineCardItem; onToggleBookmark?: (startupId: string) => void }) {
  const config = STATUS_CONFIG[item.pipelineStatus];

  return (
    <Card className="group overflow-hidden border-border/70 transition-all hover:border-primary/30 hover:shadow-md">
      <Link to="/investor/startup/$id" params={{ id: item.startupId }} className="block h-full">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
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
              <div>
                <p className="line-clamp-1 text-base font-semibold">{item.displayName}</p>
                {item.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                )}
              </div>
            </div>
            {item.overallScore > 0 ? (
              <ScoreRing score={item.overallScore} size="sm" showLabel={false} />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                <FileSearch className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {item.stage && (
              <Badge variant="outline" className="capitalize text-xs">
                {formatStageLabel(item.stage)}
              </Badge>
            )}
            {item.industry && (
              <Badge variant="outline" className="capitalize text-xs">
                {item.industry}
              </Badge>
            )}
          </div>

          {item.isAnalyzing && (
            <AnalysisProgressBar startupId={Number(item.startupId)} compact />
          )}

          {onToggleBookmark && item.matchId && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleBookmark(item.startupId);
                }}
              >
                <Bookmark className={`h-4 w-4 ${item.isSaved ? "fill-current text-primary" : "text-muted-foreground"}`} />
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatDate(item.createdAt)}</span>
            <span className="font-medium text-foreground/80 group-hover:text-primary">
              {item.pipelineStatus === "reviewing" ? "Review Analysis" : "View Analysis"}
            </span>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

function CardsView({
  items,
  onStatusChange,
  onToggleBookmark,
}: {
  items: PipelineCardItem[];
  onStatusChange: (matchId: string, status: Status) => void;
  onToggleBookmark: (startupId: string) => void;
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

        if (item.isAnalyzing || !item.matchId) {
          return <PipelineCard key={key} item={item} onToggleBookmark={onToggleBookmark} />;
        }

        return (
          <ContextMenu key={key}>
            <ContextMenuTrigger>
              <PipelineCard item={item} onToggleBookmark={onToggleBookmark} />
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              <ContextMenuLabel>Move to</ContextMenuLabel>
              <ContextMenuSeparator />
              {STATUSES.map((status) => {
                const cfg = STATUS_CONFIG[status];
                const Icon = cfg.icon;
                const isCurrent = item.pipelineStatus === status;
                return (
                  <ContextMenuItem
                    key={status}
                    disabled={isCurrent}
                    onClick={() => onStatusChange(item.matchId!, status)}
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
}: {
  grouped: Record<Status, PipelineCardItem[]>;
  onDrop: (matchId: string, status: Status) => void;
  draggingMatchId: string | null;
  onDragStart: (matchId: string) => void;
  onDragEnd: () => void;
  onToggleBookmark: (startupId: string) => void;
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
}: {
  status: Status;
  items: PipelineCardItem[];
  onDrop: (matchId: string, status: Status) => void;
  draggingMatchId: string | null;
  onDragStart: (matchId: string) => void;
  onDragEnd: () => void;
  onToggleBookmark: (startupId: string) => void;
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
    const matchId = e.dataTransfer.getData("text/plain");
    if (matchId) onDrop(matchId, status);
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
}: {
  item: PipelineCardItem;
  draggingMatchId: string | null;
  onDragStart: (matchId: string) => void;
  onDragEnd: () => void;
  onToggleBookmark: (startupId: string) => void;
}) {
  function handleDragStart(e: DragEvent) {
    if (!item.matchId) return;
    e.dataTransfer.setData("text/plain", item.matchId);
    e.dataTransfer.effectAllowed = "move";
    onDragStart(item.matchId);
  }

  return (
    <Card
      draggable={!item.isAnalyzing && !!item.matchId}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      className={
        item.isAnalyzing
          ? "opacity-75"
          : item.matchId && item.matchId === draggingMatchId
            ? "cursor-grabbing opacity-60"
            : item.matchId
              ? "cursor-grab active:cursor-grabbing"
              : ""
      }
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{item.displayName}</p>
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
          <div className="flex items-center gap-2">
            <ScoreRing score={item.overallScore} size="sm" showLabel={false} />
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
          </div>
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
        toast.success("Status updated");
      },
      onError: () => {
        toast.error("Failed to update status");
      },
    },
  });

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
  const handleDrop = (matchId: string, newStatus: Status) => {
    const currentItem = allItems.find((item) => item.matchId === matchId);
    if (!currentItem || currentItem.pipelineStatus === newStatus) {
      setDraggingMatchId(null);
      return;
    }

    setStatusOverrides((current) => ({ ...current, [matchId]: newStatus }));

    if (newStatus === "passed") {
      setPassDialog({ matchId });
      setDraggingMatchId(null);
      return;
    }
    if (newStatus === "closed") {
      setCloseDialog({ matchId });
      setDraggingMatchId(null);
      return;
    }

    updateStatus.mutate(
      { matchId, data: { status: newStatus } },
      {
        onError: () => {
          setStatusOverrides((current) => {
            const next = { ...current };
            delete next[matchId];
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
        />
      </div>

      {/* ─── Content Area ─── */}
      {viewMode === "list" ? (
        <CardsView items={filteredItems} onStatusChange={handleDrop} onToggleBookmark={handleToggleBookmark} />
      ) : (
        <BoardView
          grouped={filteredGrouped}
          onDrop={handleDrop}
          draggingMatchId={draggingMatchId}
          onDragStart={setDraggingMatchId}
          onDragEnd={() => setDraggingMatchId(null)}
          onToggleBookmark={handleToggleBookmark}
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
