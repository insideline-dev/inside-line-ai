import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { customFetch } from "@/api/client";

export const Route = createFileRoute("/_protected/admin/config")({
  component: ConfigPage,
});

type SystemConfig = {
  featureFlags: Record<string, boolean>;
};

function ConfigPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "config"],
    queryFn: () => customFetch<SystemConfig>("/admin/config"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">System Configuration</h1>
          <p className="text-muted-foreground text-pretty">
            View feature flags and system-level settings.
          </p>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive text-pretty">
          Failed to load configuration: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const flags = data?.featureFlags ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">System Configuration</h1>
        <p className="text-muted-foreground text-pretty">
          View feature flags and system-level settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Feature Flags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(flags).map(([key, enabled]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium capitalize text-pretty">
                  {key.replace(/_/g, " ")}
                </div>
                <div className="text-sm text-muted-foreground text-pretty">
                  {enabled ? "Enabled" : "Disabled"}
                </div>
              </div>
              <Switch checked={enabled} disabled aria-label={`${key} flag`} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
