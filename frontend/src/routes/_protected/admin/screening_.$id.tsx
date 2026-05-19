import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, RefreshCw, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customFetch } from "@/api/client";
import { StageNav } from "@/components/investor/StageNav";
import { AdminPipelineLivePanel } from "@/components/startup-view/AdminPipelineLivePanel";
import {
  ScreeningDetailBody,
  ScreeningDetailHeader,
} from "@/components/investor/ScreeningDetail";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStartupControllerFindOne } from "@/api/generated/startups/startups";
import type { ScreeningRow } from "@/components/investor/screening-types";
import { useScreeningOutput } from "@/lib/screening/useScreeningOutput";

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

  const { data: startupRes, isLoading: startupLoading } =
    useStartupControllerFindOne(id, { query: { retry: false } });
  const startup = unwrap<{ name?: string; status?: string }>(startupRes);

  const rescreen = useMutation({
    mutationFn: () =>
      customFetch<{ ok: boolean }>(
        `/investor/screening/${id}/rescreen-dev`,
        { method: "POST" },
      ),
    onSuccess: () => {
      toast.success("Re-screening triggered");
      qc.invalidateQueries({ queryKey: ["startup-realtime-progress", id] });
      qc.invalidateQueries({ queryKey: ["admin", "screening"] });
    },
    onError: (err) =>
      toast.error("Re-screen failed", { description: (err as Error).message }),
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
      <Button
        variant="outline"
        size="sm"
        onClick={() => rescreen.mutate()}
        disabled={rescreen.isPending}
      >
        {rescreen.isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        Re-run screening
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

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList className="w-fit">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline Live</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-0">
          {row ? (
            <ScreeningDetailBody row={row} screeningOutput={screeningOutput.data} />
          ) : (
            <div className="rounded-md border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
              No screening details available for this startup yet. The
              Pipeline Live tab still shows live phase progress.
            </div>
          )}
        </TabsContent>

        <TabsContent value="pipeline" className="mt-0">
          <AdminPipelineLivePanel
            startupId={id}
            startupStatus={startup?.status ?? "unknown"}
            phaseFilter={DS_PHASES}
            title="Screening Pipeline Live"
            onCancelPipeline={() => cancelPipeline.mutate()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
