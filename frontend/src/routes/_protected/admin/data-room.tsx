import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { customFetch } from "@/api/client";
import { ChevronRight, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_protected/admin/data-room")({
  component: AdminDataRoomPage,
});

type StartupItem = {
  id: string;
  name: string;
  logoUrl?: string | null;
  website?: string | null;
  stage?: string | null;
  industry?: string | null;
  status?: string | null;
};

function formatLabel(value?: string | null) {
  if (!value) return null;
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function StartupSelectorCard({ startup }: { startup: StartupItem }) {
  return (
    <Link
      to="/admin/startup/$id"
      params={{ id: startup.id }}
      search={{ tab: "data-room", from: "data-room" }}
      className="block"
    >
      <Card className="h-full transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <Avatar className="h-12 w-12 shrink-0 rounded-xl border bg-background">
                {startup.logoUrl ? (
                  <AvatarImage
                    src={startup.logoUrl}
                    alt={startup.name}
                    className="object-contain"
                  />
                ) : null}
                <AvatarFallback className="rounded-xl text-sm font-semibold">
                  {startup.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-base font-semibold">{startup.name}</h3>
                  {startup.website && (
                    <span className="text-muted-foreground">
                      <ExternalLink className="size-3.5" />
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {startup.stage && (
                    <Badge variant="secondary" className="text-[11px]">
                      {formatLabel(startup.stage)}
                    </Badge>
                  )}
                  {startup.industry && (
                    <Badge variant="outline" className="text-[11px]">
                      {formatLabel(startup.industry)}
                    </Badge>
                  )}
                  {startup.status && (
                    <Badge variant="outline" className="text-[11px] capitalize">
                      {formatLabel(startup.status)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          </div>

          <div className="mt-auto pt-1 text-sm text-muted-foreground">
            Open data room
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function AdminDataRoomPage() {
  const {
    data: startups,
    isLoading,
    error,
  } = useQuery<StartupItem[]>({
    queryKey: ["admin", "startups-list"],
    queryFn: async () => {
      const json = await customFetch<{ data?: StartupItem[] }>(
        "/startups?limit=100",
      );
      return ((json as { data?: StartupItem[] }).data ?? json) as StartupItem[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Data Room</h1>
          <p className="text-muted-foreground text-pretty">
            Select a startup to open its dedicated data room.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive text-pretty">
          Failed to load startups: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  if (!startups || startups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-pretty">
          No startups found.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Data Room</h1>
        <p className="text-muted-foreground text-pretty">
          Choose a startup to open its dedicated data room view.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Startups</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {startups.map((startup) => (
              <StartupSelectorCard key={startup.id} startup={startup} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
