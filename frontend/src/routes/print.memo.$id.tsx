import { createFileRoute } from "@tanstack/react-router";
import { PrintMemo } from "@/components/print/PrintMemo";
import {
  useStartupControllerFindApprovedById,
  useStartupControllerFindOne,
  useStartupControllerGetEvaluation,
} from "@/api/generated/startups/startups";
import { useInvestorControllerGetEffectiveWeights } from "@/api/generated/investor/investor";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";
import type { ScoringWeights } from "@/lib/score-utils";

export const Route = createFileRoute("/print/memo/$id")({
  component: PrintMemoRoute,
});

function unwrap<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data !== undefined
  ) {
    return (payload as Record<string, unknown>).data as T;
  }
  return payload as T;
}

function PrintMemoRoute() {
  const { id } = Route.useParams();
  const { data: ownStartupRes, isLoading: l1 } = useStartupControllerFindOne(id, {
    query: { retry: false },
  });
  const { data: approvedStartupRes, isLoading: l2 } =
    useStartupControllerFindApprovedById(id, { query: { retry: false } });
  const { data: evalRes, isLoading: l3 } = useStartupControllerGetEvaluation(id);

  const startup = ownStartupRes
    ? unwrap<Startup & { evaluation?: Evaluation }>(ownStartupRes)
    : approvedStartupRes
      ? unwrap<Startup & { evaluation?: Evaluation }>(approvedStartupRes)
      : undefined;

  const stage = typeof startup?.stage === "string" ? startup.stage : "";
  const { data: weightsRes, isLoading: l4 } = useInvestorControllerGetEffectiveWeights(
    stage,
    { query: { enabled: Boolean(stage), retry: false } },
  );
  const weights = weightsRes ? unwrap<ScoringWeights | null>(weightsRes) : null;

  const evaluation = evalRes
    ? unwrap<Evaluation>(evalRes)
    : startup?.evaluation;

  const loading = l1 || l2 || l3 || (Boolean(stage) && l4);
  const ready = !loading && Boolean(startup) && Boolean(evaluation);

  if (!ready) {
    return (
      <div style={{ padding: "40px", fontFamily: "DM Sans, sans-serif", color: "#475569" }}>
        Preparing memo...
      </div>
    );
  }

  return (
    <PrintMemo
      startup={startup as Startup}
      evaluation={evaluation as Evaluation}
      weights={weights}
      ready
    />
  );
}
