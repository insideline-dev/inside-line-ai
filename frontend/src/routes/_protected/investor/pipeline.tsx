import { useState, useMemo, type DragEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  LayoutGrid,
  Columns3,
  Search,
  Clock,
  GripVertical,
  Loader2,
  Plus,
  Check,
  Sparkles,
  Eye,
  Star,
  CheckCircle2,
  CircleX,
} from "lucide-react";
import { toast } from "sonner";

import {
  useInvestorControllerGetPipeline,
  useInvestorControllerUpdateMatchStatus,
  getInvestorControllerGetPipelineQueryKey,
} from "@/api/generated/investor/investor";
import {
  useStartupControllerFindAll,
} from "@/api/generated/startup/startup";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/analysis/ScoreRing";

export const Route = createFileRoute("/_protected/investor/pipeline")({
  component: PipelinePage,
});

// --- Types ---

type PipelineMatch = {
  id: string;
  startupId: string;
  overallScore: number;
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
type ViewMode = "cards" | "kanban";
type StartupStatus =
  | "draft"
  | "submitted"
  | "analyzing"
  | "pending_review"
  | "approved"
  | "rejected";

type PrivateStartup = {
  id: string;
  name: string;
  description: string;
  stage: string;
  location: string;
  overallScore: number | null;
  status: StartupStatus;
  createdAt: string;
};

// --- Constants ---

const STATUSES: Status[] = ["new", "reviewing", "engaged", "closed", "passed"];

const STATUS_CONFIG: Record<
  Status,
  {
    label: string;
    icon: typeof Sparkles;
    iconClass: string;
    badgeClass: string;
    borderClass: string;
  }
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

const PASS_REASONS = [
  "Valuation",
  "Market Fit",
  "Team",
  "Timing",
  "Competition",
  "Other",
] as const;

const CURRENCIES = ["USD", "EUR", "GBP"] as const;

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
};

// --- Helpers ---

function formatDate(date: string | null) {
  if (!date) return "--";
  return format(new Date(date), "MMM d, yyyy");
}

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

function formatStageLabel(stage: string | null | undefined): string {
  if (!stage) return "Unknown stage";
  return stage.replace(/_/g, " ");
}

function extractResponseData<T>(payload: unknown): T | null {
  if (payload === null || payload === undefined) {
    return null;
  }

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

function mergeStartups(
  pipeline: PipelineData,
  privateStartups: PrivateStartup[],
) {
  const matchItems: PipelineCardItem[] = STATUSES.flatMap((status) =>
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
    })),
  );

  const matchedStartupIds = new Set(matchItems.map((m) => m.startupId));

  const analyzingItems: PipelineCardItem[] = privateStartups
    .filter(
      (s) =>
        (s.status === "submitted" || s.status === "analyzing") &&
        !matchedStartupIds.has(s.id),
    )
    .map((s) => ({
      displayName: s.name || "Untitled",
      description: s.description ?? null,
      stage: s.stage ?? null,
      industry: null,
      location: s.location ?? null,
      overallScore: 0,
      createdAt: s.createdAt,
      matchId: null,
      startupId: s.id,
      pipelineStatus: "new" as Status,
      isAnalyzing: true,
      isPrivate: true,
    }));

  const allItems = [...matchItems, ...analyzingItems];

  const grouped = Object.fromEntries(
    STATUSES.map((s) => [s, allItems.filter((item) => item.pipelineStatus === s)]),
  ) as Record<Status, PipelineCardItem[]>;

  return { allItems, grouped };
}

// --- Main Component ---

function PipelinePage() {
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");

  // Dialogs
  const [passDialog, setPassDialog] = useState<{ matchId: string } | null>(null);
  const [closeDialog, setCloseDialog] = useState<{ matchId: string } | null>(null);

  const queryClient = useQueryClient();
  const pipelineResponse = useInvestorControllerGetPipeline();
  const pipeline = extractResponseData<PipelineData>(pipelineResponse.data);
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

  const updateStatus = useInvestorControllerUpdateMatchStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getInvestorControllerGetPipelineQueryKey(),
        });
        toast.success("Status updated");
      },
      onError: () => {
        toast.error("Failed to update status");
      },
    },
  });

  // --- Merged items (must be before any early returns to preserve hook order) ---

  const { allItems, grouped } = useMemo(
    () => {
      if (!pipeline) {
        const empty = { new: [], reviewing: [], engaged: [], closed: [], passed: [] } satisfies Record<Status, PipelineCardItem[]>;
        return { allItems: [] as PipelineCardItem[], grouped: empty };
      }
      return mergeStartups(pipeline, myStartups);
    },
    [pipeline, myStartups],
  );

  const filteredItems = useMemo(
    () =>
      allItems.filter((item) =>
        item.displayName.toLowerCase().includes(search.toLowerCase()),
      ),
    [allItems, search],
  );

  // --- Loading / Error ---

  if (pipelineResponse.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (pipelineResponse.error || !pipeline) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive text-pretty">
          Failed to load pipeline.
        </CardContent>
      </Card>
    );
  }

  // --- Drag and Drop handler ---

  function handleDrop(matchId: string, newStatus: Status) {
    if (newStatus === "passed") {
      setPassDialog({ matchId });
      return;
    }
    if (newStatus === "closed") {
      setCloseDialog({ matchId });
      return;
    }
    updateStatus.mutate({ matchId, data: { status: newStatus } });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search startups..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === "cards" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("cards")}
              className="rounded-r-none"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("kanban")}
              className="rounded-l-none"
            >
              <Columns3 className="h-4 w-4" />
            </Button>
          </div>
          <Button asChild>
            <Link to="/investor/submit">
              <Plus className="h-4 w-4 mr-2" />
              Analyze Startup
            </Link>
          </Button>
        </div>
      </div>

      {/* Views */}
      {viewMode === "kanban" ? (
        <BoardView grouped={grouped} search={search} onDrop={handleDrop} />
      ) : (
        <CardsView items={filteredItems} onStatusChange={handleDrop} />
      )}

      {/* Dialogs */}
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
              { onSuccess: () => setPassDialog(null) },
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
              { onSuccess: () => setCloseDialog(null) },
            );
          }}
          isPending={updateStatus.isPending}
        />
      )}
    </div>
  );
}

// --- Sub-components (kept in same file) ---

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-balance">Deal Pipeline</h1>
      <p className="text-muted-foreground text-pretty">
        Organize startups by deal stage.
      </p>
    </div>
  );
}

// --- Cards View ---

function PipelineCard({ item }: { item: PipelineCardItem }) {
  const config = STATUS_CONFIG[item.pipelineStatus];

  return (
    <Card className="transition-colors hover:bg-muted/30">
      <Link to="/investor/startup/$id" params={{ id: item.startupId }}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{item.displayName}</p>
              {item.description && (
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {item.description}
                </p>
              )}
            </div>
            {item.overallScore > 0 && (
              <ScoreRing score={item.overallScore} size="sm" showLabel={false} />
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {item.industry && (
              <Badge variant="outline" className="capitalize text-xs">
                {item.industry}
              </Badge>
            )}
            {item.stage && (
              <Badge variant="outline" className="capitalize text-xs">
                {formatStageLabel(item.stage)}
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between">
            {item.isAnalyzing ? (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analyzing...
              </Badge>
            ) : (
              <Badge className={config.badgeClass}>{config.label}</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {formatDate(item.createdAt)}
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
}: {
  items: PipelineCardItem[];
  onStatusChange: (matchId: string, status: Status) => void;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No deals found.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {items.map((item) => {
        const key = item.matchId ?? item.startupId;

        if (item.isAnalyzing || !item.matchId) {
          return <PipelineCard key={key} item={item} />;
        }

        return (
          <ContextMenu key={key}>
            <ContextMenuTrigger>
              <PipelineCard item={item} />
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

// --- Board View ---

function BoardView({
  grouped,
  search,
  onDrop,
}: {
  grouped: Record<Status, PipelineCardItem[]>;
  search: string;
  onDrop: (matchId: string, status: Status) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
      {STATUSES.map((status) => {
        const items = grouped[status].filter(
          (item) =>
            !search ||
            item.displayName.toLowerCase().includes(search.toLowerCase()),
        );
        return (
          <KanbanColumn
            key={status}
            status={status}
            items={items}
            onDrop={onDrop}
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
}: {
  status: Status;
  items: PipelineCardItem[];
  onDrop: (matchId: string, status: Status) => void;
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
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex h-[230px] flex-col overflow-hidden rounded-xl border bg-card transition-colors ${
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
          <KanbanCard key={item.matchId ?? item.startupId} item={item} />
        ))}
        {items.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No startups</p>
        )}
      </div>
    </div>
  );
}

function KanbanCard({ item }: { item: PipelineCardItem }) {
  function handleDragStart(e: DragEvent) {
    if (!item.matchId) return;
    e.dataTransfer.setData("text/plain", item.matchId);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <Card
      draggable={!item.isAnalyzing && !!item.matchId}
      onDragStart={handleDragStart}
      className={
        item.isAnalyzing ? "opacity-75" : "cursor-grab active:cursor-grabbing"
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
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </div>
        {!item.isAnalyzing && (
          <div className="flex items-center gap-2">
            <ScoreRing score={item.overallScore} size="sm" showLabel={false} />
            <div className="flex-1 min-w-0 space-y-0.5">
              {item.industry && (
                <p className="text-xs text-muted-foreground truncate">
                  {item.industry}
                </p>
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

// --- PassDialog ---

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
          <DialogDescription>
            Select a reason for passing on this opportunity.
          </DialogDescription>
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

// --- CloseDealDialog ---

function CloseDealDialog({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    amount: number;
    currency: string;
    date: string;
    notes: string;
  }) => void;
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
          <DialogDescription>
            Record the investment details for this deal.
          </DialogDescription>
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
