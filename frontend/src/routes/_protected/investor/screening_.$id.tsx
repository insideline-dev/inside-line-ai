import { useCallback, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { customFetch } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  ScreeningDetailBody,
  ScreeningDetailHeader,
} from "@/components/investor/ScreeningDetail";
import type { ScreeningRow } from "@/components/investor/screening-types";

function fetchScreeningQueue() {
  return customFetch<ScreeningRow[]>("/investor/screening");
}

export const Route = createFileRoute("/_protected/investor/screening_/$id")({
  component: ScreeningDetailPage,
});

function ScreeningDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["investor", "screening"],
    queryFn: fetchScreeningQueue,
    staleTime: 30_000,
  });

  const row = useMemo(() => rows?.find((r) => r.id === id) ?? null, [rows, id]);

  const invalidateAndBack = () => {
    queryClient.invalidateQueries({ queryKey: ["investor", "screening"] });
    queryClient.invalidateQueries({ queryKey: ["investor", "pipeline"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "screening"] });
    queryClient.invalidateQueries({ queryKey: ["startupController"] });
    void navigate({ to: "/investor/screening" });
  };

  const advanceMutation = useMutation({
    mutationFn: (startupId: string) =>
      customFetch<{ ok: boolean; note: string }>(
        `/investor/screening/${startupId}/advance`,
        { method: "POST" },
      ),
    onSuccess: (res) => {
      toast.success("Advanced to Due Diligence", { description: res.note });
      invalidateAndBack();
    },
    onError: (err) =>
      toast.error("Advance failed", { description: (err as Error).message }),
  });

  const passMutation = useMutation({
    mutationFn: (startupId: string) =>
      customFetch<{ ok: boolean }>(`/investor/screening/${startupId}/pass`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Marked as passed — moved to rejected archive.");
      invalidateAndBack();
    },
    onError: (err) =>
      toast.error("Pass failed", { description: (err as Error).message }),
  });

  const handlePass = useCallback(() => {
    if (!row) return;
    passMutation.mutate(row.id);
  }, [row, passMutation]);

  const handleAdvance = useCallback(() => {
    if (!row) return;
    advanceMutation.mutate(row.id);
  }, [row, advanceMutation]);

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

  return (
    <div className="flex flex-col gap-5">
      <ScreeningDetailHeader
        row={row}
        backTo="/investor/screening"
        onPass={handlePass}
        onAdvance={handleAdvance}
        busy={advanceMutation.isPending || passMutation.isPending}
      />
      <ScreeningDetailBody row={row} />
    </div>
  );
}
