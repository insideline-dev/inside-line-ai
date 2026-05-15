import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StageNav } from "@/components/investor/StageNav";
import { FitChips } from "@/components/investor/FitChips";
import type { ThesisFitOutput } from "@/types/thesis-fit";

export const Route = createFileRoute("/_protected/investor/screening")({
  component: ScreeningPage,
});

type ScreeningVerdict = "review" | "advance" | "reject";

interface ScreeningRow {
  id: string;
  companyName: string;
  verdict: ScreeningVerdict;
  fit: ThesisFitOutput | null;
  submittedAt: string;
  industry?: string | null;
  dealbreakerNote?: string | null;
}

// PLACEHOLDER seed rows so the page renders end-to-end before PR4 wires
// the real screening pipeline to a real endpoint. Rows demonstrate each
// verdict + fit-axis combination including the California/US regression
// case (Acme — geography MATCH despite being labelled California).
const SEED_ROWS: ScreeningRow[] = [
  {
    id: "seed-1",
    companyName: "Acme AI",
    industry: "AI infrastructure",
    verdict: "review",
    submittedAt: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
    fit: {
      geography: { status: "match", note: "California is part of US thesis" },
      stage: { status: "borderline", note: "Pre-seed against seed thesis" },
      sector: { status: "match", note: "AI infra aligned" },
      checkSize: { status: "mismatch", note: "$5M round vs $2M cap" },
      overall: 62,
      rationale:
        "Sector and geography are strong; check size is the blocker.",
    },
  },
  {
    id: "seed-2",
    companyName: "Beta Labs",
    industry: "Devtools",
    verdict: "advance",
    submittedAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    fit: {
      geography: { status: "match", note: "Berlin matches EU thesis" },
      stage: { status: "match", note: "Seed-stage" },
      sector: { status: "match", note: "Devtools aligned" },
      checkSize: { status: "match", note: "$1.5M within range" },
      overall: 88,
      rationale: "Clean fit across all four axes.",
    },
  },
  {
    id: "seed-3",
    companyName: "Delta Co",
    industry: "Climate hardware",
    verdict: "review",
    submittedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    fit: {
      geography: { status: "match", note: "US-based" },
      stage: { status: "match", note: "Seed-stage" },
      sector: { status: "borderline", note: "Hardware adjacent to thesis" },
      checkSize: { status: "match", note: "Within range" },
      overall: 74,
      rationale: "Sector is the open question.",
    },
  },
  {
    id: "seed-4",
    companyName: "Gamma Inc",
    industry: "Crypto",
    verdict: "reject",
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    dealbreakerNote: "Crypto is in dealbreakers",
    fit: {
      geography: { status: "match", note: "US-based" },
      stage: { status: "match", note: "Seed" },
      sector: { status: "mismatch", note: "Crypto dealbreaker triggered" },
      checkSize: { status: "borderline", note: "Range unclear" },
      overall: 18,
      rationale: "Dealbreaker on sector.",
    },
  },
  {
    id: "seed-5",
    companyName: "Epsilon Health",
    industry: "Digital health",
    verdict: "reject",
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    dealbreakerNote: "Stage mismatch (pre-product)",
    fit: {
      geography: { status: "match", note: "US-based" },
      stage: { status: "mismatch", note: "Pre-product vs seed thesis" },
      sector: { status: "borderline", note: "Health-adjacent" },
      checkSize: { status: "borderline", note: "Below floor" },
      overall: 22,
      rationale: "Too early.",
    },
  },
];

function VerdictBadge({ verdict }: { verdict: ScreeningVerdict }) {
  const cfg = {
    review: { label: "REVIEW", className: "bg-amber-100 text-amber-900 hover:bg-amber-100" },
    advance: { label: "ADVANCE", className: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100" },
    reject: { label: "REJECT", className: "bg-red-100 text-red-900 hover:bg-red-100" },
  }[verdict];
  return (
    <Badge variant="secondary" className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}

function ScreeningRowCard({ row }: { row: ScreeningRow }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3 hover:bg-muted/40">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.companyName}</span>
          <VerdictBadge verdict={row.verdict} />
          {row.industry && (
            <span className="text-xs text-muted-foreground">{row.industry}</span>
          )}
        </div>
        <FitChips fit={row.fit} />
        {row.dealbreakerNote && (
          <span className="text-xs text-red-700">{row.dealbreakerNote}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(row.submittedAt), { addSuffix: true })}
        </span>
        {row.verdict === "review" && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled>
              Pass
            </Button>
            <Button size="sm" disabled>
              Advance
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ScreeningPage() {
  const [showRejected, setShowRejected] = useState(false);

  const { activeRows, rejectedRows, counts } = useMemo(() => {
    const active = SEED_ROWS.filter((r) => r.verdict !== "reject");
    const rejected = SEED_ROWS.filter((r) => r.verdict === "reject");
    return {
      activeRows: active,
      rejectedRows: rejected,
      counts: { screening: active.length },
    };
  }, []);

  return (
    <div className="flex flex-col gap-4 p-6">
      <StageNav counts={counts} />

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Deal Screening</h1>
        <span className="text-sm text-muted-foreground">
          First-pass triage — should we spend more time on this?
        </span>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          {activeRows.length === 0 ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Inbox className="h-4 w-4" />
              No deals in screening yet.
            </div>
          ) : (
            activeRows.map((row) => (
              <ScreeningRowCard key={row.id} row={row} />
            ))
          )}
        </CardContent>
      </Card>

      {rejectedRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowRejected((v) => !v)}
            data-testid="toggle-rejected-archive"
          >
            {showRejected ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Show rejected ({rejectedRows.length})
          </button>
          {showRejected && (
            <Card>
              <CardContent className="flex flex-col gap-2 p-4">
                {rejectedRows.map((row) => (
                  <ScreeningRowCard key={row.id} row={row} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>PR6 preview:</strong> rows above are placeholder data so the
        UI ships before the backend screening pipeline (PR4) is wired. PASS /
        ADVANCE buttons are inert; the click-row-to-open-modal flow lands in
        PR7.
      </div>
    </div>
  );
}
