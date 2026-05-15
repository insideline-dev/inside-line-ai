import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, RefreshCw, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/api/client";
import { StageNav } from "@/components/investor/StageNav";
import { ScreeningPipelineLive } from "@/components/admin/ScreeningPipelineLive";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useStartupControllerFindOne } from "@/api/generated/startups/startups";

// Note: the `_` after `screening` is a TanStack escape — it keeps the URL
// path as /admin/screening/$id but opts the route OUT of nesting under the
// /admin/screening parent (which is a queue page without an <Outlet />).
export const Route = createFileRoute("/_protected/admin/screening_/$id")({
  component: AdminScreeningDetailPage,
});

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
  const { data: startupRes } = useStartupControllerFindOne(id, {
    query: { retry: false },
  });
  const startup = unwrap<{ name?: string }>(startupRes);

  const rescreen = useMutation({
    mutationFn: () =>
      customFetch<{ ok: boolean }>(
        `/investor/screening/${id}/rescreen-dev`,
        { method: "POST" },
      ),
    onSuccess: () => {
      toast.success("Re-screening triggered");
      qc.invalidateQueries({ queryKey: ["startup-realtime-progress", id] });
    },
    onError: (err) =>
      toast.error("Re-screen failed", { description: (err as Error).message }),
  });

  return (
    <div className="flex flex-col gap-4 p-6">
      <StageNav surface="admin" />

      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/admin/screening"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Screening queue
          </Link>
          <h1 className="text-2xl font-semibold mt-1">
            {startup?.name ?? "Screening pipeline"}
          </h1>
        </div>
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
      </div>

      <ScreeningPipelineLive startupId={id} />
    </div>
  );
}
