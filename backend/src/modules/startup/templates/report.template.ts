import PDFDocument from 'pdfkit';
import type { PdfContext } from './pdf.types';
import { sanitizeNarrativeText } from '../../ai/services/narrative-sanitizer';
import {
  BRAND_COLOR,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_MUTED,
  SUCCESS_COLOR,
  WARNING_COLOR,
  DANGER_COLOR,
  getScoreColor,
  getScoreLabel,
  formatCurrency,
  getSummaryFromData,
} from './pdf.types';

// Layout constants
const MARGIN = 50;
const PAGE_WIDTH = 595; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export function generateReportDocument(ctx: PdfContext): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 60, bottom: 50, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: `${ctx.startup.name} - Analysis Report`,
      Author: 'InsideLine.AI',
      Subject: 'AI-Generated Analysis Report',
      Keywords: 'analysis, report, startup, product, team, competitors',
      CreationDate: ctx.generatedAt,
    },
  });

  const { startup, evaluation, userEmail, generatedAt } = ctx;
  const timestamp = generatedAt.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  // Cast JSONB fields
  const teamData = evaluation?.teamData as Record<string, unknown> | null;
  const productData = evaluation?.productData as Record<string, unknown> | null;
  const competitiveData = evaluation?.competitiveAdvantageData as Record<string, unknown> | null;
  const investorMemo = evaluation?.investorMemo as Record<string, unknown> | null;
  const marketData = evaluation?.marketData as Record<string, unknown> | null;

  addWatermark(doc, userEmail);

  // ========== TITLE PAGE ==========
  renderTitlePage(doc, startup, evaluation, timestamp, userEmail);

  // ========== SUMMARY TAB ==========
  addReportSection(doc, 'SUMMARY', userEmail);
  renderSummaryTab(doc, startup, evaluation, investorMemo, marketData, userEmail);

  // ========== PRODUCT TAB ==========
  addReportSection(doc, 'PRODUCT', userEmail);
  renderProductTab(doc, startup, evaluation, productData, userEmail);

  // ========== TEAM TAB ==========
  addReportSection(doc, 'TEAM', userEmail);
  renderTeamTab(doc, evaluation, teamData, userEmail);

  // ========== COMPETITORS TAB ==========
  addReportSection(doc, 'COMPETITORS', userEmail);
  renderCompetitorsTab(doc, evaluation, competitiveData, userEmail);

  // ========== HEADERS & FOOTERS ==========
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    if (i > 0) {
      addReportHeader(doc, startup.name, i + 1, pages.count);
    }
    addFooter(doc, timestamp);
  }

  return doc;
}

// ============================================================================
// TITLE PAGE
// ============================================================================

function renderTitlePage(
  doc: PDFKit.PDFDocument,
  startup: PdfContext['startup'],
  evaluation: PdfContext['evaluation'],
  timestamp: string,
  userEmail: string,
): void {
  doc.y = 80;
  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .fillColor(BRAND_COLOR)
    .text('INSIDELINE.AI', MARGIN, doc.y, { align: 'center', width: CONTENT_WIDTH });
  doc.moveDown(0.3);

  doc
    .fontSize(28)
    .font('Helvetica-Bold')
    .fillColor(TEXT_PRIMARY)
    .text('Analysis Report', MARGIN, doc.y, { align: 'center', width: CONTENT_WIDTH });
  doc.moveDown(0.8);

  doc
    .fontSize(22)
    .font('Helvetica-Bold')
    .fillColor(TEXT_PRIMARY)
    .text(startup.name, MARGIN, doc.y, { align: 'center', width: CONTENT_WIDTH });
  doc.moveDown(0.5);

  const overallScore = evaluation?.overallScore ?? startup.overallScore ?? 0;
  const scoreColor = getScoreColor(overallScore);
  const scoreLabel = getScoreLabel(overallScore);

  const boxWidth = 195;
  const boxX = (PAGE_WIDTH - boxWidth) / 2;
  const scoreBoxY = doc.y;

  // Score ring
  doc.circle(PAGE_WIDTH / 2, scoreBoxY + 45, 40).stroke(scoreColor);
  doc.circle(PAGE_WIDTH / 2, scoreBoxY + 45, 35).stroke('#e5e5e5');
  doc
    .fontSize(32)
    .font('Helvetica-Bold')
    .fillColor(scoreColor)
    .text(overallScore.toFixed(0), boxX, scoreBoxY + 30, { align: 'center', width: boxWidth });
  doc
    .fontSize(11)
    .font('Helvetica')
    .fillColor(TEXT_SECONDARY)
    .text(`${scoreLabel} Investment`, boxX, scoreBoxY + 95, { align: 'center', width: boxWidth });

  doc.y = scoreBoxY + 120;

  const metaItems: string[] = [];
  if (startup.sectorIndustryGroup) metaItems.push(`Sector: ${startup.sectorIndustryGroup}`);
  else if (startup.industry) metaItems.push(`Sector: ${startup.industry}`);
  if (startup.stage) metaItems.push(`Stage: ${startup.stage.replace(/_/g, ' ').toUpperCase()}`);
  if (startup.location) metaItems.push(`Location: ${startup.location}`);

  if (metaItems.length > 0) {
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(TEXT_SECONDARY)
      .text(metaItems.join('  |  '), MARGIN, doc.y, { align: 'center', width: CONTENT_WIDTH });
    doc.moveDown(0.3);
  }

  doc
    .fontSize(9)
    .fillColor(TEXT_MUTED)
    .text(`Generated: ${timestamp}`, MARGIN, doc.y, { align: 'center', width: CONTENT_WIDTH });

  doc.moveDown(0.2);
  doc
    .fontSize(9)
    .fillColor(TEXT_MUTED)
    .text(`Generated by: ${userEmail}`, MARGIN, doc.y, { align: 'center', width: CONTENT_WIDTH });

  doc.moveDown(1.5);
}

// ============================================================================
// SUMMARY TAB
// ============================================================================

function renderSummaryTab(
  doc: PDFKit.PDFDocument,
  startup: PdfContext['startup'],
  evaluation: PdfContext['evaluation'],
  investorMemo: Record<string, unknown> | null,
  marketData: Record<string, unknown> | null,
  userEmail: string,
): void {
  // Deal Information Grid
  ensureSpace(doc, 680, userEmail);
  addSubsectionHeader(doc, 'Deal Information');

  const dealInfoItems: { label: string; value: string }[] = [];
  if (startup.stage) dealInfoItems.push({ label: 'Stage', value: startup.stage.replace(/_/g, ' ').toUpperCase() });
  if (startup.sectorIndustryGroup) dealInfoItems.push({ label: 'Industry Group', value: startup.sectorIndustryGroup.replace(/_/g, ' ') });
  if (startup.sectorIndustry) dealInfoItems.push({ label: 'Industry', value: startup.sectorIndustry.replace(/_/g, ' ') });
  if (startup.location) dealInfoItems.push({ label: 'Location', value: startup.location });
  if (startup.fundingTarget) dealInfoItems.push({ label: 'Funding Target', value: formatCurrency(startup.fundingTarget) });
  if (startup.valuation) dealInfoItems.push({ label: 'Valuation', value: formatCurrency(startup.valuation) });
  if (startup.raiseType) dealInfoItems.push({ label: 'Raise Type', value: startup.raiseType.replace(/_/g, ' ').toUpperCase() });
  if (startup.leadSecured !== null && startup.leadSecured !== undefined) {
    dealInfoItems.push({
      label: 'Lead Investor',
      value: startup.leadSecured
        ? `Yes${startup.leadInvestorName ? ` (${startup.leadInvestorName})` : ''}`
        : 'No',
    });
  }

  render2ColGrid(doc, dealInfoItems);

  // Previous Funding
  if (startup.hasPreviousFunding && startup.previousFundingAmount) {
    ensureSpace(doc, 680, userEmail);
    addSubsectionHeader(doc, 'Previous Funding');

    doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_SECONDARY)
      .text('Amount Raised: ', MARGIN + 10, doc.y, { continued: true });
    doc.font('Helvetica').fillColor(TEXT_PRIMARY)
      .text(formatCurrency(startup.previousFundingAmount));

    if (startup.previousRoundType) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_SECONDARY)
        .text('Round Type: ', MARGIN + 10, doc.y, { continued: true });
      doc.font('Helvetica').fillColor(TEXT_PRIMARY).text(startup.previousRoundType);
    }
    if (startup.previousInvestors) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_SECONDARY)
        .text('Previous Investors: ', MARGIN + 10, doc.y, { continued: true });
      doc.font('Helvetica').fillColor(TEXT_PRIMARY).text(startup.previousInvestors, { width: 400 });
    }
    doc.moveDown(0.5);
  }

  // Deal Snapshot
  const dealSnapshot = (investorMemo?.snapshot ?? investorMemo?.dealSnapshot) as string | undefined;
  if (dealSnapshot) {
    const sanitizedDealSnapshot = sanitizeNarrativeText(dealSnapshot);
    if (sanitizedDealSnapshot.length > 0) {
      ensureSpace(doc, 680, userEmail);
      addSubsectionHeader(doc, 'Deal Snapshot');
      doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY).text(sanitizedDealSnapshot, MARGIN + 5, doc.y, {
        width: CONTENT_WIDTH - 10,
        align: 'justify',
      });
      doc.moveDown(0.8);
    }
  }

  // Thesis Alignment
  const thesisAlignment =
    (investorMemo?.thesisAlignment as Record<string, unknown> | string | undefined) ??
    (marketData?.thesisAlignment as Record<string, unknown> | string | undefined);
  if (thesisAlignment) {
    ensureSpace(doc, 650, userEmail);
    doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 24).fill('#e0f2fe');
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND_COLOR)
      .text('Thesis Alignment', MARGIN + 8, doc.y + 6);
    doc.y += 32;

    if (typeof thesisAlignment === 'string') {
      const sanitizedAlignment = sanitizeNarrativeText(thesisAlignment);
      if (sanitizedAlignment.length > 0) {
        doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY).text(sanitizedAlignment, MARGIN + 5, doc.y, {
          width: CONTENT_WIDTH - 10,
        });
      }
    } else if ((thesisAlignment as Record<string, unknown>).summary) {
      const summaryText = sanitizeNarrativeText(
        (thesisAlignment as Record<string, unknown>).summary as string,
      );
      if (summaryText.length > 0) {
        doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY).text(summaryText, MARGIN + 5, doc.y, {
          width: CONTENT_WIDTH - 10,
        });
      }
    }

    const alignmentFactors = (thesisAlignment as Record<string, unknown>)?.alignmentFactors as unknown[] | undefined;
    if (Array.isArray(alignmentFactors) && alignmentFactors.length > 0) {
      doc.moveDown(0.3);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_MUTED).text('Alignment Factors:', MARGIN + 5);
      doc.moveDown(0.2);
      for (const factor of alignmentFactors.slice(0, 5)) {
        doc.circle(MARGIN + 15, doc.y + 4, 2).fill(SUCCESS_COLOR);
        const factorText = typeof factor === 'string' ? factor : ((factor as Record<string, unknown>).factor ?? (factor as Record<string, unknown>).name) as string;
        doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
          .text(factorText, MARGIN + 25, doc.y, { width: CONTENT_WIDTH - 30 });
        doc.moveDown(0.2);
      }
    }

    const concerns = (thesisAlignment as Record<string, unknown>)?.concerns as unknown[] | undefined;
    if (Array.isArray(concerns) && concerns.length > 0) {
      doc.moveDown(0.3);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_MUTED).text('Potential Concerns:', MARGIN + 5);
      doc.moveDown(0.2);
      for (const concern of concerns.slice(0, 3)) {
        doc.polygon(
          [MARGIN + 15, doc.y + 6],
          [MARGIN + 18, doc.y],
          [MARGIN + 21, doc.y + 6],
        ).fill(WARNING_COLOR);
        const concernText = typeof concern === 'string' ? concern : ((concern as Record<string, unknown>).concern ?? (concern as Record<string, unknown>).issue) as string;
        doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
          .text(concernText, MARGIN + 25, doc.y, { width: CONTENT_WIDTH - 30 });
        doc.moveDown(0.2);
      }
    }
    doc.moveDown(0.8);
  }

  // Key Strengths & Risks Grid
  const keyStrengths = ((evaluation?.keyStrengths ?? (investorMemo?.keyStrengths as unknown)) ?? []) as string[];
  const keyRisks = ((evaluation?.keyRisks ?? (investorMemo?.keyRisks as unknown)) ?? []) as string[];
  addStrengthsRisksGrid(doc, keyStrengths, keyRisks, 'Key Strengths', 'Key Risks', userEmail);

  // Section Scores with progress bars
  renderSectionScores(doc, evaluation, userEmail);
}

// ============================================================================
// PRODUCT TAB
// ============================================================================

function renderProductTab(
  doc: PDFKit.PDFDocument,
  startup: PdfContext['startup'],
  evaluation: PdfContext['evaluation'],
  productData: Record<string, unknown> | null,
  userEmail: string,
): void {
  const productScore = evaluation?.productScore ?? 0;
  addScoreCard(doc, 'Product Score', productScore, 10, BRAND_COLOR, userEmail);

  // Product Summary
  const productSummary =
    evaluation?.productSummary ??
    (productData?.productSummary as string | undefined) ??
    (productData?.one_liner as string | undefined) ??
    getSummaryFromData(productData);
  if (productSummary) {
    ensureSpace(doc, 680, userEmail);
    addSubsectionHeader(doc, 'Product Summary');
    doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
      .text(productSummary, MARGIN + 5, doc.y, { width: CONTENT_WIDTH - 10, align: 'justify' });
    doc.moveDown(0.8);
  }

  // Product Readiness
  const trlStage = startup.technologyReadinessLevel ?? (productData?.technologyReadiness as Record<string, unknown>)?.stage as string | undefined;
  const competitiveMoat = productData?.competitiveMoat as Record<string, unknown> | undefined;
  const moatType = competitiveMoat?.moatType as string | undefined;
  const moatStrength = competitiveMoat?.strength as number | undefined;

  if (trlStage || moatType) {
    ensureSpace(doc, 650, userEmail);
    addSubsectionHeader(doc, 'Product Readiness');

    const readinessY = doc.y;
    if (trlStage) {
      const trlLabel =
        trlStage === 'idea' ? 'Idea Stage' :
        trlStage === 'mvp' ? 'MVP' :
        trlStage === 'scaling' ? 'Scaling' :
        trlStage === 'mature' ? 'Mature' : trlStage.toUpperCase();
      doc.rect(MARGIN + 5, readinessY, 230, 35).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fontSize(9).font('Helvetica').fillColor(TEXT_MUTED).text('Technology Stage', MARGIN + 15, readinessY + 8);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(TEXT_PRIMARY).text(trlLabel, MARGIN + 15, readinessY + 20);
    }

    if (moatType) {
      doc.rect(MARGIN + 250, readinessY, 230, 35).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fontSize(9).font('Helvetica').fillColor(TEXT_MUTED).text('Competitive Moat', MARGIN + 260, readinessY + 8);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(TEXT_PRIMARY).text(moatType.replace(/_/g, ' '), MARGIN + 260, readinessY + 20);
    }

    doc.y = readinessY + 45;

    if (moatStrength !== undefined && moatStrength !== null) {
      doc.fontSize(9).font('Helvetica').fillColor(TEXT_MUTED).text('Moat Strength:', MARGIN + 5, doc.y);
      const barX = MARGIN + 80;
      const barWidth = 200;
      const barHeight = 8;
      doc.rect(barX, doc.y, barWidth, barHeight).fill('#e5e7eb');
      doc.rect(barX, doc.y, barWidth * (moatStrength / 100), barHeight).fill(getScoreColor(moatStrength));
      doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_PRIMARY)
        .text(`${moatStrength}/100`, barX + barWidth + 10, doc.y);
      doc.moveDown(0.8);
    }
  }

  // Product Strengths & Risks
  const productStrengths = ((productData?.keyStrengths ?? []) as string[]);
  const productRisks = ((productData?.keyRisks ?? []) as string[]);
  addStrengthsRisksGrid(doc, productStrengths, productRisks, 'Product Strengths', 'Product Risks', userEmail);

  // Key Features
  const extractedFeatures = ((evaluation?.extractedFeatures ?? []) as Array<Record<string, unknown>>);
  if (extractedFeatures.length > 0) {
    ensureSpace(doc, 600, userEmail);
    addSubsectionHeader(doc, 'Key Features');

    for (const feature of extractedFeatures.slice(0, 6)) {
      const name = (feature.name ?? feature) as string;
      const desc = feature.description as string | undefined;
      const category = feature.category as string | undefined;

      doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_PRIMARY)
        .text(`\u2022 ${name}`, MARGIN + 5, doc.y, { width: CONTENT_WIDTH - 10 });
      if (desc) {
        doc.fontSize(8).font('Helvetica').fillColor(TEXT_SECONDARY)
          .text(desc, MARGIN + 15, doc.y, { width: CONTENT_WIDTH - 20 });
      }
      if (category) {
        doc.fontSize(8).font('Helvetica-Oblique').fillColor(TEXT_MUTED)
          .text(`Category: ${category}`, MARGIN + 15, doc.y);
      }
      doc.moveDown(0.3);
    }
    doc.moveDown(0.5);
  }

  // Tech Stack
  const extractedTechStack = ((evaluation?.extractedTechStack ?? []) as Array<Record<string, unknown>>);
  if (extractedTechStack.length > 0) {
    ensureSpace(doc, 650, userEmail);
    addSubsectionHeader(doc, 'Technology Stack');

    const techNames = extractedTechStack.slice(0, 12).map(
      (t) => (t.technology ?? t) as string,
    );
    doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
      .text(techNames.join('  \u2022  '), MARGIN + 5, doc.y, { width: CONTENT_WIDTH - 10 });
    doc.moveDown(0.8);
  }
}

// ============================================================================
// TEAM TAB
// ============================================================================

function renderTeamTab(
  doc: PDFKit.PDFDocument,
  evaluation: PdfContext['evaluation'],
  teamData: Record<string, unknown> | null,
  userEmail: string,
): void {
  const teamScore = evaluation?.teamScore ?? 0;
  addScoreCard(doc, 'Team Score', teamScore, 20, BRAND_COLOR, userEmail);

  // Team Composition
  const teamComposition = (teamData?.teamComposition ?? evaluation?.teamComposition) as Record<string, unknown> | null;
  if (teamComposition) {
    ensureSpace(doc, 600, userEmail);
    addSubsectionHeader(doc, 'Team Composition');

    const isCovered = (value: unknown): boolean =>
      Boolean(
        value === true ||
          (value &&
            typeof value === 'object' &&
            (value as Record<string, unknown>).covered === true),
      );
    const roleY = doc.y;
    addRoleIndicator(
      doc,
      'Business/CEO Leader',
      Boolean(teamComposition.hasBusinessLeader) || isCovered(teamComposition.businessLeadership),
      MARGIN + 5,
      roleY,
    );
    addRoleIndicator(
      doc,
      'Technical/CTO Leader',
      Boolean(teamComposition.hasTechnicalLeader) || isCovered(teamComposition.technicalCapability),
      MARGIN + 250,
      roleY,
    );
    addRoleIndicator(
      doc,
      'Industry Expert',
      Boolean(teamComposition.hasIndustryExpert) || isCovered(teamComposition.domainExpertise),
      MARGIN + 5,
      roleY + 40,
    );
    addRoleIndicator(
      doc,
      'Operations Leader',
      Boolean(teamComposition.hasOperationsLeader ?? teamComposition.hasOperationsLead) ||
        isCovered(teamComposition.gtmCapability),
      MARGIN + 250,
      roleY + 40,
    );

    doc.y = roleY + 85;

    const teamBalance =
      (typeof teamComposition.teamBalance === 'string' && teamComposition.teamBalance) ||
      (typeof teamComposition.sentence === 'string' && teamComposition.sentence) ||
      (typeof teamComposition.reason === 'string' && teamComposition.reason) ||
      null;
    if (teamBalance) {
      doc.fontSize(9).font('Helvetica').fillColor(TEXT_SECONDARY)
        .text(teamBalance, MARGIN + 5, doc.y, { width: CONTENT_WIDTH - 10 });
      doc.moveDown(0.5);
    }
  }

  // Team Strengths & Risks
  const teamStrengths = ((teamData?.keyStrengths ?? []) as string[]);
  const teamRisks = ((teamData?.keyRisks ?? []) as string[]);
  addStrengthsRisksGrid(doc, teamStrengths, teamRisks, 'Team Strengths', 'Team Risks', userEmail);

  // Founder-Market Fit
  const founderMarketFit = teamData?.founderMarketFit as Record<string, unknown> | undefined;
  if (founderMarketFit?.assessment) {
    ensureSpace(doc, 680, userEmail);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_SECONDARY).text('Founder-Market Fit', MARGIN);
    doc.moveDown(0.2);
    doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
      .text(founderMarketFit.assessment as string, MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
  }

  // Team Member Profiles
  const founders = ((teamData?.founders ?? []) as Array<Record<string, unknown>>);
  if (founders.length > 0) {
    ensureSpace(doc, 680, userEmail);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_SECONDARY).text('Team Member Profiles', MARGIN);
    doc.moveDown(0.3);

    for (const founder of founders.slice(0, 4)) {
      ensureSpace(doc, 650, userEmail);
      let founderInfo = `${(founder.name ?? 'Unknown') as string}`;
      if (founder.role) founderInfo += ` - ${founder.role as string}`;
      doc.fontSize(10).font('Helvetica-Bold').fillColor(TEXT_PRIMARY).text(founderInfo, MARGIN + 10);

      if (founder.headline) {
        doc.fontSize(9).font('Helvetica-Oblique').fillColor(TEXT_SECONDARY)
          .text(founder.headline as string, MARGIN + 10, doc.y, { width: CONTENT_WIDTH - 20 });
      }

      // Experience
      const experience = (founder.experience ?? []) as Array<Record<string, unknown>>;
      if (Array.isArray(experience) && experience.length > 0) {
        doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_SECONDARY).text('Experience:', MARGIN + 20);
        for (const exp of experience.slice(0, 3)) {
          const expLine = `${(exp.title ?? '') as string} at ${(exp.company ?? '') as string}${exp.startDate ? ` (${exp.startDate as string}${exp.endDate ? ` - ${exp.endDate as string}` : ' - Present'})` : ''}`;
          doc.fontSize(8).font('Helvetica').fillColor(TEXT_MUTED)
            .text(`  \u2022 ${expLine}`, MARGIN + 20, doc.y, { width: CONTENT_WIDTH - 30 });
        }
      }

      // Education
      const education = (founder.education ?? []) as Array<Record<string, unknown>>;
      if (Array.isArray(education) && education.length > 0) {
        doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_SECONDARY).text('Education:', MARGIN + 20);
        for (const edu of education.slice(0, 2)) {
          const eduLine = `${(edu.school ?? '') as string}${edu.degree ? ` - ${edu.degree as string}` : ''}${edu.field ? ` in ${edu.field as string}` : ''}`;
          doc.fontSize(8).font('Helvetica').fillColor(TEXT_MUTED)
            .text(`  \u2022 ${eduLine}`, MARGIN + 20, doc.y, { width: CONTENT_WIDTH - 30 });
        }
      }

      doc.moveDown(0.5);
    }
    doc.moveDown(0.3);
  }
}

// ============================================================================
// COMPETITORS TAB
// ============================================================================

function renderCompetitorsTab(
  doc: PDFKit.PDFDocument,
  evaluation: PdfContext['evaluation'],
  competitiveData: Record<string, unknown> | null,
  userEmail: string,
): void {
  const competitiveScore = evaluation?.competitiveAdvantageScore ?? 0;
  addScoreCard(doc, 'Competitive Advantage Score', competitiveScore, 8, BRAND_COLOR, userEmail);

  // Strategic Positioning
  const positioning = competitiveData?.positioning as Record<string, unknown> | undefined;
  const competitivePositioning = competitiveData?.competitivePositioning as Record<string, unknown> | undefined;
  if (positioning || competitivePositioning) {
    ensureSpace(doc, 600, userEmail);
    addSubsectionHeader(doc, 'Strategic Positioning');

    const posY = doc.y;
    if (positioning?.strategy) {
      doc.rect(MARGIN + 5, posY, 230, 40).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fontSize(9).font('Helvetica').fillColor(TEXT_MUTED).text('Market Strategy', MARGIN + 15, posY + 8);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(TEXT_PRIMARY).text(positioning.strategy as string, MARGIN + 15, posY + 22);
    }

    if (competitivePositioning?.differentiationStrength) {
      doc.rect(MARGIN + 250, posY, 230, 40).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fontSize(9).font('Helvetica').fillColor(TEXT_MUTED).text('Differentiation Strength', MARGIN + 260, posY + 8);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(TEXT_PRIMARY)
        .text((competitivePositioning.differentiationStrength as string).toUpperCase(), MARGIN + 260, posY + 22);
    }

    doc.y = posY + 50;

    if (positioning?.differentiation) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_MUTED).text('Differentiation:', MARGIN + 5);
      doc.moveDown(0.2);
      doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
        .text(positioning.differentiation as string, MARGIN + 5, doc.y, { width: CONTENT_WIDTH - 10 });
      doc.moveDown(0.5);
    }

    if (positioning?.uniqueValueProp) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_MUTED).text('Unique Value Proposition:', MARGIN + 5);
      doc.moveDown(0.2);
      doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
        .text(positioning.uniqueValueProp as string, MARGIN + 5, doc.y, { width: CONTENT_WIDTH - 10 });
      doc.moveDown(0.5);
    }
  }

  // Strategic Recommendation
  if (competitivePositioning?.positioningRecommendation) {
    ensureSpace(doc, 650, userEmail);
    doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 24).fill('#e0f2fe');
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND_COLOR)
      .text('Strategic Recommendation', MARGIN + 8, doc.y + 6);
    doc.y += 32;
    doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
      .text(competitivePositioning.positioningRecommendation as string, MARGIN + 5, doc.y, { width: CONTENT_WIDTH - 10 });
    doc.moveDown(0.8);
  }

  // Barriers to Entry
  const barriersToEntry = (competitiveData?.barriersToEntry ?? competitiveData?.['4_barriers_to_entry']) as Record<string, unknown> | undefined;
  if (barriersToEntry && (barriersToEntry.technical || barriersToEntry.regulatory || barriersToEntry.capital || barriersToEntry.network)) {
    ensureSpace(doc, 580, userEmail);
    addSubsectionHeader(doc, 'Barriers to Entry');

    const barrierY = doc.y;
    let barrierRow = 0;
    const barriers = [
      { label: 'Technical', value: barriersToEntry.technical as string | undefined },
      { label: 'Capital Requirements', value: barriersToEntry.capital as string | undefined },
      { label: 'Network Effects', value: barriersToEntry.network as string | undefined },
      { label: 'Regulatory', value: barriersToEntry.regulatory as string | undefined },
    ];

    for (const barrier of barriers) {
      if (!barrier.value) continue;
      const col = barrierRow % 2;
      const x = col === 0 ? MARGIN + 5 : MARGIN + 250;
      const y = barrierY + (Math.floor(barrierRow / 2) * 50);

      doc.rect(x, y, 230, 45).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_MUTED).text(barrier.label, x + 10, y + 8);
      doc.fontSize(8).font('Helvetica').fillColor(TEXT_PRIMARY).text(barrier.value, x + 10, y + 22, { width: 210 });
      barrierRow++;
    }
    doc.y = barrierY + (Math.ceil(barrierRow / 2) * 50) + 10;
  }

  // Competitive Advantages & Risks
  const advantages = (
    (competitiveData?.competitiveAdvantages as string[] | undefined) ??
    (competitivePositioning?.startupAdvantages as string[] | undefined) ??
    (competitiveData?.keyStrengths as string[] | undefined) ??
    []
  );
  const disadvantages = (
    (competitiveData?.competitiveDisadvantages as string[] | undefined) ??
    (competitivePositioning?.startupDisadvantages as string[] | undefined) ??
    (competitiveData?.keyRisks as string[] | undefined) ??
    []
  );
  addStrengthsRisksGrid(doc, advantages, disadvantages, 'Competitive Advantages', 'Competitive Risks', userEmail);

  // Direct Competitors
  const directCompetitorProfiles = (competitiveData?.competitorProfiles ?? []) as Array<Record<string, unknown>>;
  const directCompetitorsList = ((competitiveData?.['3_competitor_analysis'] as Record<string, unknown>)?.direct_competitors ?? []) as Array<Record<string, unknown>>;
  const directCompetitors = directCompetitorProfiles.length > 0 ? directCompetitorProfiles : directCompetitorsList;
  const basicLandscape = competitiveData?.competitorLandscape as Record<string, unknown> | undefined;
  const basicDirectCompetitors = ((basicLandscape?.directCompetitors ?? []) as string[]);

  if (directCompetitors.length > 0 || basicDirectCompetitors.length > 0) {
    ensureSpace(doc, 650, userEmail);
    const count = directCompetitors.length || basicDirectCompetitors.length;
    doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 24).fill('#fef2f2');
    doc.fontSize(11).font('Helvetica-Bold').fillColor(DANGER_COLOR)
      .text(`Direct Competitors (${count})`, MARGIN + 8, doc.y + 6);
    doc.y += 32;

    const directNames = basicDirectCompetitors.length > 0
      ? basicDirectCompetitors
      : directCompetitors.map((c) => (c.name ?? c.category ?? c) as string);
    doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
      .text(directNames.slice(0, 10).join('  \u2022  '), MARGIN + 5, doc.y, { width: CONTENT_WIDTH - 10 });
    doc.moveDown(0.8);
  }

  // Indirect Competitors
  const indirectCompetitorProfiles = (competitiveData?.indirectCompetitorProfiles ?? []) as Array<Record<string, unknown>>;
  const indirectCompetitorsList = ((competitiveData?.['3_competitor_analysis'] as Record<string, unknown>)?.adjacent_indirect_competitors ?? []) as Array<Record<string, unknown>>;
  const indirectCompetitors = indirectCompetitorProfiles.length > 0 ? indirectCompetitorProfiles : indirectCompetitorsList;
  const basicIndirectCompetitors = ((basicLandscape?.indirectCompetitors ?? []) as string[]);

  if (indirectCompetitors.length > 0 || basicIndirectCompetitors.length > 0) {
    ensureSpace(doc, 650, userEmail);
    const count = indirectCompetitors.length || basicIndirectCompetitors.length;
    doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 24).fill('#fef3c7');
    doc.fontSize(11).font('Helvetica-Bold').fillColor(WARNING_COLOR)
      .text(`Indirect Competitors (${count})`, MARGIN + 8, doc.y + 6);
    doc.y += 32;

    const indirectNames = basicIndirectCompetitors.length > 0
      ? basicIndirectCompetitors
      : indirectCompetitors.map((c) => (c.name ?? c.category ?? c) as string);
    doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
      .text(indirectNames.slice(0, 10).join('  \u2022  '), MARGIN + 5, doc.y, { width: CONTENT_WIDTH - 10 });
    doc.moveDown(0.8);
  }

  // Market Landscape
  const marketLandscape = competitiveData?.marketLandscape as Record<string, unknown> | undefined;
  if (marketLandscape) {
    const trends = (marketLandscape.marketTrends ?? []) as string[];
    if (trends.length > 0) {
      ensureSpace(doc, 680, userEmail);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_SECONDARY).text('Market Trends', MARGIN);
      doc.moveDown(0.3);
      addBulletList(doc, trends.slice(0, 4), userEmail);
    }

    const threats = (marketLandscape.emergingThreats ?? []) as string[];
    if (threats.length > 0) {
      ensureSpace(doc, 680, userEmail);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(WARNING_COLOR).text('Emerging Threats', MARGIN);
      doc.moveDown(0.3);
      addBulletList(doc, threats.slice(0, 4), userEmail);
    }
  }
}

// ============================================================================
// SOURCES TAB
// ============================================================================

function _renderSourcesTab(
  doc: PDFKit.PDFDocument,
  sources: Array<Record<string, unknown>>,
  userEmail: string,
): void {
  // Header card
  doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 40).fill('#f1f5f9');
  doc.fontSize(12).font('Helvetica-Bold').fillColor(TEXT_PRIMARY)
    .text('Data Sources', MARGIN + 8, doc.y + 8);
  doc.fontSize(9).font('Helvetica').fillColor(TEXT_MUTED)
    .text('All sources used by AI agents to generate this evaluation', MARGIN + 8, doc.y + 24);
  doc.y += 50;

  const groups: { title: string; color: string; category: string }[] = [
    { title: 'Documents', color: '#3b82f6', category: 'document' },
    { title: 'Websites', color: '#22c55e', category: 'website' },
    { title: 'LinkedIn Profiles', color: '#0a66c2', category: 'linkedin' },
    { title: 'AI Analysis Agents', color: '#a855f7', category: 'api' },
    { title: 'Database Records', color: '#f97316', category: 'database' },
  ];

  for (const group of groups) {
    const groupSources = sources.filter((s) => s.category === group.category);
    if (groupSources.length === 0) continue;

    ensureSpace(doc, 650, userEmail);
    doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 24).fill('#f1f5f9');
    doc.fontSize(10).font('Helvetica-Bold').fillColor(group.color)
      .text(group.title, MARGIN + 8, doc.y + 6);
    doc.y += 32;

    for (const source of groupSources.slice(0, 8)) {
      ensureSpace(doc, 720, userEmail);
      doc.rect(MARGIN + 5, doc.y, CONTENT_WIDTH - 10, 30).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_PRIMARY)
        .text((source.name ?? source.agent ?? '') as string, MARGIN + 15, doc.y + 6);
      if (source.description || source.url) {
        doc.fontSize(8).font('Helvetica').fillColor(TEXT_MUTED)
          .text(((source.description ?? source.url) as string), MARGIN + 15, doc.y + 18, { width: CONTENT_WIDTH - 90 });
      }
      if (source.agent && source.name) {
        doc.fontSize(7).font('Helvetica').fillColor(TEXT_MUTED)
          .text(source.agent as string, MARGIN + CONTENT_WIDTH - 80, doc.y + 10, { width: 60, align: 'right' });
      }
      doc.y += 35;
    }
    doc.moveDown(0.3);
  }
}

// ============================================================================
// SECTION SCORES
// ============================================================================

function renderSectionScores(
  doc: PDFKit.PDFDocument,
  evaluation: PdfContext['evaluation'],
  userEmail: string,
): void {
  ensureSpace(doc, 580, userEmail);
  addSubsectionHeader(doc, 'Section Scores');

  const sectionScores = [
    { name: 'Team', score: evaluation?.teamScore, weight: 20 },
    { name: 'Market', score: evaluation?.marketScore, weight: 15 },
    { name: 'Product', score: evaluation?.productScore, weight: 10 },
    { name: 'Traction', score: evaluation?.tractionScore, weight: 10 },
    { name: 'Business Model', score: evaluation?.businessModelScore, weight: 10 },
    { name: 'Go-to-Market', score: evaluation?.gtmScore, weight: 8 },
    { name: 'Competitive Advantage', score: evaluation?.competitiveAdvantageScore, weight: 8 },
    { name: 'Financials', score: evaluation?.financialsScore, weight: 7 },
    { name: 'Legal', score: evaluation?.legalScore, weight: 5 },
    { name: 'Deal Terms', score: evaluation?.dealTermsScore, weight: 5 },
    { name: 'Exit Potential', score: evaluation?.exitPotentialScore, weight: 2 },
  ];

  const scoreStartY = doc.y;
  let scoreRow = 0;
  for (const section of sectionScores) {
    if (section.score === null || section.score === undefined) continue;

    const col = scoreRow % 2;
    const x = col === 0 ? MARGIN + 5 : MARGIN + 250;
    const y = scoreStartY + (Math.floor(scoreRow / 2) * 30);

    doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
      .text(`${section.name} (${section.weight}%)`, x, y, { width: 150 });

    // Progress bar
    const barWidth = 80;
    const barHeight = 8;
    doc.rect(x + 150, y + 2, barWidth, barHeight).fill('#e5e7eb');
    doc.rect(x + 150, y + 2, barWidth * (section.score / 100), barHeight).fill(getScoreColor(section.score));

    doc.fontSize(9).font('Helvetica-Bold').fillColor(getScoreColor(section.score))
      .text(`${section.score.toFixed(0)}`, x + 235, y);

    scoreRow++;
  }
  doc.y = scoreStartY + (Math.ceil(scoreRow / 2) * 30) + 15;
}

// ============================================================================
// SHARED DRAWING HELPERS
// ============================================================================

function addWatermark(doc: PDFKit.PDFDocument, userEmail: string): void {
  doc.save();
  doc.opacity(0.04);
  doc.fontSize(14);
  doc.font('Helvetica');
  doc.fillColor('#000000');
  doc.rotate(-45, { origin: [300, 400] });

  for (let y = 100; y < 700; y += 120) {
    for (let x = 0; x < 600; x += 250) {
      doc.text(userEmail, x, y, { width: 240, align: 'center' });
    }
  }

  doc.restore();
}

function addReportSection(doc: PDFKit.PDFDocument, title: string, userEmail?: string): void {
  ensureSpace(doc, 680, userEmail);

  const sectionStartY = doc.y;
  doc.rect(MARGIN, sectionStartY, CONTENT_WIDTH, 28).fill(BRAND_COLOR);

  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .fillColor('#ffffff')
    .text(title, MARGIN + 10, sectionStartY + 7);

  doc.y = sectionStartY + 38;
}

function addSubsectionHeader(doc: PDFKit.PDFDocument, title: string): void {
  doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 24).fill('#f1f5f9');
  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .fillColor(TEXT_SECONDARY)
    .text(title, MARGIN + 8, doc.y + 6);
  doc.y += 32;
}

function addReportHeader(
  doc: PDFKit.PDFDocument,
  startupName: string,
  pageNum: number,
  totalPages: number,
): void {
  const headerY = 25;

  doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND_COLOR)
    .text('INSIDELINE.AI', MARGIN, headerY);

  doc.fontSize(8).font('Helvetica').fillColor(TEXT_MUTED)
    .text(`${startupName} | Analysis Report`, MARGIN, headerY, { align: 'center', width: CONTENT_WIDTH });

  doc.fontSize(8).font('Helvetica').fillColor(TEXT_MUTED)
    .text(`${pageNum}/${totalPages}`, MARGIN, headerY, { align: 'right', width: CONTENT_WIDTH });

  doc.strokeColor('#e5e5e5').lineWidth(0.5)
    .moveTo(MARGIN, headerY + 15).lineTo(PAGE_WIDTH - MARGIN, headerY + 15).stroke();
}

function addFooter(doc: PDFKit.PDFDocument, timestamp: string): void {
  const footerY = doc.page.height - 35;

  doc.strokeColor('#e5e5e5').lineWidth(0.5)
    .moveTo(MARGIN, footerY - 5).lineTo(PAGE_WIDTH - MARGIN, footerY - 5).stroke();

  doc.fontSize(7).font('Helvetica').fillColor(TEXT_MUTED)
    .text(
      `Generated: ${timestamp} | CONFIDENTIAL - For authorized recipients only`,
      MARGIN,
      footerY,
      { align: 'center', width: CONTENT_WIDTH },
    );
}

function addScoreCard(
  doc: PDFKit.PDFDocument,
  title: string,
  score: number,
  weight: number,
  iconColor: string,
  userEmail?: string,
): void {
  ensureSpace(doc, 680, userEmail);

  const cardY = doc.y;
  doc.rect(MARGIN, cardY, CONTENT_WIDTH, 50).fill('#f8fafc').stroke('#e2e8f0');

  doc.circle(MARGIN + 35, cardY + 25, 15).fillAndStroke(iconColor, iconColor);

  doc.fontSize(12).font('Helvetica-Bold').fillColor(TEXT_PRIMARY).text(title, MARGIN + 60, cardY + 12);
  doc.fontSize(9).font('Helvetica').fillColor(TEXT_MUTED)
    .text(`${weight}% weight in overall evaluation`, MARGIN + 60, cardY + 28);

  doc.fontSize(24).font('Helvetica-Bold').fillColor(getScoreColor(score))
    .text(`${score}`, MARGIN + CONTENT_WIDTH - 80, cardY + 12, { width: 60, align: 'right' });
  doc.fontSize(10).font('Helvetica').fillColor(TEXT_MUTED)
    .text('/100', MARGIN + CONTENT_WIDTH - 18, cardY + 20);

  doc.y = cardY + 60;
}

function addStrengthsRisksGrid(
  doc: PDFKit.PDFDocument,
  strengths: string[],
  risks: string[],
  strengthsTitle: string,
  risksTitle: string,
  userEmail?: string,
): void {
  if (!strengths.length && !risks.length) return;

  ensureSpace(doc, 580, userEmail);

  const startY = doc.y;
  const colWidth = 240;

  if (strengths.length > 0) {
    doc.rect(MARGIN, startY, colWidth, 24).fill('#f0fdf4');
    doc.fontSize(10).font('Helvetica-Bold').fillColor(SUCCESS_COLOR)
      .text(strengthsTitle, MARGIN + 10, startY + 7);

    doc.y = startY + 30;
    for (const item of strengths.slice(0, 5)) {
      doc.circle(MARGIN + 10, doc.y + 4, 3).fill(SUCCESS_COLOR);
      doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
        .text(item, MARGIN + 20, doc.y, { width: colWidth - 25 });
      doc.moveDown(0.3);
    }
  }

  if (risks.length > 0) {
    doc.rect(MARGIN + 255, startY, colWidth, 24).fill('#fef2f2');
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DANGER_COLOR)
      .text(risksTitle, MARGIN + 265, startY + 7);

    let riskY = startY + 30;
    for (const item of risks.slice(0, 5)) {
      doc.polygon(
        [MARGIN + 265, riskY + 7],
        [MARGIN + 268, riskY + 1],
        [MARGIN + 271, riskY + 7],
      ).fill(WARNING_COLOR);
      doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
        .text(item, MARGIN + 275, riskY, { width: colWidth - 25 });
      riskY += doc.heightOfString(item, { width: colWidth - 25 }) + 4;
    }
  }

  // Calculate actual heights
  let strengthsHeight = 30;
  for (const item of strengths.slice(0, 5)) {
    strengthsHeight += doc.heightOfString(item, { width: 215 }) + 4;
  }
  let risksHeight = 30;
  for (const item of risks.slice(0, 5)) {
    risksHeight += doc.heightOfString(item, { width: 215 }) + 4;
  }

  doc.y = startY + Math.max(strengthsHeight, risksHeight) + 10;
}

function addRoleIndicator(
  doc: PDFKit.PDFDocument,
  label: string,
  hasRole: boolean,
  x: number,
  y: number,
): void {
  const bgColor = hasRole ? '#dcfce7' : '#fee2e2';
  const borderColor = hasRole ? '#86efac' : '#fca5a5';

  doc.rect(x, y, 235, 32).fillAndStroke(bgColor, borderColor);
  if (hasRole) {
    doc.circle(x + 15, y + 16, 5).fill(SUCCESS_COLOR);
  } else {
    doc.circle(x + 15, y + 16, 5).stroke(DANGER_COLOR);
  }
  doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY)
    .text(label, x + 30, y + 10, { width: 190 });
}

function addBulletList(
  doc: PDFKit.PDFDocument,
  items: string[],
  userEmail?: string,
): void {
  for (const item of items) {
    ensureSpace(doc, 720, userEmail);
    doc.fontSize(10).font('Helvetica').fillColor(TEXT_PRIMARY)
      .text(`\u2022 ${item}`, MARGIN + 10, doc.y, { width: CONTENT_WIDTH - 20 });
    doc.moveDown(0.2);
  }
  doc.moveDown(0.5);
}

function render2ColGrid(doc: PDFKit.PDFDocument, items: { label: string; value: string }[]): void {
  const gridStartY = doc.y;
  let currentRow = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const x = i % 2 === 0 ? MARGIN + 5 : MARGIN + 250;
    const y = gridStartY + (Math.floor(i / 2) * 20);

    doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT_MUTED).text(item.label, x, y);
    doc.fontSize(9).font('Helvetica').fillColor(TEXT_PRIMARY).text(item.value, x + 90, y, { width: 140 });

    currentRow = Math.floor(i / 2);
  }
  doc.y = gridStartY + ((currentRow + 1) * 20) + 10;
}

function ensureSpace(doc: PDFKit.PDFDocument, threshold: number, userEmail?: string): void {
  if (doc.y > threshold) {
    doc.addPage();
    if (userEmail) addWatermark(doc, userEmail);
    doc.y = 70;
  }
}
