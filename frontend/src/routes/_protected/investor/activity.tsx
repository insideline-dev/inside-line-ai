import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { customFetch } from "@/api/client";
import { History } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatEvent } from "@/components/startup-view/DealActivityTimeline";

export const Route = createFileRoute("/_protected/investor/activity")({
  component: InvestorActivityPage,
});

interface ActivityEvent {
  id: string;
  startupId: string;
  actorUserId?: string | null;
  type: string;
  payload?: Record<string, unknown> | null;
  occurredAt: string;
  startupName: string | null;
}

const TONE_CLASSES: Record<string, string> = {
  default: "border-muted-foreground/30 bg-muted text-muted-foreground",
  good: "border-emerald-500/40 bg-emerald-50 text-emerald-700",
  bad: "border-rose-500/40 bg-rose-50 text-rose-700",
  warn: "border-amber-400/60 bg-amber-50 text-amber-800",
  neutral: "border-sky-400/40 bg-sky-50 text-sky-700",
};

function InvestorActivityPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["investor", "activity"],
    queryFn: () =>
      customFetch<ActivityEvent[]>("/investor/activity?limit=200"),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const events = (Array.isArray(data) ? data : (data as unknown as { data?: ActivityEvent[] })?.data) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Recent events across all your deals
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Timeline
            {events.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                ({events.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="text-sm text-muted-foreground">
              Couldn't load activity.
            </p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity yet. Events will appear here as your deals progress.
            </p>
          ) : (
            <ol className="relative ml-2 space-y-4 border-l border-border pl-4">
              {events.map((event) => {
                const f = formatEvent(event);
                const occurred = new Date(event.occurredAt);
                return (
                  <li key={event.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[1.625rem] top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border bg-background",
                        TONE_CLASSES[f.tone] ?? TONE_CLASSES.default,
                      )}
                    >
                      {f.icon}
                    </span>
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                        <Link
                          to="/investor/startup/$id"
                          params={{ id: event.startupId }}
                          className="font-semibold text-primary hover:underline"
                        >
                          {event.startupName ?? "Unknown startup"}
                        </Link>
                        <span className="font-medium">{f.label}</span>
                        {f.detail && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-normal"
                          >
                            {f.detail}
                          </Badge>
                        )}
                      </div>
                      <time
                        dateTime={event.occurredAt}
                        className="text-[11px] text-muted-foreground"
                        title={format(occurred, "MMM d, yyyy h:mm a")}
                      >
                        {formatDistanceToNow(occurred, { addSuffix: true })}
                      </time>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
