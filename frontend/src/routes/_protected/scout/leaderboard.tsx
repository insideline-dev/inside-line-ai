import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/DataTable";
import { useScoutControllerGetLeaderboard } from "@/api/generated/scout/scout";
import type { ScoutLeaderboardResponseDtoItem } from "@/api/generated/model";

export const Route = createFileRoute("/_protected/scout/leaderboard")({
  component: LeaderboardPage,
});

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function LeaderboardPage() {
  const { data, isLoading, error } = useScoutControllerGetLeaderboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Scout Leaderboard</h1>
          <p className="text-muted-foreground text-pretty">
            See top-performing scouts this month.
          </p>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive text-pretty">
          Failed to load leaderboard: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const rows = (data?.data ?? []) as ScoutLeaderboardResponseDtoItem[];
  const rankedRows = rows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Scout Leaderboard</h1>
        <p className="text-muted-foreground text-pretty">
          See top-performing scouts this month.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={rankedRows}
            columns={[
              { header: "Rank", accessor: "rank", numeric: true },
              { header: "Scout", accessor: "name" },
              { header: "Submissions", accessor: "submissions", numeric: true },
              { header: "Conversions", accessor: "conversions", numeric: true },
              {
                header: "Earnings",
                cell: (row) => formatCurrency(row.earnings),
                numeric: true,
              },
            ]}
            rowKey={(row) => row.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
