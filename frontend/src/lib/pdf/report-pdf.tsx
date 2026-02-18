import { Document, Page, Text, View, StyleSheet, Svg, Circle } from "@react-pdf/renderer";
import {
  COLORS, SECTION_META, DEFAULT_WEIGHTS,
  getScoreLabel, getScoreColor, getSummaryFromData, formatCurrency, formatStage, formatRaiseType, toStringArray,
  type PdfData,
} from "./shared";

const s = StyleSheet.create({
  page: { paddingTop: 50, paddingBottom: 70, paddingHorizontal: 50, fontFamily: "Helvetica", fontSize: 10, color: COLORS.black },
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
  brand: { fontSize: 10, fontFamily: "Helvetica-Bold", color: COLORS.cyan, textAlign: "center", marginBottom: 6 },
  title: { fontSize: 28, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 24 },
  companyName: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 16 },
  score: { fontSize: 48, fontFamily: "Helvetica-Bold", color: COLORS.orange, textAlign: "center", marginBottom: 4 },
  scoreLabel: { fontSize: 12, textAlign: "center", color: COLORS.gray, marginBottom: 10 },
  stageLine: { fontSize: 10, textAlign: "center", color: COLORS.gray, marginBottom: 4 },
  dateLine: { fontSize: 9, textAlign: "center", color: COLORS.lightGray, marginBottom: 32 },
  // Section banner
  banner: { backgroundColor: COLORS.cyan, paddingVertical: 10, paddingHorizontal: 16, marginTop: 24, marginBottom: 16 },
  bannerText: { fontSize: 14, fontFamily: "Helvetica-Bold", color: COLORS.white },
  // Sub-section
  subHeader: { fontSize: 12, fontFamily: "Helvetica-Bold", backgroundColor: "#eef1f6", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 3, marginBottom: 12, marginTop: 18, color: "#374151" },
  // Deal info table
  dealRow: { flexDirection: "row", marginBottom: 8 },
  dealLabel: { width: 110, fontSize: 10, color: COLORS.cyan },
  dealValue: { fontSize: 10, fontFamily: "Helvetica-Bold", width: 140 },
  // Two-column strengths/risks
  twoCol: { flexDirection: "row", gap: 24, marginTop: 16, marginBottom: 16 },
  col: { flex: 1 },
  colTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 3 },
  colTitleGreen: { color: "#16a34a", backgroundColor: "#f0fdf4" },
  colTitleRed: { color: "#dc2626", backgroundColor: "#fef2f2" },
  bulletItem: { fontSize: 9, lineHeight: 1.7, marginBottom: 6, paddingLeft: 8 },
  bulletDot: { color: "#22c55e" },
  bulletTriangle: { color: "#f59e0b" },
  emptyHint: { fontSize: 9, lineHeight: 1.6, color: COLORS.lightGray, fontStyle: "italic" },
  // Score bars
  scoreRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  scoreBarLabel: { width: 150, fontSize: 9 },
  scoreBarTrack: { flex: 1, height: 14, backgroundColor: "#e5e7eb", borderRadius: 3, marginRight: 10 },
  scoreBarFill: { height: 14, borderRadius: 3 },
  scoreBarValue: { width: 28, fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },
  // Generic
  body: { fontSize: 10, lineHeight: 1.7, textAlign: "justify" },
  summaryText: { fontSize: 10, lineHeight: 1.7, color: COLORS.gray, marginBottom: 12 },
  sectionScore: { flexDirection: "row", alignItems: "center", backgroundColor: "#f3f4f6", borderRadius: 6, padding: 14, marginBottom: 16 },
  sectionScoreLabel: { fontSize: 9, color: COLORS.lightGray },
  sectionScoreValue: { fontSize: 28, fontFamily: "Helvetica-Bold" },
  // Grid 2x2
  grid2x2: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  gridCell: { width: "48%", borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 10 },
  gridCellTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: COLORS.cyan, marginBottom: 4 },
  gridCellBody: { fontSize: 8, lineHeight: 1.5, color: COLORS.gray },
  // Source card
  sourceCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 10, marginBottom: 8 },
  sourceTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: COLORS.cyan, marginBottom: 3 },
  sourceDesc: { fontSize: 8, color: COLORS.gray },
  sourceAgent: { fontSize: 8, color: COLORS.lightGray, textAlign: "right", marginTop: 2 },
  // Footer
  footer: { position: "absolute", bottom: 20, left: 50, right: 50, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: COLORS.lightGray },
  footerLeft: { fontFamily: "Helvetica-Bold", color: COLORS.cyan },
  // Competitors
  compList: { fontSize: 9, lineHeight: 1.7, color: COLORS.gray, marginTop: 6, marginBottom: 10 },
});

function ScoreCircle({ score, size = 40 }: { score: number; size?: number }) {
  const color = getScoreColor(score);
  const half = size / 2;
  const r = half - 3;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={half} cy={half} r={r} stroke="#e5e7eb" strokeWidth={4} fill="none" />
      <Circle
        cx={half} cy={half} r={r}
        stroke={color} strokeWidth={4} fill="none"
        strokeDasharray={`${filled} ${circumference - filled}`}
        transform={`rotate(-90 ${half} ${half})`}
      />
    </Svg>
  );
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
  });
}

function Footer({ companyName }: { companyName: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerLeft}>INSIDELINE.AI</Text>
      <Text>{companyName} | Analysis Report</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
    </View>
  );
}

function SectionBanner({ title }: { title: string }) {
  return (
    <View style={s.banner}>
      <Text style={s.bannerText}>{title}</Text>
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

type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object") return {};
  return value as UnknownRecord;
}

function toNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getPathValue(source: UnknownRecord, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = source;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as UnknownRecord)[part];
  }
  return current;
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = toNonEmptyString(value);
    if (normalized) return normalized;
  }
  return "";
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function mergeStringArrays(...values: unknown[]): string[] {
  return uniqueStrings(values.flatMap((value) => toStringArray(value)));
}

function firstStringFromPaths(source: UnknownRecord, paths: string[]): string {
  return firstNonEmptyString(...paths.map((path) => getPathValue(source, path)));
}

function arrayFromPaths(source: UnknownRecord, paths: string[]): string[] {
  return mergeStringArrays(...paths.map((path) => getPathValue(source, path)));
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "present", "filled"].includes(normalized)) return true;
    if (["false", "no", "missing", "absent"].includes(normalized)) return false;
  }
  return undefined;
}

function extractFeatureNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = value.map((item) => {
    if (typeof item === "string") return item.trim();
    if (!item || typeof item !== "object") return "";
    const record = item as UnknownRecord;
    return firstNonEmptyString(record.name, record.title, record.feature, record.description);
  });
  return uniqueStrings(names);
}

function extractNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = value.map((item) => {
    if (typeof item === "string") return item.trim();
    if (!item || typeof item !== "object") return "";
    const record = item as UnknownRecord;
    return firstNonEmptyString(record.name, record.title, record.company);
  });
  return uniqueStrings(names);
}

function buildBarrierFields(
  competitiveData: UnknownRecord,
  marketData: UnknownRecord,
): Array<{ label: string; value: string }> {
  const resolved = {
    technical: firstNonEmptyString(competitiveData.technicalBarrier),
    capital: firstNonEmptyString(competitiveData.capitalBarrier),
    network: firstNonEmptyString(competitiveData.networkEffectsBarrier),
    regulatory: firstNonEmptyString(competitiveData.regulatoryBarrier),
  };

  const fromList = mergeStringArrays(competitiveData.barriers, marketData.barriers);
  for (const barrier of fromList) {
    const lower = barrier.toLowerCase();
    if (!resolved.regulatory && (lower.includes("regulator") || lower.includes("license"))) {
      resolved.regulatory = barrier;
      continue;
    }
    if (!resolved.capital && (lower.includes("capital") || lower.includes("infrastructure"))) {
      resolved.capital = barrier;
      continue;
    }
    if (!resolved.network && (lower.includes("network") || lower.includes("switching"))) {
      resolved.network = barrier;
      continue;
    }
    if (!resolved.technical) {
      resolved.technical = barrier;
    }
  }

  return [
    { label: "Technical", value: resolved.technical },
    { label: "Capital", value: resolved.capital },
    { label: "Network Effects", value: resolved.network },
    { label: "Regulatory", value: resolved.regulatory },
  ].filter((item) => item.value.length > 0);
}

function StrengthsRisks({ strengths, risks }: { strengths: string[]; risks: string[] }) {
  const strengthItems = strengths.length > 0
    ? strengths
    : ["No section-specific strengths were captured."];
  const riskItems = risks.length > 0
    ? risks
    : ["No section-specific risks were captured."];

  return (
    <View style={s.twoCol} wrap={false}>
      <View style={s.col}>
        <Text style={[s.colTitle, s.colTitleGreen]}>Key Strengths</Text>
        {strengthItems.map((item, i) => (
          <Text key={`strength-${i}`} style={item.startsWith("No section-specific") ? s.emptyHint : s.bulletItem}>
            {!item.startsWith("No section-specific") && <Text style={s.bulletDot}>•  </Text>}
            {item}
          </Text>
        ))}
      </View>
      <View style={s.col}>
        <Text style={[s.colTitle, s.colTitleRed]}>Key Risks</Text>
        {riskItems.map((item, i) => (
          <Text key={`risk-${i}`} style={item.startsWith("No section-specific") ? s.emptyHint : s.bulletItem}>
            {!item.startsWith("No section-specific") && <Text style={s.bulletTriangle}>•  </Text>}
            {item}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function AnalysisReportPDF({ startup, evaluation, weights, watermarkEmail }: PdfData) {
  const w = weights ?? DEFAULT_WEIGHTS;
  const scores = evaluation.sectionScores;
  const overallScore = evaluation.overallScore ?? 0;
  const strengths = mergeStringArrays(evaluation.keyStrengths).slice(0, 3);
  const risks = mergeStringArrays(evaluation.keyRisks).slice(0, 3);
  const productWeight = w.product ?? DEFAULT_WEIGHTS.product;
  const teamWeight = w.team ?? DEFAULT_WEIGHTS.team;
  const competitiveWeight =
    w.competitiveAdvantage ?? DEFAULT_WEIGHTS.competitiveAdvantage;
  const executiveSummary = firstNonEmptyString(
    evaluation.executiveSummary,
    getSummaryFromData(evaluation.founderReport),
    getSummaryFromData(evaluation.investorMemo),
  );

  const productData = toRecord(evaluation.productData);
  const teamData = toRecord(evaluation.teamData);
  const compData = toRecord(evaluation.competitiveAdvantageData);
  const marketData = toRecord(evaluation.marketData);
  const rawTeamComp = toRecord(teamData.teamComposition);
  const typedTeamComp = toRecord(evaluation.teamComposition);

  const productReadiness = toRecord(
    getPathValue(productData, "technologyReadiness") ??
      getPathValue(productData, "technology_readiness"),
  );
  const productMoat = toRecord(
    getPathValue(productData, "competitiveMoat") ??
      getPathValue(productData, "competitive_moat"),
  );
  const technologyStage = firstNonEmptyString(
    startup.technologyReadinessLevel,
    firstStringFromPaths(productReadiness, ["stage"]),
    firstStringFromPaths(productData, [
      "technologyReadiness.stage",
      "technology_readiness.stage",
      "technologyStage",
      "technology_stage",
      "productMaturity",
      "product_maturity",
    ]),
  );
  const moatLabel = firstNonEmptyString(
    firstStringFromPaths(productMoat, ["moatType", "moat_type", "type"]),
    firstStringFromPaths(productData, ["moatType", "moat_type"]),
    Array.isArray(compData.moats) ? toNonEmptyString(compData.moats[0]) : "",
  );
  const productSummary = firstNonEmptyString(
    evaluation.productSummary,
    getSummaryFromData(productData),
    firstStringFromPaths(productData, [
      "productSummary",
      "product_summary",
      "one_liner",
      "summary",
      "overview",
      "analysis",
      "description",
    ]),
  );
  const productFeatureStrengths = mergeStringArrays(
    extractFeatureNames(evaluation.extractedFeatures),
    arrayFromPaths(productData, [
      "product_features.core_features",
      "product_features.differentiators",
      "product_features.capabilities",
      "product_features.strengths",
      "technology_readiness.supporting_signals",
      "technologyReadiness.supportingSignals",
      "architecture_and_stack_inference.likely_tech_components",
      "architectureAndStackInference.likelyTechComponents",
    ]),
  );
  const productStrengthsBase = mergeStringArrays(
    arrayFromPaths(productData, [
      "keyStrengths",
      "key_strengths",
      "keyFindings",
      "key_findings",
      "strengths",
      "advantages",
    ]),
    productFeatureStrengths,
    strengths,
  );
  const productInferredStrengths = uniqueStrings([
    technologyStage ? `Technology stage: ${technologyStage}` : "",
    moatLabel ? `Moat signal: ${moatLabel}` : "",
    productSummary ? "Product narrative is documented." : "",
    ...productFeatureStrengths.slice(0, 2),
  ]);
  const productStrengths = (
    productStrengthsBase.length > 0 ? productStrengthsBase : productInferredStrengths
  ).slice(0, 4);
  const productRisksBase = mergeStringArrays(
    arrayFromPaths(productData, [
      "keyRisks",
      "key_risks",
      "risks",
      "dataGaps",
      "data_gaps",
      "technology_readiness.risks_or_unknowns",
      "technologyReadiness.risksOrUnknowns",
    ]),
    risks,
  );
  const productInferredRisks = uniqueStrings(
    arrayFromPaths(productReadiness, ["risks_or_unknowns", "risks_unknowns"]).slice(0, 4),
  );
  const productRisks = (
    productRisksBase.length > 0 ? productRisksBase : productInferredRisks
  ).slice(0, 4);

  const memberStrengths = Array.isArray(evaluation.teamMemberEvaluations)
    ? uniqueStrings(
        evaluation.teamMemberEvaluations.flatMap((member) => {
          const entry = toRecord(member);
          return [
            ...toStringArray(entry.strengths),
            ...toStringArray(entry.strengthsForRole),
            ...toStringArray(entry.strengths_for_role),
          ];
        }),
      )
    : [];
  const memberRisks = Array.isArray(evaluation.teamMemberEvaluations)
    ? uniqueStrings(
        evaluation.teamMemberEvaluations.flatMap((member) => {
          const entry = toRecord(member);
          return [
            ...toStringArray(entry.concerns),
            ...toStringArray(entry.potentialConcerns),
            ...toStringArray(entry.potential_concerns),
          ];
        }),
      )
    : [];
  const teamStrengthsBase = mergeStringArrays(
    arrayFromPaths(teamData, [
      "keyStrengths",
      "key_strengths",
      "keyFindings",
      "key_findings",
      "strengths",
    ]),
    memberStrengths,
    strengths,
  );
  const teamRisksBase = mergeStringArrays(
    arrayFromPaths(teamData, [
      "keyRisks",
      "key_risks",
      "risks",
      "dataGaps",
      "data_gaps",
    ]),
    memberRisks,
    risks,
    evaluation.executionRiskNotes,
  );

  const hasBusinessLeader =
    parseBoolean(rawTeamComp.hasBusinessLeader) ??
    parseBoolean(rawTeamComp.has_business_leader) ??
    parseBoolean(typedTeamComp.hasBusinessLeader) ??
    parseBoolean(typedTeamComp.has_business_leader);
  const hasTechnicalLeader =
    parseBoolean(rawTeamComp.hasTechnicalLeader) ??
    parseBoolean(rawTeamComp.has_technical_leader) ??
    parseBoolean(typedTeamComp.hasTechnicalLeader) ??
    parseBoolean(typedTeamComp.has_technical_leader);
  const hasIndustryExpert =
    parseBoolean(rawTeamComp.hasIndustryExpert) ??
    parseBoolean(rawTeamComp.has_industry_expert) ??
    parseBoolean(typedTeamComp.hasIndustryExpert) ??
    parseBoolean(typedTeamComp.has_industry_expert);
  const hasOperationsLeader =
    parseBoolean(rawTeamComp.hasOperationsLeader) ??
    parseBoolean(rawTeamComp.has_operations_leader) ??
    parseBoolean(typedTeamComp.hasOperationsLeader) ??
    parseBoolean(typedTeamComp.has_operations_leader);
  const teamBalance = firstNonEmptyString(
    firstStringFromPaths(rawTeamComp, ["teamBalance", "team_balance"]),
    firstStringFromPaths(typedTeamComp, ["teamBalance", "team_balance"]),
    firstStringFromPaths(teamData, [
      "executionCapability",
      "execution_capability",
      "founderQuality",
      "founder_quality",
    ]),
  );
  const showTeamComposition =
    hasBusinessLeader !== undefined ||
    hasTechnicalLeader !== undefined ||
    hasIndustryExpert !== undefined ||
    hasOperationsLeader !== undefined;
  const teamInferredStrengths = uniqueStrings([
    hasBusinessLeader ? "Business leadership coverage is present." : "",
    hasTechnicalLeader ? "Technical leadership coverage is present." : "",
    hasIndustryExpert ? "Industry expertise is represented on the team." : "",
    teamBalance,
  ]);
  const teamInferredRisks = uniqueStrings([
    hasBusinessLeader === false ? "Business leadership coverage appears limited." : "",
    hasTechnicalLeader === false ? "Technical leadership coverage appears limited." : "",
    hasOperationsLeader === false ? "Operations leadership coverage appears limited." : "",
    hasIndustryExpert === false ? "Industry-domain depth may be limited." : "",
  ]);
  const teamStrengths = (
    teamStrengthsBase.length > 0 ? teamStrengthsBase : teamInferredStrengths
  ).slice(0, 4);
  const teamRisks = (teamRisksBase.length > 0 ? teamRisksBase : teamInferredRisks).slice(0, 4);

  const marketStrategy = firstNonEmptyString(
    firstStringFromPaths(compData, [
      "marketStrategy",
      "market_strategy",
      "strategy",
      "competitivePosition",
      "competitive_position",
    ]),
    firstStringFromPaths(marketData, ["competitivePosition", "competitive_position"]),
  );
  const differentiation = firstNonEmptyString(
    firstStringFromPaths(compData, [
      "differentiation",
      "competitivePosition",
      "competitive_position",
    ]),
    firstStringFromPaths(marketData, ["competitivePosition", "competitive_position"]),
  );
  const uniqueValueProposition = firstNonEmptyString(
    firstStringFromPaths(compData, [
      "uniqueValueProposition",
      "unique_value_proposition",
      "positioningRecommendation",
      "positioning_recommendation",
    ]),
  );
  const barrierFields = buildBarrierFields(compData, marketData);
  const competitorStrengthsBase = mergeStringArrays(
    arrayFromPaths(compData, [
      "keyFindings",
      "key_findings",
      "advantages",
      "strengths",
      "differentiators",
      "moats",
    ]),
    arrayFromPaths(marketData, ["keyFindings", "key_findings"]),
    strengths,
  );
  const competitorInferredStrengths = uniqueStrings([
    differentiation ? `Differentiation signal: ${differentiation}` : "",
    uniqueValueProposition ? `Value proposition: ${uniqueValueProposition}` : "",
    marketStrategy ? `Positioning: ${marketStrategy}` : "",
  ]);
  const competitorStrengths = (
    competitorStrengthsBase.length > 0
      ? competitorStrengthsBase
      : competitorInferredStrengths
  ).slice(0, 4);
  const competitorRisksBase = mergeStringArrays(
    arrayFromPaths(compData, [
      "keyRisks",
      "key_risks",
      "risks",
      "barriers",
      "dataGaps",
      "data_gaps",
    ]),
    arrayFromPaths(marketData, ["risks"]),
    risks,
  );
  const competitorInferredRisks = uniqueStrings(barrierFields.map((field) => field.value));
  const competitorRisks = (
    competitorRisksBase.length > 0 ? competitorRisksBase : competitorInferredRisks
  ).slice(0, 4);
  const directCompetitors = uniqueStrings([
    ...arrayFromPaths(compData, ["directCompetitors", "direct_competitors"]),
    ...arrayFromPaths(marketData, ["directCompetitors", "direct_competitors"]),
    ...extractNames(compData.directCompetitorsDetailed),
    ...extractNames(compData.direct_competitors_detailed),
    ...extractNames(marketData.directCompetitorsDetailed),
    ...extractNames(marketData.direct_competitors_detailed),
  ]).slice(0, 15);
  const indirectCompetitors = uniqueStrings([
    ...arrayFromPaths(compData, ["indirectCompetitors", "indirect_competitors"]),
    ...arrayFromPaths(marketData, ["indirectCompetitors", "indirect_competitors"]),
    ...extractNames(compData.indirectCompetitorsDetailed),
    ...extractNames(compData.indirect_competitors_detailed),
    ...extractNames(marketData.indirectCompetitorsDetailed),
    ...extractNames(marketData.indirect_competitors_detailed),
  ]).slice(0, 15);

  const SCORE_LABELS: Record<string, string> = {
    team: "Team", market: "Market", product: "Product", traction: "Traction",
    businessModel: "Business Model", gtm: "Go-to-Market", competitiveAdvantage: "Competitive Advantage",
    financials: "Financials", legal: "Legal", dealTerms: "Deal Terms", exitPotential: "Exit Potential",
  };

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Footer companyName={startup.name} />
        <Watermark email={watermarkEmail} />

        {/* Cover */}
        <Text style={s.brand}>INSIDELINE.AI</Text>
        <Text style={s.title}>Analysis Report</Text>
        <Text style={s.companyName}>{startup.name}</Text>
        <Text style={s.score}>{overallScore}</Text>
        <Text style={s.scoreLabel}>{getScoreLabel(overallScore)}</Text>
        <Text style={s.stageLine}>Stage: {formatStage(startup.stage)}</Text>
        <Text style={s.dateLine}>Generated: {formatDate()}</Text>

        {/* SUMMARY */}
        <SectionBanner title="SUMMARY" />
        {executiveSummary && (
          <>
            <Text style={s.subHeader}>Executive Summary</Text>
            <Text style={s.summaryText}>{executiveSummary}</Text>
          </>
        )}

        <Text style={s.subHeader}>Deal Information</Text>
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1 }}>
            <View style={s.dealRow}>
              <Text style={s.dealLabel}>Stage</Text>
              <Text style={s.dealValue}>{formatStage(startup.stage)}</Text>
            </View>
            <View style={s.dealRow}>
              <Text style={s.dealLabel}>Valuation</Text>
              <Text style={s.dealValue}>{formatCurrency(startup.valuation)}</Text>
            </View>
            <View style={s.dealRow}>
              <Text style={s.dealLabel}>Lead Investor</Text>
              <Text style={s.dealValue}>{startup.leadInvestorName || (startup.leadSecured ? "Yes" : "No")}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.dealRow}>
              <Text style={s.dealLabel}>Round Size</Text>
              <Text style={s.dealValue}>{formatCurrency(startup.fundingTarget)}</Text>
            </View>
            <View style={s.dealRow}>
              <Text style={s.dealLabel}>Raise Type</Text>
              <Text style={s.dealValue}>{formatRaiseType(startup.raiseType)}</Text>
            </View>
          </View>
        </View>

        <StrengthsRisks strengths={strengths} risks={risks} />

        {/* Section Scores */}
        <View break wrap={false}>
          <SectionBanner title="SECTION SCORES" />
          {scores && SECTION_META.map((meta) => {
            const score = scores[meta.scoreKey] ?? 0;
            const weight = w[meta.key] ?? DEFAULT_WEIGHTS[meta.key];
            return (
              <View key={meta.key} style={s.scoreRow} wrap={false}>
                <Text style={s.scoreBarLabel}>{SCORE_LABELS[meta.key] ?? meta.label} ({weight}%)</Text>
                <View style={s.scoreBarTrack}>
                  <View style={[s.scoreBarFill, { width: `${score}%`, backgroundColor: getScoreColor(score) }]} />
                </View>
                <Text style={s.scoreBarValue}>{score}</Text>
              </View>
            );
          })}
        </View>

        {/* PRODUCT */}
        <View break wrap={false}>
          <SectionBanner title="PRODUCT" />
          <View style={s.sectionScore}>
            <ScoreCircle score={scores?.product ?? 0} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold" }}>Product Score</Text>
              <Text style={s.sectionScoreLabel}>{productWeight}% weight in overall evaluation</Text>
            </View>
            <Text style={[s.sectionScoreValue, { color: getScoreColor(scores?.product ?? 0) }]}>{scores?.product ?? 0}<Text style={{ fontSize: 12, color: COLORS.lightGray }}>/100</Text></Text>
          </View>
          <Text style={s.subHeader}>Product Summary</Text>
          <Text style={s.body}>{productSummary || "No product summary available."}</Text>
        </View>

        {/* Product Readiness */}
        <View wrap={false}>
          <Text style={s.subHeader}>Product Readiness</Text>
          <View style={{ flexDirection: "row", gap: 16, marginBottom: 8 }}>
            <View style={[s.gridCell, { flex: 1 }]}>
              <Text style={s.gridCellTitle}>Technology Stage</Text>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{technologyStage || "N/A"}</Text>
            </View>
            <View style={[s.gridCell, { flex: 1 }]}>
              <Text style={s.gridCellTitle}>Competitive Moat</Text>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{moatLabel || "N/A"}</Text>
            </View>
          </View>
        </View>

        {/* Product Strengths/Risks */}
        <StrengthsRisks strengths={productStrengths} risks={productRisks} />

        {/* TEAM */}
        <View break>
          <View wrap={false}>
            <SectionBanner title="TEAM" />
            <View style={s.sectionScore}>
              <ScoreCircle score={scores?.team ?? 0} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold" }}>Team Score</Text>
                <Text style={s.sectionScoreLabel}>{teamWeight}% weight in overall evaluation</Text>
              </View>
              <Text style={[s.sectionScoreValue, { color: getScoreColor(scores?.team ?? 0) }]}>{scores?.team ?? 0}<Text style={{ fontSize: 12, color: COLORS.lightGray }}>/100</Text></Text>
            </View>
          </View>

          {/* Team Composition */}
          {showTeamComposition && (
            <View wrap={false}>
              <Text style={s.subHeader}>Team Composition</Text>
              <View style={s.grid2x2}>
                {[
                  { label: "Business/CEO Leader", value: hasBusinessLeader },
                  { label: "Technical/CTO Leader", value: hasTechnicalLeader },
                  { label: "Industry Expert", value: hasIndustryExpert },
                  { label: "Operations Leader", value: hasOperationsLeader },
                ].map((item) => {
                  const bgColor = item.value === undefined
                    ? "#f8fafc"
                    : item.value
                    ? "#f0fdf4"
                    : "#fef2f2";
                  const marker = item.value === undefined ? "?" : item.value ? "●" : "○";
                  return (
                    <View key={item.label} style={[s.gridCell, { backgroundColor: bgColor }]}>
                      <Text style={{ fontSize: 9 }}>{marker} {item.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {teamBalance && (
            <Text style={[s.body, { marginTop: 8 }]}>{teamBalance}</Text>
          )}

          <StrengthsRisks strengths={teamStrengths} risks={teamRisks} />
        </View>

        {/* COMPETITORS */}
        <View break>
          <View wrap={false}>
            <SectionBanner title="COMPETITORS" />
            <View style={s.sectionScore}>
              <ScoreCircle score={scores?.competitiveAdvantage ?? 0} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold" }}>Competitive Advantage Score</Text>
                <Text style={s.sectionScoreLabel}>{competitiveWeight}% weight in overall evaluation</Text>
              </View>
              <Text style={[s.sectionScoreValue, { color: getScoreColor(scores?.competitiveAdvantage ?? 0) }]}>{scores?.competitiveAdvantage ?? 0}<Text style={{ fontSize: 12, color: COLORS.lightGray }}>/100</Text></Text>
            </View>
          </View>

          {/* Strategic Positioning */}
          <View wrap={false}>
            <Text style={s.subHeader}>Strategic Positioning</Text>
            <View style={{ flexDirection: "row", gap: 16, marginBottom: 8 }}>
              <View style={[s.gridCell, { flex: 1 }]}>
                <Text style={s.gridCellTitle}>Market Strategy</Text>
                <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{marketStrategy || "N/A"}</Text>
              </View>
            </View>
            {differentiation && (
              <View style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Differentiation:</Text>
                <Text style={{ fontSize: 9, color: COLORS.gray, lineHeight: 1.4 }}>{differentiation}</Text>
              </View>
            )}
            {uniqueValueProposition && (
              <View style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Unique Value Proposition:</Text>
                <Text style={{ fontSize: 9, color: COLORS.gray, lineHeight: 1.4 }}>{uniqueValueProposition}</Text>
              </View>
            )}
          </View>

          {/* Barriers to entry */}
          {barrierFields.length > 0 && (
            <View wrap={false}>
              <Text style={s.subHeader}>Barriers to Entry</Text>
              <View style={s.grid2x2}>
                {barrierFields.map((field) => (
                  <View key={field.label} style={s.gridCell}>
                    <Text style={s.gridCellTitle}>{field.label}</Text>
                    <Text style={s.gridCellBody}>{field.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <StrengthsRisks strengths={competitorStrengths} risks={competitorRisks} />

          {/* Competitors lists */}
          {directCompetitors.length > 0 && (
            <>
              <Text style={s.subHeader}>Direct Competitors ({directCompetitors.length})</Text>
              <Text style={s.compList}>{directCompetitors.join(" • ")}</Text>
            </>
          )}
          {indirectCompetitors.length > 0 && (
            <>
              <Text style={s.subHeader}>Indirect Competitors ({indirectCompetitors.length})</Text>
              <Text style={s.compList}>{indirectCompetitors.join(" • ")}</Text>
            </>
          )}
        </View>

        {/* SOURCES */}
        {evaluation.sources && evaluation.sources.length > 0 && (
          <View break>
            <SectionBanner title="SOURCES" />
            <Text style={s.subHeader}>Data Sources</Text>
            <Text style={{ fontSize: 9, color: COLORS.lightGray, marginBottom: 8 }}>All sources used by AI agents to generate this evaluation</Text>

            {/* Group by type */}
            {(() => {
              const agentTypes = new Set(["agent"]);
              const linkedinTypes = new Set(["linkedin"]);
              const webTypes = new Set(["website", "research", "news"]);
              const groups: { key: string; title: string; items: typeof evaluation.sources }[] = [
                { key: "website", title: "Websites", items: evaluation.sources!.filter((src) => webTypes.has(src.type ?? "") || (src.url && !linkedinTypes.has(src.type ?? "") && !agentTypes.has(src.type ?? "") && !src.model)) },
                { key: "linkedin", title: "LinkedIn Profiles", items: evaluation.sources!.filter((src) => linkedinTypes.has(src.type ?? "") || (src.url?.includes("linkedin.com"))) },
                { key: "agent", title: "AI Analysis Agents", items: evaluation.sources!.filter((src) => agentTypes.has(src.type ?? "") || (!src.url && src.model)) },
                { key: "database", title: "Database Records", items: evaluation.sources!.filter((src) => src.type === "database") },
              ];
              return groups.map(({ key, title, items }) => {
                if (items.length === 0) return null;
                return (
                  <View key={key}>
                    <Text style={[s.subHeader, { color: COLORS.cyan }]}>{title}</Text>
                    {items.map((src, i) => (
                      <View key={i} style={s.sourceCard}>
                        <Text style={s.sourceTitle}>{src.title || src.name || src.url || "Unknown"}</Text>
                        {src.url && <Text style={{ fontSize: 8, color: COLORS.cyan, marginBottom: 2 }}>{src.url}</Text>}
                        {src.relevance && <Text style={s.sourceDesc}>{src.relevance}</Text>}
                        {src.agent && <Text style={s.sourceAgent}>{src.agent}</Text>}
                      </View>
                    ))}
                  </View>
                );
              });
            })()}
          </View>
        )}

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
