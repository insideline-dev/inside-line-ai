import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import {
  useScoutControllerGetCommissions,
  useScoutControllerGetTotalEarnings,
} from "@/api/generated/scout/scout";
import type { ScoutCommissionsResponseDtoItem } from "@/api/generated/model";

export const Route = createFileRoute("/_protected/scout/commissions")({
  component: CommissionsPage,
});

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function CommissionsPage() {
  const {
    data: commissionsResponse,
    isLoading: loadingCommissions,
    error,
  } = useScoutControllerGetCommissions();
  const { data: totalsResponse } = useScoutControllerGetTotalEarnings();

  if (loadingCommissions) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Commission Tracking</h1>
          <p className="text-muted-foreground text-pretty">
            Review earnings and payout status.
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
          Failed to load commissions: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const rows = (commissionsResponse?.data ?? []) as ScoutCommissionsResponseDtoItem[];
  const totals = totalsResponse?.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Commission Tracking</h1>
        <p className="text-muted-foreground text-pretty">
          Review earnings and payout status.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground text-balance">
              Total Earned
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {formatCurrency(totals?.total ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground text-balance">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums text-amber-600">
            {formatCurrency(totals?.pending ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground text-balance">
              Paid
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums text-emerald-600">
            {formatCurrency(totals?.paid ?? 0)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Commission History</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={rows}
            columns={[
              {
                header: "Deal Size",
                cell: (row) => formatCurrency(row.dealSize),
                numeric: true,
              },
              {
                header: "Rate",
                cell: (row) => `${row.commissionRate / 100}%`,
                numeric: true,
              },
              {
                header: "Commission",
                cell: (row) => formatCurrency(row.commissionAmount),
                numeric: true,
              },
              {
                header: "Status",
                cell: (row) => (
                  <Badge variant={row.status === "paid" ? "default" : "secondary"}>
                    {row.status}
                  </Badge>
                ),
              },
              {
                header: "Created",
                cell: (row) => new Date(row.createdAt).toLocaleDateString(),
              },
            ]}
            rowKey={(row) => row.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
