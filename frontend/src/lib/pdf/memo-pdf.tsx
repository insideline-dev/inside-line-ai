import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import {
  COLORS, SECTION_META, DEFAULT_WEIGHTS,
  getScoreLabel, getScoreColor, getSummaryFromData, formatCurrency, formatStage,
  type PdfData,
} from "./shared";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 60, paddingHorizontal: 50, fontFamily: "Helvetica", fontSize: 10, color: COLORS.black },
  watermark: {
    position: "absolute",
    top: 380,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 32,
    color: COLORS.lightGray,
    opacity: 0.14,
    transform: "rotate(-30deg)",
  },
  // Header
  brand: { fontSize: 10, fontFamily: "Helvetica-Bold", color: COLORS.cyan, textAlign: "center", marginBottom: 4 },
  title: { fontSize: 28, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 20 },
  companyName: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 14 },
  score: { fontSize: 48, fontFamily: "Helvetica-Bold", color: COLORS.orange, textAlign: "center", marginBottom: 2 },
  scoreLabel: { fontSize: 12, textAlign: "center", color: COLORS.gray, marginBottom: 8 },
  stageLine: { fontSize: 10, textAlign: "center", color: COLORS.gray, marginBottom: 2 },
  dateLine: { fontSize: 9, textAlign: "center", color: COLORS.lightGray, marginBottom: 16 },
  divider: { height: 3, backgroundColor: COLORS.cyan, marginBottom: 20, marginHorizontal: 140 },
  // Sections
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 6, marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: COLORS.cyan },
  sectionWeight: { fontSize: 9, fontFamily: "Helvetica", color: COLORS.lightGray },
  sectionScore: { fontSize: 14, fontFamily: "Helvetica-Bold", color: COLORS.black },
  sectionBody: { fontSize: 10, lineHeight: 1.5, color: COLORS.black, textAlign: "justify" },
  // Funding box
  fundingBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 12, marginTop: 20, marginBottom: 10 },
  fundingTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: COLORS.cyan, marginBottom: 8 },
  fundingRow: { flexDirection: "row", marginBottom: 4 },
  fundingLabel: { fontSize: 10, color: COLORS.gray, width: 120 },
  fundingValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  // Recommendations
  recsTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: COLORS.cyan, marginTop: 20, marginBottom: 10 },
  recItem: { fontSize: 10, lineHeight: 1.5, marginBottom: 6, paddingLeft: 12 },
  // Footer
  footer: { position: "absolute", bottom: 20, left: 50, right: 50, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: COLORS.lightGray },
  footerLeft: { fontFamily: "Helvetica-Bold", color: COLORS.cyan },
});

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
  });
}

function Footer({ companyName }: { companyName: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerLeft}>INSIDELINE.AI</Text>
      <Text>{companyName} | Investment Memo</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
    </View>
  );
}

function Watermark({ email }: { email?: string | null }) {
  if (!email) return null;
  return (
    <Text style={s.watermark} fixed>
      {email}
    </Text>
  );
}

export function InvestmentMemoPDF({ startup, evaluation, weights, watermarkEmail }: PdfData) {
  const w = weights ?? DEFAULT_WEIGHTS;
  const scores = evaluation.sectionScores;
  const overallScore = evaluation.overallScore ?? 0;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Footer companyName={startup.name} />
        <Watermark email={watermarkEmail} />

        {/* Cover */}
        <Text style={s.brand}>INSIDELINE.AI</Text>
        <Text style={s.title}>Investment Memo</Text>
        <Text style={s.companyName}>{startup.name}</Text>
        <Text style={s.score}>{overallScore}</Text>
        <Text style={s.scoreLabel}>{getScoreLabel(overallScore)}</Text>
        <Text style={s.stageLine}>Stage: {formatStage(startup.stage)}</Text>
        <Text style={s.dateLine}>Generated: {formatDate()}</Text>
        <View style={s.divider} />

        {/* Executive Summary */}
        {evaluation.executiveSummary && (
          <>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Executive Summary</Text>
            </View>
            <Text style={s.sectionBody}>{evaluation.executiveSummary}</Text>
          </>
        )}

        {/* Section analyses */}
        {SECTION_META.map((meta) => {
          const score = scores?.[meta.scoreKey];
          const weight = w[meta.key] ?? DEFAULT_WEIGHTS[meta.key];
          const content = getSummaryFromData(evaluation[meta.dataKey]);
          if (!content && score === undefined) return null;

          // Insert funding history box before Deal Terms
          const isFunding = meta.key === "dealTerms";

          return (
            <View key={meta.key}>
              {isFunding && (
                <View style={s.fundingBox}>
                  <Text style={s.fundingTitle}>Funding History</Text>
                  <View style={s.fundingRow}>
                    <Text style={s.fundingLabel}>Current Round:</Text>
                    <Text style={s.fundingValue}>{formatStage(startup.stage)?.toLowerCase()}</Text>
                  </View>
                  <View style={s.fundingRow}>
                    <Text style={s.fundingLabel}>Round Size:</Text>
                    <Text style={s.fundingValue}>{formatCurrency(startup.fundingTarget)}</Text>
                  </View>
                  <View style={s.fundingRow}>
                    <Text style={s.fundingLabel}>Valuation:</Text>
                    <Text style={s.fundingValue}>{formatCurrency(startup.valuation)}</Text>
                  </View>
                </View>
              )}

              <View style={s.sectionHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={s.sectionTitle}>{meta.label}</Text>
                  {weight && <Text style={s.sectionWeight}>(Weight: {weight}%)</Text>}
                </View>
                {score !== undefined && <Text style={[s.sectionScore, { color: getScoreColor(score) }]}>{score}/100</Text>}
              </View>
              {content ? <Text style={s.sectionBody}>{content}</Text> : null}
            </View>
          );
        })}

        {/* Confidential footer */}
        <View style={{ marginTop: 30, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 }}>
          <Text style={{ fontSize: 8, color: COLORS.lightGray, textAlign: "center" }}>
            Generated: {formatDate()} | CONFIDENTIAL - For authorized recipients only
          </Text>
        </View>
      </Page>
    </Document>
  );
}
