import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/DataTable";
import { customFetch } from "@/api/client";

export const Route = createFileRoute("/_protected/investor/portfolio")({
  component: PortfolioPage,
});

type PortfolioItem = {
  id: string;
  startupId: string;
  startupName?: string | null;
  startupIndustry?: string | null;
  startupStage?: string | null;
  dealSize?: number | null;
  dealStage?: string | null;
  investedAt: string;
};

function formatCurrency(value?: number | null) {
  if (!value) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function PortfolioPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["investor", "portfolio"],
    queryFn: () => customFetch<PortfolioItem[]>("/investor/portfolio"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Portfolio Companies</h1>
          <p className="text-muted-foreground text-pretty">
            Track your active investments and deal history.
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
          Failed to load portfolio: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const items = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Portfolio Companies</h1>
        <p className="text-muted-foreground text-pretty">
          Track your active investments and deal history.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={items}
            columns={[
              { header: "Company", accessor: "startupName" },
              { header: "Industry", accessor: "startupIndustry" },
              { header: "Stage", accessor: "startupStage" },
              {
                header: "Deal Size",
                cell: (row) => formatCurrency(row.dealSize),
                numeric: true,
              },
              {
                header: "Invested At",
                cell: (row) =>
                  row.investedAt
                    ? new Date(row.investedAt).toLocaleDateString()
                    : "—",
              },
            ]}
            rowKey={(row) => row.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
