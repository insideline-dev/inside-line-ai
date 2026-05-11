// DS-E10-F4-S1 — single-page screening report for sharing with a
// partner / LP / scout WITHOUT exposing DD internals. Strict rule:
// only the screening surface is rendered here. No memo body, no
// evaluation agent output, no DD evidence graph. Anything we'd be
// uncomfortable handing to a non-investor stays out.
//
// Layout target: A4 portrait, 1 page, headed by the Inside Line brand.

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

const MISSING_LABELS: Record<string, string> = {
  deck: "Pitch deck",
  product_description: "Product description",
  team: "Team info",
  deal_terms: "Deal terms",
  website: "Website",
};

const NEXT_ACTION_LABELS: Record<string, string> = {
  continue_evaluation: "Continue evaluation",
  manual_review: "Manual review",
  request_materials: "Request materials",
  stop: "Stop",
};

function lensName(key: string): string {
  if (key.length === 0) return key;
  return key.charAt(0).toUpperCase() + key.slice(1);
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

export function PrintScreening({
  startup,
  output,
  ready,
  generatedBy,
}: PrintScreeningProps) {
  const tone = SIGNAL_TONES[output.overall.signal];

  return (
    <PrintLayout ready={ready}>
      <section
        style={{
          fontFamily: "DM Sans, sans-serif",
          color: "#0F172A",
          padding: "0",
          background: "#FFFFFF",
          width: "100%",
          maxWidth: "210mm",
          minHeight: "267mm",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #E2E8F0",
            paddingBottom: "12px",
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
                fontSize: "16px",
                fontWeight: 400,
                color: "#0F172A",
              }}
            >
              Inside Line · Screening Report
            </span>
          </div>
          <span style={{ fontSize: "10px", color: "#64748B" }}>
            Generated {formatDate(output.generatedAt)}
            {generatedBy ? ` · by ${generatedBy}` : ""}
          </span>
        </header>

        {/* Title block + verdict */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "24px",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontFamily: "Instrument Serif, serif",
                fontSize: "28px",
                fontWeight: 400,
                lineHeight: 1.1,
                margin: 0,
                color: "#0F172A",
              }}
            >
              {startup.name}
            </h1>
            <div
              style={{
                marginTop: "6px",
                display: "flex",
                gap: "8px",
                fontSize: "11px",
                color: "#475569",
              }}
            >
              {startup.industry ? <span>{startup.industry}</span> : null}
              {startup.industry && startup.stage ? <span>·</span> : null}
              {startup.stage ? <span>{startup.stage.replace(/_/g, " ")}</span> : null}
              {startup.location ? <span>·</span> : null}
              {startup.location ? <span>{startup.location}</span> : null}
            </div>
            {startup.description ? (
              <p
                style={{
                  marginTop: "10px",
                  fontSize: "11px",
                  lineHeight: 1.5,
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
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "6px",
              minWidth: "160px",
            }}
          >
            <div
              style={{
                padding: "6px 14px",
                borderRadius: "999px",
                background: tone.bg,
                color: tone.fg,
                border: `1px solid ${tone.border}`,
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {tone.label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
              <span
                style={{
                  fontFamily: "Instrument Serif, serif",
                  fontSize: "40px",
                  lineHeight: 1,
                  color: "#0F172A",
                }}
              >
                {output.overall.score}
              </span>
              <span style={{ fontSize: "11px", color: "#64748B" }}>/100</span>
            </div>
            <span style={{ fontSize: "10px", color: "#64748B" }}>
              Overall screening score
            </span>
            <span style={{ fontSize: "10px", color: "#64748B" }}>
              Next action: {nextActionLabel(output.overall.nextAction)}
            </span>
          </div>
        </div>

        {/* Lens scores */}
        <section>
          <h2
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#475569",
              margin: "0 0 8px 0",
            }}
          >
            Lens scores
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(output.lenses.length, 1)}, 1fr)`,
              gap: "8px",
            }}
          >
            {output.lenses.map((lens) => {
              const lensTone = SIGNAL_TONES[lens.signal];
              return (
                <div
                  key={lens.key}
                  style={{
                    border: `1px solid ${lensTone.border}40`,
                    background: lensTone.bg,
                    borderRadius: "6px",
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: lensTone.fg,
                      fontWeight: 600,
                    }}
                  >
                    {lensName(lens.key)}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "4px",
                      marginTop: "2px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "Instrument Serif, serif",
                        fontSize: "26px",
                        color: "#0F172A",
                      }}
                    >
                      {lens.score}
                    </span>
                    <span style={{ fontSize: "10px", color: "#64748B" }}>
                      /100
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: "10px",
                      color: "#334155",
                      lineHeight: 1.4,
                      margin: "6px 0 0 0",
                      display: "-webkit-box",
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {lens.rationale}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top evidence claims (max 1 per lens to keep 1 page) */}
        <section>
          <h2
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#475569",
              margin: "0 0 8px 0",
            }}
          >
            Key evidence
          </h2>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            {getPrintableEvidenceSeeds(output).map((evidence) => (
              <li
                key={`${evidence.lensKey}-claim`}
                style={{
                  display: "flex",
                  gap: "8px",
                  fontSize: "11px",
                  lineHeight: 1.4,
                  color: "#334155",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    fontWeight: 600,
                    color: "#475569",
                    width: "70px",
                  }}
                >
                  {evidence.lensLabel}
                </span>
                <span style={{ flex: 1 }}>
                  {evidence.claim}
                  {evidence.source ? (
                    <span
                      style={{
                        marginLeft: "6px",
                        color: "#94A3B8",
                        fontSize: "9px",
                      }}
                    >
                      ({evidence.source})
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Missing materials (only if any) */}
        {output.overall.missingMaterials.length > 0 ? (
          <section
            style={{
              border: "1px solid #BAE6FD",
              background: "#F0F9FF",
              borderRadius: "6px",
              padding: "10px 12px",
            }}
          >
            <h2
              style={{
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#075985",
                margin: "0 0 4px 0",
              }}
            >
              Materials needed before DD
            </h2>
            <p
              style={{
                fontSize: "11px",
                color: "#0C4A6E",
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {output.overall.missingMaterials
                .map((code) => MISSING_LABELS[code] ?? code)
                .join(" · ")}
            </p>
          </section>
        ) : null}

        {/* Footer */}
        <footer
          style={{
            marginTop: "auto",
            paddingTop: "12px",
            borderTop: "1px solid #E2E8F0",
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
            This is a screening summary. Not investment advice. Not DD.
          </span>
        </footer>
      </section>
    </PrintLayout>
  );
}
