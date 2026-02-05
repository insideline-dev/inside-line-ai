import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { customFetch } from "@/api/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_protected/admin/integrations")({
  component: IntegrationsPage,
});

type IntegrationHealth = {
  status: "healthy" | "not_configured";
  lastChecked: string;
};

type IntegrationsResponse = Record<string, IntegrationHealth>;

function IntegrationsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "integrations"],
    queryFn: () => customFetch<IntegrationsResponse>("/admin/integrations/health"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Integration Health</h1>
          <p className="text-muted-foreground text-pretty">
            Monitor third-party services and platform dependencies.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive text-pretty">
          Failed to load integration health: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const integrations = data ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Integration Health</h1>
        <p className="text-muted-foreground text-pretty">
          Monitor third-party services and platform dependencies.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(integrations).map(([key, health]) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base capitalize text-balance">
                {key.replace(/_/g, " ")}
              </CardTitle>
              <Badge
                className={cn(
                  health.status === "healthy"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800",
                )}
              >
                {health.status.replace(/_/g, " ")}
              </Badge>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground text-pretty">
              Last checked: {new Date(health.lastChecked).toLocaleString()}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
