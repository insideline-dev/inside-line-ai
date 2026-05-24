import type { Startup } from "@/types/startup";
import type {
  ScreeningHandoffEvidenceV1,
  ScreeningOutputV1,
} from "@/lib/screening/useScreeningOutput";
import { PrintLayout } from "./PrintLayout";
import insideLineLogo from "@/assets/icon-insideline.svg";

interface PrintScreeningProps {
  startup: Startup;
  output: ScreeningOutputV1;
  ready: boolean;
  generatedBy?: string | null;
}

interface PrintableLens {
  key: string;
  label: string;
  score: number;
  signal: ScreeningOutputV1["overall"]["signal"];
  rationale?: string;
}

interface ThesisFitPrintSummary {
  score: number;
  label: string;
  rationale?: string;
}

const SIGNAL_TONES: Record<
  ScreeningOutputV1["overall"]["signal"],
  { label: string; bg: string; fg: string; border: string }
> = {
  advance: {
    label: "Advance",
    bg: "#ECFDF5",
    fg: "#065F46",
    border: "#10B981",
  },
  review: {
    label: "Review",
    bg: "#FFFBEB",
    fg: "#92400E",
    border: "#F59E0B",
  },
  reject: {
    label: "Reject",
    bg: "#FEF2F2",
    fg: "#991B1B",
    border: "#F43F5E",
  },
};

const FIT_STATUS_SCORES: Record<string, number> = {
  match: 92,
  borderline: 58,
  mismatch: 24,
};

const MISSING_LABELS: Record<string, string> = {
  deck: "Pitch deck",
  product_description: "Product description",
  team: "Team info",
  deal_terms: "Deal terms",
  website: "Website",
};

const NEXT_ACTION_LABELS: Record<string, string> = {
  continue_evaluation: "Advance to DD handoff",
  manual_review: "Partner review",
  request_materials: "Request materials",
  stop: "Do not advance",
};

function lensName(key: string): string {
  if (key.length === 0) return key;
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]/g, " ");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function nextActionLabel(action: string): string {
  return NEXT_ACTION_LABELS[action] ?? action;
}

function confidenceLabel(confidence: ScreeningOutputV1["overall"]["confidence"]): string {
  if (!confidence) return "Confidence n/a";
  return `${confidence.charAt(0).toUpperCase()}${confidence.slice(1)} confidence`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getPrintableLenses(output: ScreeningOutputV1): PrintableLens[] {
  const v2Scores = output.lensScores ?? [];
  if (v2Scores.length > 0) {
    const v1ByKey = new Map(output.lenses.map((lens) => [lens.key, lens]));
    return v2Scores.map((lens) => ({
      key: lens.key,
      label: lensName(lens.key),
      score: clampScore(lens.score),
      signal: lens.signal,
      rationale: lens.rationale ?? v1ByKey.get(lens.key)?.rationale,
    }));
  }

  return output.lenses.map((lens) => ({
    key: lens.key,
    label: lensName(lens.key),
    score: clampScore(lens.score),
    signal: lens.signal,
    rationale: lens.rationale,
  }));
}

function getThesisFitSummary(output: ScreeningOutputV1): ThesisFitPrintSummary {
  const fit = output.thesisFit;
  if (!isRecord(fit)) {
    return {
      score: clampScore(output.overall.score),
      label: "Screening fit",
    };
  }

  const overall = fit.overall;
  const rationale =
    typeof fit.rationale === "string" ? fit.rationale : undefined;

  if (typeof overall === "number") {
    return { score: clampScore(overall), label: "Thesis fit", rationale };
  }

  if (typeof overall === "string") {
    return {
      score: FIT_STATUS_SCORES[overall] ?? clampScore(output.overall.score),
      label: overall.replace(/_/g, " "),
      rationale,
    };
  }

  if (isRecord(overall)) {
    const score = typeof overall.score === "number" ? overall.score : undefined;
    const status =
      typeof overall.status === "string" ? overall.status : undefined;
    const note = typeof overall.note === "string" ? overall.note : undefined;

    return {
      score: clampScore(
        score ?? (status ? FIT_STATUS_SCORES[status] : output.overall.score),
      ),
      label: status ? status.replace(/_/g, " ") : "Thesis fit",
      rationale: rationale ?? note,
    };
  }

  return {
    score: clampScore(output.overall.score),
    label: "Thesis fit",
    rationale,
  };
}

function getPrintableEvidenceSeeds(
  output: ScreeningOutputV1,
): ScreeningHandoffEvidenceV1[] {
  const handoffSeeds = output.handoff?.evidenceSeeds;
  if (handoffSeeds) {
    const seen = new Set<string>();
    return handoffSeeds.filter((seed) => {
      if (seen.has(seed.lensKey)) return false;
      seen.add(seed.lensKey);
      return true;
    });
  }

  const rows: ScreeningHandoffEvidenceV1[] = [];
  for (const lens of output.lenses) {
    const evidence = lens.evidence[0];
    if (!evidence) continue;

    rows.push({
      lensKey: lens.key,
      lensLabel: lensName(lens.key),
      claim: evidence.claim,
      source: evidence.source,
      confidence: evidence.confidence,
      lensScore: lens.score,
      signal: lens.signal,
    });
  }

  return rows;
}

function getDealbreakerFlags(
  output: ScreeningOutputV1,
  lenses: PrintableLens[],
): string[] {
  const issues = output.handoff?.openIssues ?? [];
  if (issues.length > 0) {
    return issues.map((issue) => issue.label || issue.summary).slice(0, 4);
  }

  if (output.overall.signal === "reject") {
    const weakestLens = [...lenses].sort((a, b) => a.score - b.score)[0];
    return weakestLens
      ? [`${weakestLens.label} weakness: ${weakestLens.score}/100`]
      : ["Screening signal recommends stopping before DD"];
  }

  return [];
}

function getVerdictReasoning(
  output: ScreeningOutputV1,
  lenses: PrintableLens[],
): string {
  const keyEvidence = getPrintableEvidenceSeeds(output)[0]?.claim;
  const weakestLens = [...lenses].sort((a, b) => a.score - b.score)[0];

  if (keyEvidence && weakestLens) {
    return `Key evidence: ${keyEvidence} Main watchpoint: ${weakestLens.label.toLowerCase()} scored ${weakestLens.score}/100.`;
  }

  if (weakestLens?.rationale) return weakestLens.rationale;

  return `Screening recommends ${nextActionLabel(output.overall.nextAction).toLowerCase()} based on the current ${output.overall.score}/100 score.`;
}

function scoreCircleStyle(color: string): React.CSSProperties {
  return {
    width: "86px",
    height: "86px",
    borderRadius: "999px",
    border: `7px solid ${color}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    background: "#FFFFFF",
    boxShadow: "inset 0 0 0 1px #E2E8F0",
  };
}

function ScoreCircle({
  label,
  score,
  color,
}: {
  label: string;
  score: number;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "7px",
      }}
    >
      <div style={scoreCircleStyle(color)}>
        <span
          style={{
            fontFamily: "Instrument Serif, serif",
            fontSize: "30px",
            lineHeight: 1,
            color: "#0A1017",
          }}
        >
          {score}
        </span>
        <span style={{ fontSize: "8px", color: "#64748B" }}>/100</span>
      </div>
      <span
        style={{
          fontSize: "9px",
          color: "#475569",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function LensRankList({
  title,
  lenses,
}: {
  title: string;
  lenses: PrintableLens[];
}) {
  return (
    <div style={{ flex: 1 }}>
      <h3
        style={{
          margin: "0 0 7px 0",
          fontSize: "10px",
          color: "#475569",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {lenses.map((lens) => {
          const lensTone = SIGNAL_TONES[lens.signal];
          return (
            <div
              key={`${title}-${lens.key}`}
              style={{
                border: "1px solid #E2E8F0",
                background: "#FFFAF7",
                padding: "7px 9px",
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#0A1017",
                  }}
                >
                  {lens.label}
                </div>
                {lens.rationale ? (
                  <div
                    style={{
                      marginTop: "2px",
                      fontSize: "9px",
                      lineHeight: 1.3,
                      color: "#475569",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {lens.rationale}
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  color: lensTone.fg,
                  fontSize: "16px",
                  fontWeight: 800,
                }}
              >
                {lens.score}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PrintScreening({
  startup,
  output,
  ready,
  generatedBy,
}: PrintScreeningProps) {
  const tone = SIGNAL_TONES[output.overall.signal];
  const lenses = getPrintableLenses(output);
  const rankedLenses = [...lenses].sort((a, b) => b.score - a.score);
  const topLenses = rankedLenses.slice(0, 3);
  const bottomLenses = [...rankedLenses]
    .reverse()
    .filter((lens) => !topLenses.some((topLens) => topLens.key === lens.key))
    .slice(0, 3);
  const thesisFit = getThesisFitSummary(output);
  const dealbreakers = getDealbreakerFlags(output, lenses);
  const evidenceSeeds = getPrintableEvidenceSeeds(output).slice(0, 3);
  const verdictReasoning = getVerdictReasoning(output, lenses);

  return (
    <PrintLayout ready={ready}>
      <section
        style={{
          fontFamily: "DM Sans, sans-serif",
          color: "#0A1017",
          padding: "0",
          background: "#FFFFFF",
          width: "100%",
          maxWidth: "210mm",
          minHeight: "267mm",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "15px",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #D9E2EA",
            paddingBottom: "11px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <img
              src={insideLineLogo}
              alt="Inside Line"
              style={{ width: "20px", height: "20px" }}
            />
            <span
              style={{
                fontFamily: "Instrument Serif, serif",
                fontSize: "17px",
                fontWeight: 400,
                color: "#0A1017",
              }}
            >
              Inside Line · Screening Report
            </span>
          </div>
          <span style={{ fontSize: "10px", color: "#64748B" }}>
            {formatDate(output.generatedAt)}
            {generatedBy ? ` · ${generatedBy}` : ""}
          </span>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 205px",
            gap: "22px",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                padding: "5px 10px",
                background: tone.bg,
                color: tone.fg,
                border: `1px solid ${tone.border}`,
                fontSize: "10px",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {tone.label} · {nextActionLabel(output.overall.nextAction)}
            </div>
            <h1
              style={{
                fontFamily: "Instrument Serif, serif",
                fontSize: "32px",
                fontWeight: 400,
                lineHeight: 1.04,
                margin: "10px 0 5px 0",
                color: "#0A1017",
              }}
            >
              {startup.name}
            </h1>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "7px",
                fontSize: "11px",
                color: "#475569",
              }}
            >
              {startup.industry ? <span>{startup.industry}</span> : null}
              {startup.stage ? (
                <span>· {startup.stage.replace(/_/g, " ")}</span>
              ) : null}
              {startup.location ? <span>· {startup.location}</span> : null}
            </div>
            {startup.description ? (
              <p
                style={{
                  margin: "9px 0 0 0",
                  fontSize: "10.5px",
                  lineHeight: 1.45,
                  color: "#334155",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {startup.description}
              </p>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <ScoreCircle
              label={confidenceLabel(output.overall.confidence)}
              score={clampScore(output.overall.score)}
              color={tone.border}
            />
            <ScoreCircle
              label={thesisFit.label}
              score={thesisFit.score}
              color="#163F67"
            />
          </div>
        </div>

        <section
          style={{
            border: "1px solid #D9E2EA",
            background: "#FFFAF7",
            padding: "12px 14px",
            display: "grid",
            gridTemplateColumns: "1.25fr 0.75fr",
            gap: "16px",
          }}
        >
          <div>
            <h2
              style={{
                margin: "0 0 5px 0",
                fontSize: "10px",
                fontWeight: 800,
                color: "#163F67",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Verdict + reasoning
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "11px",
                lineHeight: 1.45,
                color: "#334155",
              }}
            >
              {verdictReasoning}
            </p>
            {thesisFit.rationale ? (
              <p
                style={{
                  margin: "6px 0 0 0",
                  fontSize: "10px",
                  lineHeight: 1.35,
                  color: "#475569",
                }}
              >
                Thesis fit: {thesisFit.rationale}
              </p>
            ) : null}
          </div>
          <div>
            <h2
              style={{
                margin: "0 0 5px 0",
                fontSize: "10px",
                fontWeight: 800,
                color: "#163F67",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Handoff recommendation
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "11px",
                lineHeight: 1.4,
                color: "#334155",
              }}
            >
              {nextActionLabel(output.overall.nextAction)}
              {output.overall.missingMaterials.length > 0
                ? ` after collecting ${output.overall.missingMaterials.map((code) => MISSING_LABELS[code] ?? code).join(", ")}.`
                : "."}
            </p>
          </div>
        </section>

        <section style={{ display: "flex", gap: "12px" }}>
          <LensRankList title="Top 3 lenses" lenses={topLenses} />
          <LensRankList title="Bottom 3 lenses" lenses={bottomLenses} />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
        >
          <div>
            <h2
              style={{
                margin: "0 0 7px 0",
                fontSize: "10px",
                fontWeight: 800,
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Dealbreaker flags
            </h2>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              {dealbreakers.length > 0 ? (
                dealbreakers.map((flag) => (
                  <div
                    key={flag}
                    style={{
                      border: "1px solid #FCA5A5",
                      background: "#FEF2F2",
                      color: "#991B1B",
                      padding: "7px 9px",
                      fontSize: "10px",
                      lineHeight: 1.35,
                      fontWeight: 700,
                    }}
                  >
                    {flag}
                  </div>
                ))
              ) : (
                <div
                  style={{
                    border: "1px solid #BBF7D0",
                    background: "#F0FDF4",
                    color: "#166534",
                    padding: "7px 9px",
                    fontSize: "10px",
                    lineHeight: 1.35,
                    fontWeight: 700,
                  }}
                >
                  No hard dealbreaker surfaced in screening.
                </div>
              )}
            </div>
          </div>

          <div>
            <h2
              style={{
                margin: "0 0 7px 0",
                fontSize: "10px",
                fontWeight: 800,
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Key evidence seeds
            </h2>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              {evidenceSeeds.map((evidence) => (
                <div
                  key={`${evidence.lensKey}-claim`}
                  style={{
                    borderLeft: "3px solid #163F67",
                    padding: "0 0 0 8px",
                    fontSize: "10px",
                    lineHeight: 1.35,
                    color: "#334155",
                  }}
                >
                  <strong style={{ color: "#0A1017" }}>
                    {evidence.lensLabel}:{" "}
                  </strong>
                  {evidence.claim}
                  {evidence.source ? (
                    <span style={{ color: "#94A3B8" }}>
                      {" "}
                      ({evidence.source})
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer
          style={{
            marginTop: "auto",
            paddingTop: "10px",
            borderTop: "1px solid #D9E2EA",
            fontSize: "9px",
            color: "#94A3B8",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>
            Screening output v{output.version} · pipeline run{" "}
            {output.pipelineRunId ?? "—"}
          </span>
          <span>
            This is a thin screening artifact. Not investment advice. Not DD.
          </span>
        </footer>
      </section>
    </PrintLayout>
  );
}
