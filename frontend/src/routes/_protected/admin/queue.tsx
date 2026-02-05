import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/DataTable";
import { customFetch } from "@/api/client";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_protected/admin/queue")({
  component: QueuePage,
});

type QueueRow = {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

type QueueStatus = {
  queues: QueueRow[];
  totalPending: number;
  totalActive: number;
  totalFailed: number;
};

function QueuePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "queue"],
    queryFn: () => customFetch<QueueStatus>("/admin/queue/status"),
  });
  const queues = data?.queues ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Job Queue</h1>
          <p className="text-muted-foreground text-pretty">
            Monitor background processing across queues.
          </p>
        </div>
        <Card>
          <CardContent className="py-10">
            <Skeleton className="h-6 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive text-pretty">
          Failed to load queue status: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Job Queue</h1>
        <p className="text-muted-foreground text-pretty">
          Monitor background processing across queues.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground text-balance">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {data?.totalPending ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground text-balance">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {data?.totalActive ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground text-balance">
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {data?.totalFailed ?? 0}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Queues</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={queues}
            columns={[
              { header: "Queue", accessor: "name" },
              { header: "Waiting", accessor: "waiting", numeric: true },
              { header: "Active", accessor: "active", numeric: true },
              { header: "Completed", accessor: "completed", numeric: true },
              { header: "Failed", accessor: "failed", numeric: true },
              { header: "Delayed", accessor: "delayed", numeric: true },
            ]}
            rowKey={(row) => row.name}
          />
        </CardContent>
      </Card>
    </div>
  );
}
