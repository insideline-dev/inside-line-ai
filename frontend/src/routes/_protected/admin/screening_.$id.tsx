import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Loader2, Radio, RefreshCw, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customFetch } from "@/api/client";
import { StageNav } from "@/components/investor/StageNav";
import { AdminPipelineLivePanel } from "@/components/startup-view/AdminPipelineLivePanel";
import {
  ScreeningDetailBody,
  ScreeningDetailHeader,
} from "@/components/investor/ScreeningDetail";
import { DataRoomPanel } from "@/components/startup-view/DataRoomPanel";
import { AdminEditTab } from "@/components/startup-view/AdminEditTab";
import { DealActivityTimeline } from "@/components/startup-view/DealActivityTimeline";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStartupControllerFindOne } from "@/api/generated/startups/startups";
import { useStartupRealtimeProgress } from "@/lib/startup/useStartupRealtimeProgress";
import { ScreeningVerdictOverrideDialog } from "@/components/investor/ScreeningVerdictOverrideDialog";
import type { ScreeningRow, ScreeningVerdict } from "@/components/investor/screening-types";
import type { Startup } from "@/types/startup";
import { useScreeningOutput } from "@/lib/screening/useScreeningOutput";
import { downloadScreening } from "@/lib/pdf/download";

/**
 * Admin DS detail. Shares the header + rich detail body with the investor
 * surface, but adds a second tab that surfaces the same
 * AdminPipelineLivePanel the DD view uses — agent traces, retry surfaces,
 * phase data inspector, activity stream — scoped to DS phases.
 *
 * DS phases (in order): classification → extraction → enrichment →
 * scraping → screening. Research / evaluation / synthesis are
 * intentionally DD-only and hidden from this view; the screening
 * lenses (market / team / traction) do their own light research
 * internally as part of the SCREENING phase.
 */
export const Route = createFileRoute("/_protected/admin/screening_/$id")({
  component: AdminScreeningDetailPage,
});

const DS_PHASES = [
  "classification",
  "extraction",
  "enrichment",
  "scraping",
  "screening",
] as const;

function unwrap<T>(payload: unknown): T | undefined {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>)
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T | undefined;
}

function AdminScreeningDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  // Shared with /admin/screening so the cache is reused. The detail row
  // comes from the same global admin queue payload.
  const { data: rows, isLoading: rowLoading } = useQuery({
    queryKey: ["admin", "screening"],
    queryFn: () => customFetch<ScreeningRow[]>("/admin/screening"),
    staleTime: 30_000,
  });
  const row = useMemo(() => rows?.find((r) => r.id === id) ?? null, [rows, id]);
  const screeningOutput = useScreeningOutput(id);
  const [activeTab, setActiveTab] = useState("details");

  const { progress } = useStartupRealtimeProgress(id, { pollMs: 2000 });
  const screeningStatus = progress?.phases?.screening?.status;
  const prevScreeningStatus = useRef(screeningStatus);
  useEffect(() => {
    if (
      prevScreeningStatus.current &&
      prevScreeningStatus.current !== "completed" &&
      screeningStatus === "completed"
    ) {
      toast.success("Screening complete — showing updated results");
      setActiveTab("details");
      qc.invalidateQueries({ refetchType: "all" });
    }
    prevScreeningStatus.current = screeningStatus;
  }, [screeningStatus, qc, id]);

  const { data: startupRes, isLoading: startupLoading } =
    useStartupControllerFindOne(id, { query: { retry: false } });
  const startup = unwrap<{ name?: string; status?: string }>(startupRes);

  const rescreen = useMutation({
    mutationFn: () =>
      customFetch<{ ok: boolean; note: string }>(
        `/investor/screening/${id}/rescreen`,
        { method: "POST" },
      ),
    onSuccess: (res) => {
      toast.success("Re-screening queued", { description: res.note });
      setActiveTab("pipeline");
      qc.invalidateQueries();
    },
    onError: (err) =>
      toast.error("Re-screen failed", { description: (err as Error).message }),
  });

  const isScreeningLive = screeningStatus === "running" || screeningStatus === "in_progress" || rescreen.isPending;

  const overrideMutation = useMutation({
    mutationFn: (input: {
      targetClassification: ScreeningVerdict;
      reason: string;
      reasonCode?: string;
    }) =>
      customFetch(`/admin/screening/${id}/override`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success("Screening verdict override saved");
      qc.invalidateQueries({ queryKey: ["admin", "screening"] });
      qc.invalidateQueries({ queryKey: ["investor", "screening"] });
    },
    onError: (err) =>
      toast.error("Override failed", { description: (err as Error).message }),
  });

  const cancelPipeline = useMutation({
    mutationFn: () =>
      customFetch<{ cancelled: boolean }>(
        `/admin/startups/${id}/cancel-pipeline`,
        { method: "POST" },
      ),
    onSuccess: () => toast.success("Pipeline cancellation requested"),
    onError: (err) =>
      toast.error("Cancel failed", { description: (err as Error).message }),
  });

  const [isDownloadingScreening, setIsDownloadingScreening] = useState(false);
  const handleDownloadScreening = useCallback(async () => {
    if (!row || !screeningOutput.data) return;
    setIsDownloadingScreening(true);
    try {
      await downloadScreening({
        startup: {
          id: row.id,
          name: row.companyName,
          description: row.description ?? undefined,
          industry: row.industry ?? undefined,
          stage: row.stage ?? undefined,
          location: row.location ?? undefined,
          website: row.website ?? undefined,
        } as Startup,
      });
    } catch (err) {
      toast.error("Could not download screening report", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setIsDownloadingScreening(false);
    }
  }, [row, screeningOutput.data]);

  const isLoading = rowLoading || startupLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const extraActions = (
    <>
      {row && (
        <ScreeningVerdictOverrideDialog
          currentVerdict={row.verdict}
          isSubmitting={overrideMutation.isPending}
          onSubmit={(input) => overrideMutation.mutate(input)}
        />
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownloadScreening}
        disabled={!screeningOutput.data || isDownloadingScreening}
        title={
          screeningOutput.data
            ? "Download a 1-page screening report you can share"
            : "Run screening first to enable download"
        }
      >
        {isDownloadingScreening ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        Share PDF
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => rescreen.mutate()}
        disabled={rescreen.isPending || isScreeningLive}
      >
        {isScreeningLive ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        {isScreeningLive ? "Screening…" : "Re-run screening"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => cancelPipeline.mutate()}
        disabled={cancelPipeline.isPending}
        className="border-red-200 text-red-700 hover:bg-red-50"
      >
        <X className="h-4 w-4 mr-2" />
        Cancel pipeline
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <StageNav surface="admin" />

      {row ? (
        <ScreeningDetailHeader
          row={row}
          backTo="/admin/screening"
          extraActions={extraActions}
        />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              to="/admin/screening"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to Screening queue
            </Link>
            <h1 className="text-2xl font-semibold mt-1">
              {startup?.name ?? "Screening pipeline"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              No screening_decision yet — pipeline view only.
            </p>
          </div>
          <div className="flex items-center gap-2">{extraActions}</div>
        </div>
      )}

      {isScreeningLive && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm text-primary">
          <Radio className="h-4 w-4 animate-pulse" />
          <span className="font-medium">Screening in progress</span>
          <span className="text-primary/70">— lenses are running, results will appear automatically</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-fit">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline Live</TabsTrigger>
          <TabsTrigger value="data-room">Data Room</TabsTrigger>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          {row ? (
            <ScreeningDetailBody row={row} screeningOutput={screeningOutput.data} />
          ) : (
            <div className="rounded-md border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
              No screening details available for this startup yet. The
              Pipeline Live tab still shows live phase progress.
            </div>
          )}
        </TabsContent>

        <TabsContent value="pipeline" className="mt-6">
          <AdminPipelineLivePanel
            startupId={id}
            startupStatus={startup?.status ?? "unknown"}
            phaseFilter={DS_PHASES}
            title="Screening Pipeline Live"
            onCancelPipeline={() => cancelPipeline.mutate()}
          />
        </TabsContent>

        <TabsContent value="data-room" className="mt-6">
          <DataRoomPanel
            startupId={id}
            role="admin"
            allowUpload={true}
            allowCategoryEdit={true}
            onUploadComplete={() => rescreen.mutate()}
          />
        </TabsContent>

        <TabsContent value="edit" className="mt-6">
          <AdminEditTab
            startup={{
              id,
              name: row?.companyName ?? startup?.name ?? "",
              website: row?.website ?? undefined,
              description: row?.description ?? undefined,
              industry: row?.industry ?? undefined,
              stage: row?.stage ?? undefined,
              location: row?.location ?? undefined,
            } as Startup}
          />
        </TabsContent>

        <TabsContent value="events" className="mt-6">
          <DealActivityTimeline startupId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
