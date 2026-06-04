import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { AnalysisProgressBar } from "@/components/AnalysisProgressBar";
import { useAdminControllerGetStats, useAdminControllerGetAllStartups } from "@/api/generated/admin/admin";
import type { AdminControllerGetAllStartupsStatus } from "@/api/generated/model";
import { Clock, Sparkles, CheckCircle, XCircle, Users, Target, Building2, Eye, FileText, Handshake } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { StageNav } from "@/components/investor/StageNav";
import { unwrapApiResponse } from "@/lib/api-utils";
import { DataGateDocsModal } from "@/components/data-gate/DataGateDocsModal";

export const Route = createFileRoute("/_protected/admin/")({
  component: AdminDashboard,
});

interface PlatformStats {
  users: {
    total: number;
    byRole: Record<string, number>;
  };
  startups: {
    total: number;
    byStatus: Record<string, number>;
    pending: number;
  };
  matches: {
    total: number;
    highScore: number;
  };
}

interface StartupItem {
  id: string;
  name: string;
  status: string;
  description?: string;
  website?: string;
  stage?: string;
  industry?: string;
  overallScore?: number;
  createdAt: string;
  percentileRank?: number;
  logoUrl?: string | null;
  dataGateStatus?: "pending" | "skipped" | "complete" | null;
}

const TAB_TO_STATUS: Record<string, AdminControllerGetAllStartupsStatus | undefined> = {
  pending_review: "pending_review",
  analyzing: "analyzing",
  approved: "approved",
  rejected: "rejected",
  all: undefined,
};

function getStatusBadge(status: string) {
  const variants: Record<string, { label: string; className: string }> = {
    submitted: { label: "Pending", className: "bg-chart-4/10 text-chart-4 border-chart-4/20" },
    pending_review: { label: "Pending", className: "bg-chart-4/10 text-chart-4 border-chart-4/20" },
    analyzing: { label: "Analyzing", className: "bg-chart-5/10 text-chart-5 border-chart-5/20" },
    approved: { label: "Approved", className: "bg-chart-2/10 text-chart-2 border-chart-2/20" },
    rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive border-destructive/20" },
  };

  const variant = variants[status] || { label: status, className: "" };
  return (
    <Badge variant="outline" className={variant.className}>
      {variant.label}
    </Badge>
  );
}

function countByStatus(items: StartupItem[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const s of items) {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
  }
  return acc;
}

function formatStage(stage: string) {
  return stage
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function StartupLogo({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const [imgError, setImgError] = useState(false);
  const initial = name.charAt(0).toUpperCase();

  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className="w-11 h-11 rounded-lg object-contain bg-muted/40 shrink-0"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center shrink-0">
      <span className="text-base font-semibold text-muted-foreground">{initial}</span>
    </div>
  );
}

function AdminStartupRow({ startup }: { startup: StartupItem }) {
  const [effectiveStatus, setEffectiveStatus] = useState(startup.status);

  useEffect(() => {
    setEffectiveStatus(startup.status);
  }, [startup.status]);

  const handleTerminalStatus = useCallback(
    (status: "pending_review" | "submitted") => {
      setEffectiveStatus((current) => (current === status ? current : status));
    },
    [],
  );

  return (
    <Card className="hover:shadow-md transition-shadow group">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <StartupLogo name={startup.name} logoUrl={startup.logoUrl} />

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold leading-tight">{startup.name}</h3>
              {getStatusBadge(effectiveStatus)}
              {startup.stage && <Badge variant="outline" className="text-[11px] px-1.5 py-0">{formatStage(startup.stage)}</Badge>}
              {startup.industry && <Badge variant="secondary" className="text-[11px] px-1.5 py-0">{startup.industry}</Badge>}
            </div>
            {startup.description && (
              <p className="text-[13px] text-muted-foreground line-clamp-1">{startup.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {startup.website && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {startup.website}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {format(new Date(startup.createdAt), "MMM d, yyyy")}
              </span>
              {startup.percentileRank != null && startup.percentileRank > 0 && (
                <span>Top {Math.round(100 - startup.percentileRank)}%</span>
              )}
            </div>
            {(effectiveStatus === "submitted" || effectiveStatus === "analyzing") && (
              <AnalysisProgressBar
                startupId={startup.id}
                onTerminalStatus={handleTerminalStatus}
                compact
              />
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {startup.overallScore ? (
              <ScoreRing score={startup.overallScore} size="sm" showLabel={false} />
            ) : (
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Clock className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <Button variant={effectiveStatus === "analyzing" ? "default" : "outline"} size="sm" asChild>
              <Link to="/admin/startup/$id" params={{ id: startup.id }}>
                {effectiveStatus === "analyzing" ? (
                  <Sparkles className="w-4 h-4 mr-1.5" />
                ) : (
                  <Eye className="w-4 h-4 mr-1.5" />
                )}
                {effectiveStatus === "analyzing" ? "Live" : "Review"}
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminDataGateRow({
  startup,
  onOpen,
}: {
  startup: StartupItem;
  onOpen: (s: { startupId: string; displayName: string }) => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow group">
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => onOpen({ startupId: startup.id, displayName: startup.name })}
          className="flex w-full items-start gap-4 text-left"
        >
          <StartupLogo name={startup.name} logoUrl={startup.logoUrl} />

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold leading-tight group-hover:underline">
                {startup.name}
              </h3>
              {getStatusBadge(startup.status)}
              {startup.stage && <Badge variant="outline" className="text-[11px] px-1.5 py-0">{formatStage(startup.stage)}</Badge>}
              {startup.industry && <Badge variant="secondary" className="text-[11px] px-1.5 py-0">{startup.industry}</Badge>}
            </div>
            {startup.description && (
              <p className="text-[13px] text-muted-foreground line-clamp-1">{startup.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {startup.website && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {startup.website}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {format(new Date(startup.createdAt), "MMM d, yyyy")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-sm text-muted-foreground">
            <FileText className="w-4 h-4" />
            Review docs
          </div>
        </button>
      </CardContent>
    </Card>
  );
}

type DDSubTab = "data-gates" | "analyzed" | "engaged";

function AdminDashboard() {
  const [dataGateModal, setDataGateModal] = useState<{ startupId: string; displayName: string } | null>(null);
  const [ddSubTab, setDdSubTab] = useState<DDSubTab>("analyzed");
  const prevAnalyzingCountRef = useRef<number>(0);
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const statusFilter = TAB_TO_STATUS[activeTab];

  const { data: statsResponse, isLoading: isLoadingStats } = useAdminControllerGetStats({
    query: {
      staleTime: 30_000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      refetchInterval: (query: any) => {
        const data = query.state.data as PlatformStats | undefined;
        return (data?.startups?.byStatus?.analyzing ?? 0) > 0 ? 5000 : 15000;
      },
    },
  });

  const { data: startupsResponse, isLoading: isLoadingStartups } = useAdminControllerGetAllStartups(
    { limit: PAGE_SIZE, page, excludePreScreening: "true", ...(statusFilter ? { status: statusFilter } : {}) },
    {
      query: {
        staleTime: 30_000,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        refetchInterval: (query: any) => {
          const data = query.state.data as { data: StartupItem[] } | undefined;
          const hasAnalyzing = data?.data?.some((s) => s.status === "analyzing");
          return hasAnalyzing ? 5000 : 15000;
        },
      },
    }
  );

  // All DD-advanced deals in one fetch (large limit, no status filter so
  // client-side grouping isn't truncated by pagination). excludePreScreening
  // means this is scoped to deals advanced to DD — the same scope as the list
  // below — so the counts derived from it match what's actually rendered.
  // Powers both the Data Gates sub-tab and the DD-scoped counts.
  const { data: ddDealsResponse, isLoading: isLoadingDataGate } = useAdminControllerGetAllStartups(
    { limit: 100, page: 1, excludePreScreening: "true" },
    {
      query: {
        staleTime: 30_000,
      },
    }
  );

  const statsData = statsResponse as unknown as PlatformStats | undefined;
  const startups = unwrapApiResponse<StartupItem[]>(startupsResponse) ?? [];
  const analyzedStartups = startups.filter((s) => s.dataGateStatus !== "pending");

  const ddDeals = unwrapApiResponse<StartupItem[]>(ddDealsResponse) ?? [];
  const dataGateStartups = ddDeals.filter((s) => s.dataGateStatus === "pending");
  // DD-scoped status breakdown. The top stat cards summarize the whole DD
  // board (every advanced deal); the Analyzed status-filter tabs summarize the
  // Analyzed subset only (gate not pending — pending-gate deals live in the
  // Data Gates sub-tab).
  const ddByStatus = countByStatus(ddDeals);
  const analyzedDeals = ddDeals.filter((s) => s.dataGateStatus !== "pending");
  const analyzedByStatus = countByStatus(analyzedDeals);

  // Toast notification when analyzing count drops
  useEffect(() => {
    const currentAnalyzingCount = statsData?.startups?.byStatus?.analyzing ?? 0;
    const prevCount = prevAnalyzingCountRef.current;

    if (prevCount > 0 && currentAnalyzingCount < prevCount) {
      const completed = prevCount - currentAnalyzingCount;
      toast.success("Analysis Complete", {
        description: `${completed} startup${completed > 1 ? "s have" : " has"} finished analyzing.`,
      });
    }
    prevAnalyzingCountRef.current = currentAnalyzingCount;
  }, [statsData?.startups?.byStatus?.analyzing]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setPage(1);
  };

  // Stat cards: scoped to the DD board (deals advanced to DD), not the whole
  // platform. Investors / Matches remain platform-wide.
  const stats = [
    {
      label: "Pending",
      value: (ddByStatus.pending_review ?? 0) + (ddByStatus.submitted ?? 0),
      icon: Clock,
      accent: "border-l-amber-500",
      iconColor: "text-amber-600",
    },
    {
      label: "Analyzing",
      value: ddByStatus.analyzing ?? 0,
      icon: Sparkles,
      accent: "border-l-violet-500",
      iconColor: "text-violet-600",
    },
    {
      label: "Approved",
      value: ddByStatus.approved ?? 0,
      icon: CheckCircle,
      accent: "border-l-emerald-500",
      iconColor: "text-emerald-600",
    },
    {
      label: "Rejected",
      value: ddByStatus.rejected ?? 0,
      icon: XCircle,
      accent: "border-l-red-500",
      iconColor: "text-red-600",
    },
    {
      label: "Investors",
      value: statsData?.users?.byRole?.investor ?? 0,
      icon: Users,
      accent: "border-l-sky-500",
      iconColor: "text-sky-600",
    },
    {
      label: "Matches",
      value: statsData?.matches?.total ?? 0,
      icon: Target,
      accent: "border-l-primary",
      iconColor: "text-primary",
    },
  ];

  // Status-filter tab counts: scoped to the Analyzed subset (DD-advanced,
  // gate not pending) so the badges match the rendered list.
  const tabs = [
    { value: "all", label: "All", count: analyzedDeals.length },
    {
      value: "pending_review",
      label: "Pending Review",
      count: (analyzedByStatus.pending_review ?? 0) + (analyzedByStatus.submitted ?? 0),
    },
    { value: "analyzing", label: "Analyzing", count: analyzedByStatus.analyzing ?? 0 },
    { value: "approved", label: "Approved", count: analyzedByStatus.approved ?? 0 },
    { value: "rejected", label: "Rejected", count: analyzedByStatus.rejected ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <StageNav surface="admin" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Due Diligence</h1>
          <p className="text-muted-foreground">Review and manage startup submissions</p>
        </div>
      </div>

      {/* Stats */}
      {isLoadingStats ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {stats.map((stat) => (
            <Card key={stat.label} className={`border-l-3 ${stat.accent}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <stat.icon className={`w-4 h-4 shrink-0 ${stat.iconColor}`} />
                <div className="min-w-0">
                  <p className="text-2xl font-semibold tabular-nums leading-none">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── DD Sub-stage Tabs ─── */}
      <Tabs value={ddSubTab} onValueChange={(v) => setDdSubTab(v as DDSubTab)}>
        <TabsList>
          <TabsTrigger value="data-gates">
            Data Gates
            {dataGateStartups.length > 0 ? (
              <Badge variant="secondary" className="ml-2">
                {dataGateStartups.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="analyzed">Analyzed</TabsTrigger>
          <TabsTrigger value="engaged">
            <Handshake className="mr-1.5 h-4 w-4" />
            Engaged
          </TabsTrigger>
        </TabsList>

        <TabsContent value="data-gates" className="mt-6 space-y-4">
          {isLoadingDataGate ? (
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          ) : dataGateStartups.length > 0 ? (
            <div className="grid gap-4">
              {dataGateStartups.map((startup) => (
                <AdminDataGateRow
                  key={startup.id}
                  startup={startup}
                  onOpen={setDataGateModal}
                />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <FileText className="h-8 w-8 opacity-60" />
                <h3 className="text-lg font-semibold text-foreground">No deals waiting in Data Gates</h3>
                <p className="text-sm">
                  Deals waiting for missing documents before the DD pipeline runs.
                  Investors can skip or request docs via Clara.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="engaged" className="mt-6">
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <Handshake className="h-8 w-8 opacity-60" />
              <h3 className="text-lg font-semibold text-foreground">DD / Engaged</h3>
              <p className="text-sm">
                Deals investors are actively reviewing within Due Diligence.
              </p>
              <p className="text-xs">Deals moved here manually from the Analyzed board.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analyzed" className="mt-6 space-y-6">

      {/* Status filter Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              {tab.count && tab.count > 0 ? (
                <Badge variant="secondary" className="ml-2">
                  {tab.count}
                </Badge>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="space-y-4">
            {isLoadingStartups ? (
              <div className="grid gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 rounded-lg" />
                ))}
              </div>
            ) : analyzedStartups.length > 0 ? (
              <div className="grid gap-4">
                {analyzedStartups.map((startup) => (
                  <AdminStartupRow key={startup.id} startup={startup} />
                ))}

                {startups.length >= PAGE_SIZE && (
                  <div className="flex justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="flex items-center text-sm text-muted-foreground px-3">
                      Page {page}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    {tab.value === "pending_review" ? "All caught up!" : "No matching results"}
                  </h3>
                  <p className="text-muted-foreground">
                    {tab.value === "pending_review"
                      ? "No startups pending review at the moment."
                      : `There are no startups in ${tab.label.toLowerCase()} status.`}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>

        </TabsContent>
      </Tabs>

      {dataGateModal && (
        <DataGateDocsModal
          startupId={dataGateModal.startupId}
          displayName={dataGateModal.displayName}
          open={dataGateModal !== null}
          onOpenChange={(o) => {
            if (!o) setDataGateModal(null);
          }}
        />
      )}
    </div>
  );
}
