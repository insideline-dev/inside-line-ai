import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { customFetch } from "@/api/client";

export const Route = createFileRoute("/_protected/scout/metrics")({
  component: MetricsPage,
});

type Metrics = {
  totalSubmissions: number;
};

function MetricsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["scout", "metrics"],
    queryFn: () => customFetch<Metrics>("/scout/metrics"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Performance Metrics</h1>
          <p className="text-muted-foreground text-pretty">
            Track your scouting performance and activity.
          </p>
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive text-pretty">
          Failed to load metrics: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Performance Metrics</h1>
        <p className="text-muted-foreground text-pretty">
          Track your scouting performance and activity.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground text-balance">
              Total Submissions
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {data?.totalSubmissions ?? 0}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
