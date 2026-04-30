import { createFileRoute } from "@tanstack/react-router";
import { PrintScreening } from "@/components/print/PrintScreening";
import {
  useStartupControllerFindApprovedById,
  useStartupControllerFindOne,
} from "@/api/generated/startups/startups";
import { useScreeningOutput } from "@/lib/screening/useScreeningOutput";
import { useCurrentUser } from "@/lib/auth/hooks";
import type { Startup } from "@/types/startup";

export const Route = createFileRoute("/print/screening/$id")({
  component: PrintScreeningRoute,
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

function PrintScreeningRoute() {
  const { id } = Route.useParams();
  const { data: ownStartupRes, isLoading: l1 } = useStartupControllerFindOne(id, {
    query: { retry: false },
  });
  const { data: approvedStartupRes, isLoading: l2 } =
    useStartupControllerFindApprovedById(id, { query: { retry: false } });

  const { data: currentUser } = useCurrentUser();
  const { data: output, isLoading: l3 } = useScreeningOutput(id);

  const startup = ownStartupRes
    ? unwrap<Startup>(ownStartupRes)
    : approvedStartupRes
      ? unwrap<Startup>(approvedStartupRes)
      : undefined;

  const loading = l1 || l2 || l3;
  const ready = !loading && Boolean(startup) && Boolean(output);

  if (!ready || !startup || !output) {
    return (
      <div
        style={{
          padding: "40px",
          fontFamily: "DM Sans, sans-serif",
          color: "#475569",
        }}
      >
        {loading ? "Preparing screening report..." : "No screening output yet."}
      </div>
    );
  }

  return (
    <PrintScreening
      startup={startup}
      output={output}
      ready
      generatedBy={currentUser?.name ?? currentUser?.email ?? null}
    />
  );
}
