import { useQueryClient } from "@tanstack/react-query";
import {
  getStartupControllerGetOpenQuestionsQueryKey,
  useStartupControllerGetOpenQuestions,
  useStartupControllerUpdateOpenQuestion,
} from "@/api/generated/startups/startups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, CircleHelp } from "lucide-react";

export interface OpenQuestionRow {
  id: string;
  startupId: string;
  key: string;
  label: string;
  summary: string;
  seedSource: "screening_seed" | "manual";
  screeningSource?: "screening-output" | "triage-decision" | null;
  status: "open" | "resolved" | "dismissed";
  ownerUserId?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

function unwrapList(payload: unknown): OpenQuestionRow[] {
  if (Array.isArray(payload)) return payload as OpenQuestionRow[];
  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>)
  ) {
    const data = (payload as { data: unknown }).data;
    return Array.isArray(data) ? (data as OpenQuestionRow[]) : [];
  }
  return [];
}

interface OpenQuestionsLedgerProps {
  startupId: string;
}

/** DS (screening) work surface — follow-ups before advancing to DD. */
export function OpenQuestionsLedger({ startupId }: OpenQuestionsLedgerProps) {
  const queryClient = useQueryClient();
  const queryKey = getStartupControllerGetOpenQuestionsQueryKey(startupId);

  const { data, isLoading, error } = useStartupControllerGetOpenQuestions(
    startupId,
  );

  const resolveMutation = useStartupControllerUpdateOpenQuestion({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
      },
    },
  });

  const questions = unwrapList(data);
  const openCount = questions.filter((q) => q.status === "open").length;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Could not load open questions.
        </CardContent>
      </Card>
    );
  }

  return (
    <section
      className="flex flex-col gap-4"
      data-testid="open-questions-ledger"
    >
      <div className="flex items-center gap-2">
        <CircleHelp className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Open questions
        </h3>
        <Badge variant="secondary">{openCount} open</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Seeded from screening when materials or lens signals need follow-up before
        you advance this deal to Due Diligence.
      </p>

      {questions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No open questions yet. They appear after screening runs on this deal.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <Card key={q.id} data-testid={`open-question-${q.key}`}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base font-medium">{q.label}</CardTitle>
                  <div className="flex items-center gap-2">
                    {q.seedSource === "screening_seed" && (
                      <Badge variant="outline" className="text-xs">
                        screening seed
                      </Badge>
                    )}
                    <Badge
                      variant={q.status === "open" ? "default" : "secondary"}
                      className="text-xs capitalize"
                    >
                      {q.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <p className="text-sm text-muted-foreground">{q.summary}</p>
                {q.status === "open" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolveMutation.isPending}
                    onClick={() =>
                      resolveMutation.mutate({
                        id: startupId,
                        questionId: q.id,
                        data: { status: "resolved" },
                      })
                    }
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Mark resolved
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
