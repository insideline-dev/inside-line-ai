import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useStartupControllerFindAll } from "@/api/generated/startup/startup";
import { env } from "@/env";

export const Route = createFileRoute("/_protected/founder/investor-interest")({
  component: InvestorInterestPage,
});

type StartupItem = { id: string; name: string };

type Interest = {
  id: string;
  investorId: string;
  investorName?: string | null;
  status: "interested" | "passed" | "meeting_scheduled";
  notes?: string | null;
};

async function fetchInterests(startupId: string) {
  const response = await fetch(
    `${env.VITE_API_BASE_URL}/startups/${startupId}/interest`,
    { credentials: "include" },
  );
  if (!response.ok) {
    throw new Error("Failed to load investor interest");
  }
  return response.json();
}

async function respondToInterest(
  startupId: string,
  interestId: string,
  response: "meeting_scheduled" | "passed",
) {
  const res = await fetch(
    `${env.VITE_API_BASE_URL}/startups/${startupId}/interest/${interestId}/respond`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ response }),
    },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || "Failed to update interest");
  }
  return res.json();
}

function InvestorInterestPage() {
  const queryClient = useQueryClient();
  const { data: response, isLoading, error } = useStartupControllerFindAll();
  const startups = (response?.data as StartupItem[] | undefined) ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeStartupId = useMemo(
    () => selectedId ?? startups[0]?.id ?? null,
    [selectedId, startups],
  );

  const { data: interests, isLoading: loadingInterests } = useQuery({
    queryKey: ["founder", "interest", activeStartupId],
    queryFn: () => fetchInterests(activeStartupId!),
    enabled: !!activeStartupId,
  });

  const respondMutation = useMutation({
    mutationFn: (variables: { interestId: string; response: "meeting_scheduled" | "passed" }) =>
      respondToInterest(activeStartupId!, variables.interestId, variables.response),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["founder", "interest", activeStartupId],
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-balance">Investor Interest</h1>
          <p className="text-muted-foreground text-pretty">
            Review investor interest in your startup.
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
          Submit a startup to view investor interest.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Investor Interest</h1>
        <p className="text-muted-foreground text-pretty">
          Review investor interest in your startup.
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
          <CardTitle className="text-base text-balance">Interested Investors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingInterests ? (
            <Skeleton className="h-20 w-full" />
          ) : (interests as Interest[] | undefined)?.length ? (
            (interests as Interest[]).map((interest) => (
              <div
                key={interest.id}
                className="flex flex-col gap-3 rounded-lg border p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-pretty">
                      {interest.investorName ?? "Unknown Investor"}
                    </div>
                    <div className="text-sm text-muted-foreground text-pretty">
                      {interest.notes || "No notes provided"}
                    </div>
                  </div>
                  <Badge variant="secondary">{interest.status.replace(/_/g, " ")}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() =>
                      respondMutation.mutate({
                        interestId: interest.id,
                        response: "meeting_scheduled",
                      })
                    }
                  >
                    Accept Meeting
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      respondMutation.mutate({
                        interestId: interest.id,
                        response: "passed",
                      })
                    }
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-pretty">
              No investor interest yet.
            </p>
          )}
          {respondMutation.error && (
            <p className="text-sm text-destructive text-pretty">
              {(respondMutation.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
