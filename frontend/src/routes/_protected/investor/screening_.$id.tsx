import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { customFetch } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getStartupControllerGetOpenQuestionsQueryKey } from "@/api/generated/startups/startups";
import { StageNav } from "@/components/investor/StageNav";
import {
  ScreeningDetailBody,
  ScreeningDetailHeader,
} from "@/components/investor/ScreeningDetail";
import { ScreeningVerdictOverrideDialog } from "@/components/investor/ScreeningVerdictOverrideDialog";
import { ScreeningAdvanceDialog, type AdvanceInput } from "@/components/investor/ScreeningAdvanceDialog";
import { ScreeningPassDialog, type PassInput } from "@/components/investor/ScreeningPassDialog";
import type { ScreeningRow, ScreeningVerdict } from "@/components/investor/screening-types";
import type { InvestmentThesis } from "@/types/investor";
import { findPortfolioConflicts } from "@/lib/screening/portfolio-conflicts";
import type { Startup } from "@/types/startup";
import { useScreeningOutput } from "@/lib/screening/useScreeningOutput";
import { downloadScreening } from "@/lib/pdf/download";
import { DataRoomPanel } from "@/components/startup-view/DataRoomPanel";
import { AdminEditTab } from "@/components/startup-view/AdminEditTab";
import { DealActivityTimeline } from "@/components/startup-view/DealActivityTimeline";
import { useStartupRealtimeProgress } from "@/lib/startup/useStartupRealtimeProgress";

function fetchScreeningQueue() {
  return customFetch<ScreeningRow[]>("/investor/screening");
}

function fetchThesis() {
  return customFetch<InvestmentThesis | null>("/investor/thesis");
}

export const Route = createFileRoute("/_protected/investor/screening_/$id")({
  component: ScreeningDetailPage,
});

function ScreeningDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDownloadingScreening, setIsDownloadingScreening] = useState(false);
  const [showPassDialog, setShowPassDialog] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const {
    data: rows,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["investor", "screening"],
    queryFn: fetchScreeningQueue,
    staleTime: 30_000,
  });

  const { data: thesis } = useQuery({
    queryKey: ["investor", "thesis"],
    queryFn: fetchThesis,
    staleTime: 60_000,
  });

  const row = useMemo(() => rows?.find((r) => r.id === id) ?? null, [rows, id]);
  const screeningOutput = useScreeningOutput(id);
  const [activeTab, setActiveTab] = useState("screening");

  const { progress } = useStartupRealtimeProgress(id, { pollMs: 2000 });
  const screeningStatus = progress?.phases?.screening?.status;
  const prevScreeningStatus = useRef(screeningStatus);
  useEffect(() => {
    if (
      prevScreeningStatus.current &&
      prevScreeningStatus.current !== "completed" &&
      screeningStatus === "completed"
    ) {
      toast.success("Screening complete — results updated");
      setActiveTab("screening");
      queryClient.invalidateQueries({ refetchType: "all" });
    }
    prevScreeningStatus.current = screeningStatus;
  }, [screeningStatus, queryClient, id]);

  const portfolioConflicts = useMemo(() => {
    if (!row || !thesis?.portfolioCompanies?.length) return [];
    // findPortfolioConflicts only reads name/website/description/industry —
    // cast to satisfy the Startup param type without a full object construction.
    const startupLike = {
      name: row.companyName,
      website: row.website ?? undefined,
      description: row.description ?? undefined,
      industry: row.industry ?? undefined,
    } as unknown as Startup;
    return findPortfolioConflicts(startupLike, thesis);
  }, [row, thesis]);

  const invalidateStageQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["investor", "screening"] });
    queryClient.invalidateQueries({ queryKey: ["investor", "pipeline"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "screening"] });
    queryClient.invalidateQueries({ queryKey: ["startupController"] });
    queryClient.invalidateQueries({
      queryKey: getStartupControllerGetOpenQuestionsQueryKey(id),
    });
  };

  const invalidateAndBack = () => {
    invalidateStageQueries();
    void navigate({ to: "/investor/screening" });
  };

  const advanceMutation = useMutation({
    mutationFn: ({
      startupId,
      reasonTags,
      notes,
    }: {
      startupId: string;
      reasonTags?: string[];
      notes?: string;
    }) =>
      customFetch<{ ok: boolean; startupId: string; note: string }>(
        `/investor/screening/${startupId}/advance`,
        {
          method: "POST",
          body: JSON.stringify({ reasonTags, notes }),
        },
      ),
    onSuccess: (res) => {
      toast.success("Advanced to Due Diligence", { description: res.note });
      invalidateStageQueries();
      void navigate({ to: "/investor/startup/$id", params: { id: res.startupId } });
    },
    onError: (err) =>
      toast.error("Advance failed", { description: (err as Error).message }),
  });

  const passMutation = useMutation({
    mutationFn: ({ startupId, reasonTags, notes }: { startupId: string; reasonTags?: string[]; notes?: string }) =>
      customFetch<{ ok: boolean }>(`/investor/screening/${startupId}/pass`, {
        method: "POST",
        body: JSON.stringify({ reasonTags, notes }),
      }),
    onSuccess: () => {
      toast.success("Marked as passed — moved to rejected archive.");
      setShowPassDialog(false);
      invalidateAndBack();
    },
    onError: (err) =>
      toast.error("Pass failed", { description: (err as Error).message }),
  });

  const overrideMutation = useMutation({
    mutationFn: (input: {
      startupId: string;
      targetClassification: ScreeningVerdict;
      reason: string;
      reasonCode?: string;
    }) =>
      customFetch(`/investor/screening/${input.startupId}/override`, {
        method: "POST",
        body: JSON.stringify({
          targetClassification: input.targetClassification,
          reason: input.reason,
          reasonCode: input.reasonCode,
        }),
      }),
    onSuccess: (_res, input) => {
      setOverrideOpen(false);
      toast.success("Screening verdict override saved");
      queryClient.invalidateQueries({ queryKey: ["investor", "screening"] });
      queryClient.invalidateQueries({ queryKey: ["investor", "pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "screening"] });
      queryClient.invalidateQueries({ queryKey: ["startupController"] });
      if (input.targetClassification === "advance") {
        void navigate({ to: "/investor" });
      }
    },
    onError: (err) =>
      toast.error("Override failed", { description: (err as Error).message }),
  });

  const rescreenMutation = useMutation({
    mutationFn: (startupId: string) =>
      customFetch<{ ok: boolean; note: string }>(
        `/investor/screening/${startupId}/rescreen`,
        { method: "POST" },
      ),
    onSuccess: (res) => {
      toast.success("Re-screening queued", { description: res.note });
      queryClient.invalidateQueries({ refetchType: "all" });
    },
    onError: (err) =>
      toast.error("Re-screen failed", { description: (err as Error).message }),
  });

  const handleRescreen = useCallback(() => {
    if (!row) return;
    toast.info("Re-running screening with latest documents…");
    rescreenMutation.mutate(row.id);
  }, [row, rescreenMutation]);

  const handlePass = useCallback(() => {
    setShowPassDialog(true);
  }, []);

  const handleAdvance = useCallback(
    (input: AdvanceInput) => {
      if (!row) return;
      advanceMutation.mutate({
        startupId: row.id,
        reasonTags: input.reasonTags,
        notes: input.notes,
      });
    },
    [row, advanceMutation],
  );

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        Failed to load screening detail: {(error as Error).message}
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <h2 className="text-xl font-semibold">Screening row not found</h2>
        <p className="text-sm text-muted-foreground">
          This deal may have been advanced or rejected.
        </p>
        <Button asChild>
          <Link to="/investor/screening">Back to Screening</Link>
        </Button>
      </div>
    );
  }

  const startupLike = {
    id: row.id,
    name: row.companyName,
    website: row.website ?? undefined,
    description: row.description ?? undefined,
    industry: row.industry ?? undefined,
    stage: row.stage ?? undefined,
    location: row.location ?? undefined,
  } as unknown as Startup;

  return (
    <div className="flex flex-col gap-5">
      <StageNav />
      <ScreeningDetailHeader
        row={row}
        backTo="/investor/screening"
        onPass={handlePass}
        busy={passMutation.isPending}
        extraActions={
          <>
          <ScreeningAdvanceDialog
            disabled={row.verdict !== "review" || advanceMutation.isPending}
            isSubmitting={advanceMutation.isPending}
            onSubmit={handleAdvance}
          />
          <Button variant="outline" onClick={() => setOverrideOpen(true)}>
            Change verdict
          </Button>
          <ScreeningVerdictOverrideDialog
            currentVerdict={row.verdict}
            isSubmitting={overrideMutation.isPending}
            onSubmit={(input) => overrideMutation.mutate({ startupId: id, ...input })}
            open={overrideOpen}
            onOpenChange={setOverrideOpen}
          />
          <Button
            variant="outline"
            onClick={handleDownloadScreening}
            disabled={!screeningOutput.data || isDownloadingScreening}
            title={
              screeningOutput.data
                ? "Download a 1-page screening report you can share"
                : "Run screening first to enable download"
            }
            data-testid="screening-detail-download-screening"
          >
            {isDownloadingScreening ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            Share PDF
          </Button>
          </>
        }
      />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap rounded-xl bg-muted/60 p-2">
          <TabsTrigger value="screening" className="w-full sm:w-auto">Screening</TabsTrigger>
          <TabsTrigger value="data-room" className="w-full sm:w-auto">Data Room</TabsTrigger>
          <TabsTrigger value="edit" className="w-full sm:w-auto">Edit</TabsTrigger>
          <TabsTrigger value="events" className="w-full sm:w-auto">Events</TabsTrigger>
        </TabsList>

        <TabsContent value="screening" className="mt-6">
          <ScreeningDetailBody
            row={row}
            portfolioConflicts={portfolioConflicts}
            screeningOutput={screeningOutput.data}
          />
        </TabsContent>

        <TabsContent value="data-room" className="mt-6">
          <DataRoomPanel
            startupId={id}
            role="investor"
            allowUpload={true}
            allowCategoryEdit={false}
            onUploadComplete={handleRescreen}
          />
        </TabsContent>

        <TabsContent value="edit" className="mt-6">
          <AdminEditTab startup={startupLike} />
        </TabsContent>

        <TabsContent value="events" className="mt-6">
          <DealActivityTimeline startupId={id} />
        </TabsContent>
      </Tabs>

      <ScreeningPassDialog
        open={showPassDialog}
        onOpenChange={setShowPassDialog}
        isSubmitting={passMutation.isPending}
        onSubmit={(input: PassInput) => {
          if (!row) return;
          passMutation.mutate({ startupId: row.id, ...input });
        }}
      />
    </div>
  );
}
