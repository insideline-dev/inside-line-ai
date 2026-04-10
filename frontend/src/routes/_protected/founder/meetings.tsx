import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/DataTable";
import { useStartupControllerFindAll } from "@/api/generated/startups/startups";
import { customFetch } from "@/api/client";

export const Route = createFileRoute("/_protected/founder/meetings")({
  component: MeetingsPage,
});

type StartupItem = { id: string; name: string };

type MeetingRow = {
  id: string;
  investorName?: string | null;
  scheduledAt: string;
  duration: number;
  location?: string | null;
  status: string;
};

function MeetingsPage() {
  const queryClient = useQueryClient();
  const { data: response, isLoading, error } = useStartupControllerFindAll();
  const startups = (response?.data as StartupItem[] | undefined) ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeStartupId = useMemo(
    () => selectedId ?? startups[0]?.id ?? null,
    [selectedId, startups],
  );

  const { data: meetings, isLoading: loadingMeetings } = useQuery({
    queryKey: ["founder", "meetings", activeStartupId],
    queryFn: () => customFetch<MeetingRow[]>(`/startups/${activeStartupId}/meetings`),
    enabled: !!activeStartupId,
  });

  const [formState, setFormState] = useState({
    investorId: "",
    scheduledAt: "",
    duration: "30",
    location: "",
    notes: "",
  });

  const scheduleMutation = useMutation({
    mutationFn: () =>
      customFetch(`/startups/${activeStartupId}/meetings`, {
        method: "POST",
        body: JSON.stringify({
          investorId: formState.investorId,
          scheduledAt: formState.scheduledAt,
          duration: Number(formState.duration),
          location: formState.location || undefined,
          notes: formState.notes || undefined,
        }),
      }),
    onSuccess: () => {
      setFormState({
        investorId: "",
        scheduledAt: "",
        duration: "30",
        location: "",
        notes: "",
      });
      queryClient.invalidateQueries({
        queryKey: ["founder", "meetings", activeStartupId],
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Meetings</h1>
          <p className="text-muted-foreground text-pretty">
            Schedule and manage investor meetings.
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
          Failed to load startups: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  if (startups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-pretty">
          Submit a startup to schedule meetings.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Meetings</h1>
        <p className="text-muted-foreground text-pretty">
          Schedule and manage investor meetings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Startup</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={activeStartupId ?? ""}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {startups.map((startup) => (
              <option key={startup.id} value={startup.id}>
                {startup.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Schedule Meeting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-pretty" htmlFor="investor-id">
                Investor ID
              </label>
              <Input
                id="investor-id"
                value={formState.investorId}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, investorId: event.target.value }))
                }
                placeholder="UUID of the investor"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-pretty" htmlFor="scheduled-at">
                Scheduled At
              </label>
              <Input
                id="scheduled-at"
                type="datetime-local"
                value={formState.scheduledAt}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, scheduledAt: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-pretty" htmlFor="duration">
                Duration (minutes)
              </label>
              <Input
                id="duration"
                type="number"
                min={15}
                value={formState.duration}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, duration: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-pretty" htmlFor="location">
                Location
              </label>
              <Input
                id="location"
                value={formState.location}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, location: event.target.value }))
                }
                placeholder="Zoom link or location"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-pretty" htmlFor="notes">
              Notes
            </label>
            <Input
              id="notes"
              value={formState.notes}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, notes: event.target.value }))
              }
              placeholder="Agenda or context"
            />
          </div>

          {scheduleMutation.error && (
            <p className="text-sm text-destructive text-pretty">
              {(scheduleMutation.error as Error).message}
            </p>
          )}
          <Button
            type="button"
            onClick={() => scheduleMutation.mutate()}
            disabled={scheduleMutation.isPending}
          >
            {scheduleMutation.isPending ? "Scheduling..." : "Schedule Meeting"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Upcoming Meetings</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMeetings ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <DataTable
              data={meetings ?? []}
              columns={[
                { header: "Investor", accessor: "investorName" },
                {
                  header: "Date",
                  cell: (row) => new Date(row.scheduledAt).toLocaleString(),
                },
                { header: "Duration", accessor: "duration", numeric: true },
                { header: "Location", accessor: "location" },
                { header: "Status", accessor: "status" },
              ]}
              rowKey={(row) => row.id}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
