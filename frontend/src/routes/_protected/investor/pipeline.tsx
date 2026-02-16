import { useState, type DragEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { List, LayoutGrid, Search, Clock, GripVertical, Lock, Loader2, ArrowRight, MapPin } from "lucide-react";
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
import { AnalysisProgressBar } from "@/components/AnalysisProgressBar";

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
type ViewMode = "list" | "board";
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
  { label: string; color: string; badgeClass: string; borderClass: string }
> = {
  new: {
    label: "New",
    color: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    borderClass: "border-blue-500",
  },
  reviewing: {
    label: "Reviewing",
    color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    badgeClass: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    borderClass: "border-yellow-500",
  },
  engaged: {
    label: "Engaged",
    color: "bg-green-500/10 text-green-700 dark:text-green-400",
    badgeClass: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    borderClass: "border-green-500",
  },
  closed: {
    label: "Closed",
    color: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    borderClass: "border-purple-500",
  },
  passed: {
    label: "Passed",
    color: "bg-red-500/10 text-red-700 dark:text-red-400",
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

// --- Helpers ---

function formatDate(date: string | null) {
  if (!date) return "--";
  return format(new Date(date), "MMM d, yyyy");
}

function getAllMatches(pipeline: PipelineData): PipelineMatch[] {
  return STATUSES.flatMap((s) => pipeline[s]);
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

function getStartupStatusBadge(status: StartupStatus) {
  switch (status) {
    case "submitted":
      return (
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" />
          Queued
        </Badge>
      );
    case "analyzing":
      return (
        <Badge variant="outline" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Analyzing
        </Badge>
      );
    case "approved":
      return <Badge className="bg-chart-2/10 text-chart-2 border-chart-2/20">Ready</Badge>;
    case "pending_review":
      return <Badge variant="secondary">Pending Review</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    default:
      return <Badge variant="secondary">Draft</Badge>;
  }
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

// --- Main Component ---

function PipelinePage() {
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<Status | null>(null);

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

  // --- Filtered matches for list view ---

  const allMatches = getAllMatches(pipeline);
  const filteredMatches = allMatches.filter((m) => {
    const matchesSearch =
      !search ||
      (m.startupName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesFilter = !filterStatus || m.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

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
              variant={viewMode === "board" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("board")}
              className="rounded-r-none"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* My Private Analysis */}
      {myStartupsResponse.isLoading ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">My Private Analysis</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        </div>
      ) : myStartups.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">My Private Analysis</h2>
            <Badge variant="secondary">{myStartups.length}</Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {myStartups.map((startup) => (
              <Card key={startup.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{startup.name}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {startup.description || "No description"}
                      </p>
                    </div>
                    <ScoreRing
                      score={startup.status === "approved" ? startup.overallScore ?? 0 : 0}
                      size="sm"
                      showLabel={false}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    {getStartupStatusBadge(startup.status)}
                    <Badge variant="outline" className="capitalize">
                      {formatStageLabel(startup.stage)}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {startup.location || "Unknown"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(startup.createdAt)}
                    </span>
                  </div>

                  {(startup.status === "submitted" || startup.status === "analyzing") && (
                    <AnalysisProgressBar startupId={startup.id} />
                  )}

                  {(startup.status === "approved" || startup.status === "pending_review") && (
                    <Button asChild size="sm" className="w-full">
                      <Link to="/investor/startup/$id" params={{ id: String(startup.id) }}>
                        {startup.status === "pending_review" ? "Review Analysis" : "View Analysis"}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {/* Views */}
      {viewMode === "board" ? (
        <BoardView pipeline={pipeline} search={search} onDrop={handleDrop} />
      ) : (
        <ListView
          matches={filteredMatches}
          pipeline={pipeline}
          filterStatus={filterStatus}
          onFilterStatus={setFilterStatus}
          onDrop={handleDrop}
        />
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

// --- Board View ---

function BoardView({
  pipeline,
  search,
  onDrop,
}: {
  pipeline: PipelineData;
  search: string;
  onDrop: (matchId: string, status: Status) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
      {STATUSES.map((status) => {
        const matches = pipeline[status].filter(
          (m) =>
            !search ||
            (m.startupName ?? "").toLowerCase().includes(search.toLowerCase()),
        );
        return (
          <KanbanColumn
            key={status}
            status={status}
            matches={matches}
            onDrop={onDrop}
          />
        );
      })}
    </div>
  );
}

function KanbanColumn({
  status,
  matches,
  onDrop,
}: {
  status: Status;
  matches: PipelineMatch[];
  onDrop: (matchId: string, status: Status) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const config = STATUS_CONFIG[status];

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
      className={`rounded-lg border-2 bg-muted/30 p-3 min-h-[300px] transition-colors ${
        dragOver ? config.borderClass : "border-transparent"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{config.label}</h3>
        <Badge variant="secondary" className="text-xs tabular-nums">
          {matches.length}
        </Badge>
      </div>
      <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-280px)]">
        {matches.map((match) => (
          <KanbanCard key={match.id} match={match} />
        ))}
        {matches.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            No deals
          </p>
        )}
      </div>
    </div>
  );
}

function KanbanCard({ match }: { match: PipelineMatch }) {
  function handleDragStart(e: DragEvent) {
    e.dataTransfer.setData("text/plain", match.id);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <Card
      draggable
      onDragStart={handleDragStart}
      className="cursor-grab active:cursor-grabbing"
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">
              {match.startupName ?? "Untitled Startup"}
            </p>
          </div>
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-2">
          <ScoreRing score={match.overallScore} size="sm" showLabel={false} />
          <div className="flex-1 min-w-0 space-y-0.5">
            {match.startupIndustry && (
              <p className="text-xs text-muted-foreground truncate">
                {match.startupIndustry}
              </p>
            )}
            {match.startupStage && (
              <p className="text-xs text-muted-foreground truncate">
                {match.startupStage}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatDate(match.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// --- List View ---

function ListView({
  matches,
  pipeline,
  filterStatus,
  onFilterStatus,
  onDrop,
}: {
  matches: PipelineMatch[];
  pipeline: PipelineData;
  filterStatus: Status | null;
  onFilterStatus: (s: Status | null) => void;
  onDrop: (matchId: string, status: Status) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Filter cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUSES.map((status) => {
          const config = STATUS_CONFIG[status];
          const count = pipeline[status].length;
          const isActive = filterStatus === status;
          return (
            <button
              key={status}
              onClick={() => onFilterStatus(isActive ? null : status)}
              className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
                isActive ? `ring-2 ring-offset-2 ${config.borderClass} ring-current` : ""
              }`}
            >
              <p className="text-xs text-muted-foreground">{config.label}</p>
              <p className="text-2xl font-bold tabular-nums">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {matches.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No deals found.
            </CardContent>
          </Card>
        )}
        {matches.map((match) => (
          <ListRow key={match.id} match={match} onStatusChange={onDrop} />
        ))}
      </div>
    </div>
  );
}

function ListRow({
  match,
  onStatusChange,
}: {
  match: PipelineMatch;
  onStatusChange: (matchId: string, status: Status) => void;
}) {
  const config = STATUS_CONFIG[match.status];

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <ScoreRing score={match.overallScore} size="sm" showLabel={false} />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">
            {match.startupName ?? "Untitled Startup"}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            {[match.startupIndustry, match.startupStage]
              .filter(Boolean)
              .join(" \u00b7 ")}
          </p>
        </div>
        <Badge className={config.badgeClass}>{config.label}</Badge>
        <span className="text-sm tabular-nums font-medium w-10 text-center">
          {Math.round(match.overallScore)}
        </span>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(match.createdAt)}
        </span>
        <Select
          value={match.status}
          onValueChange={(v) => onStatusChange(match.id, v as Status)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
