import PDFDocument from 'pdfkit';
import type { PdfContext } from './pdf.types';
import { sanitizeNarrativeText } from '../../ai/services/narrative-sanitizer';
import {
  BRAND_COLOR,
  BRAND_COLOR_DARK,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_MUTED,
  getScoreColor,
  getScoreLabel,
  formatCurrency,
  getSummaryFromData,
} from './pdf.types';

// Layout constants
const MARGIN = 50;
const PAGE_WIDTH = 595; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export function generateMemoDocument(ctx: PdfContext): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 60, bottom: 50, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: `${ctx.startup.name} - Investment Memo`,
      Author: 'InsideLine.AI',
      Subject: 'AI-Generated Investment Memo',
      Keywords: 'investment, memo, startup, analysis',
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
  const investorMemo = evaluation?.investorMemo as Record<string, unknown> | null;
  const teamData = evaluation?.teamData as Record<string, unknown> | null;
  const marketData = evaluation?.marketData as Record<string, unknown> | null;
  const productData = evaluation?.productData as Record<string, unknown> | null;
  const businessModelData = evaluation?.businessModelData as Record<string, unknown> | null;
  const tractionData = evaluation?.tractionData as Record<string, unknown> | null;
  const gtmData = evaluation?.gtmData as Record<string, unknown> | null;
  const competitiveAdvantageData = evaluation?.competitiveAdvantageData as Record<string, unknown> | null;
  const financialsData = evaluation?.financialsData as Record<string, unknown> | null;
  const dealTermsData = evaluation?.dealTermsData as Record<string, unknown> | null;
  const legalData = evaluation?.legalData as Record<string, unknown> | null;
  const exitPotentialData = evaluation?.exitPotentialData as Record<string, unknown> | null;

  // ========== WATERMARK ==========
  addWatermark(doc, userEmail);

  // ========== TITLE PAGE ==========
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
    .text('Investment Memo', MARGIN, doc.y, { align: 'center', width: CONTENT_WIDTH });
  doc.moveDown(0.8);

  doc
    .fontSize(22)
    .font('Helvetica-Bold')
    .fillColor(TEXT_PRIMARY)
    .text(startup.name, MARGIN, doc.y, { align: 'center', width: CONTENT_WIDTH });
  doc.moveDown(0.5);

  // Overall score box
  const overallScore = evaluation?.overallScore ?? startup.overallScore ?? 0;
  const scoreColor = getScoreColor(overallScore);
  const scoreLabel = getScoreLabel(overallScore);

  const boxWidth = 195;
  const boxX = (PAGE_WIDTH - boxWidth) / 2;
  const scoreBoxY = doc.y;

  doc.rect(boxX, scoreBoxY, boxWidth, 55).fill('#f8fafc').stroke('#e2e8f0');

  doc
    .fontSize(32)
    .font('Helvetica-Bold')
    .fillColor(scoreColor)
    .text(overallScore.toFixed(0), boxX, scoreBoxY + 8, { align: 'center', width: boxWidth });
  doc
    .fontSize(11)
    .font('Helvetica')
    .fillColor(TEXT_SECONDARY)
    .text(`${scoreLabel} Investment`, boxX, scoreBoxY + 40, { align: 'center', width: boxWidth });

  doc.y = scoreBoxY + 70;

  // Meta items
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

  doc.moveDown(1.2);

  const lineX = (PAGE_WIDTH - 195) / 2;
  doc
    .strokeColor(BRAND_COLOR)
    .lineWidth(2)
    .moveTo(lineX, doc.y)
    .lineTo(lineX + 195, doc.y)
    .stroke();
  doc.moveDown(1.5);

  // ========== SECTIONS ==========

  // Executive Summary
  const executiveSummary =
    sanitizeNarrativeText(
      evaluation?.executiveSummary ??
        (investorMemo?.summary as string | undefined) ??
        startup.description,
    );
  addMemoSection(
    doc,
    'Executive Summary',
    executiveSummary,
    null,
    undefined,
    investorMemo?.rationale
      ? [{ label: 'Investment Rationale:', text: investorMemo.rationale as string }]
      : undefined,
    userEmail,
  );

  // Team (20%)
  const teamNarrative =
    (teamData?.memoNarrative as string | undefined) ?? getSummaryFromData(teamData);
  const teamAdditional: { label: string; text: string }[] = [];

  const founders = (teamData?.founders ?? []) as Array<Record<string, unknown>>;
  if (founders.length > 0) {
    const founderSummaries: string[] = [];
    for (const founder of founders.slice(0, 4)) {
      if (founder.name) {
        let founderInfo = `${founder.name}`;
        if (founder.role) founderInfo += ` (${founder.role})`;
        if (founder.background || founder.experience) {
          founderInfo += `: ${(founder.background ?? founder.experience) as string}`;
        }
        founderSummaries.push(founderInfo);
      }
    }
    if (founderSummaries.length > 0) {
      teamAdditional.push({ label: 'Key Team Members:', text: founderSummaries.join('\n') });
    }
  }

  const founderMarketFit = teamData?.founderMarketFit as Record<string, unknown> | undefined;
  if (founderMarketFit?.assessment) {
    teamAdditional.push({
      label: 'Founder-Market Fit:',
      text: founderMarketFit.assessment as string,
    });
  }

  const teamComposition = teamData?.teamComposition as Record<string, unknown> | undefined;
  if (teamComposition) {
    const compParts: string[] = [];
    if (teamComposition.hasBusinessLeader) compParts.push('Business Leader');
    if (teamComposition.hasTechnicalLeader) compParts.push('Technical Leader');
    if (teamComposition.hasIndustryExpert) compParts.push('Industry Expert');
    if (compParts.length > 0) {
      teamAdditional.push({ label: 'Team Composition:', text: compParts.join(', ') });
    }
  }

  addMemoSection(
    doc,
    'Team',
    teamNarrative,
    evaluation?.teamScore,
    '20%',
    teamAdditional.length > 0 ? teamAdditional : undefined,
    userEmail,
  );

  // Market Opportunity (15%)
  addMemoSection(
    doc,
    'Market Opportunity',
    getSummaryFromData(marketData),
    evaluation?.marketScore,
    '15%',
    (marketData?.whyNow as string | undefined)
      ? [{ label: 'Why Now:', text: marketData!.whyNow as string }]
      : undefined,
    userEmail,
  );

  // Product & Technology (10%)
  addMemoSection(
    doc,
    'Product & Technology',
    getSummaryFromData(productData),
    evaluation?.productScore,
    '10%',
    undefined,
    userEmail,
  );

  // Business Model (10%)
  addMemoSection(
    doc,
    'Business Model',
    getSummaryFromData(businessModelData),
    evaluation?.businessModelScore,
    '10%',
    undefined,
    userEmail,
  );

  // Traction & Metrics (10%)
  addMemoSection(
    doc,
    'Traction & Metrics',
    getSummaryFromData(tractionData),
    evaluation?.tractionScore,
    '10%',
    undefined,
    userEmail,
  );

  // Go-to-Market Strategy (8%)
  addMemoSection(
    doc,
    'Go-to-Market Strategy',
    getSummaryFromData(gtmData),
    evaluation?.gtmScore,
    '8%',
    undefined,
    userEmail,
  );

  // Competitive Landscape (8%)
  addMemoSection(
    doc,
    'Competitive Landscape',
    getSummaryFromData(competitiveAdvantageData),
    evaluation?.competitiveAdvantageScore,
    '8%',
    undefined,
    userEmail,
  );

  // Financials (7%)
  addMemoSection(
    doc,
    'Financials',
    getSummaryFromData(financialsData),
    evaluation?.financialsScore,
    '7%',
    undefined,
    userEmail,
  );

  // Funding History (if available)
  if (startup.valuation || startup.fundingTarget) {
    const fundingParts: string[] = [];
    if (startup.stage) fundingParts.push(`Current Round: ${startup.stage.replace(/_/g, ' ').toUpperCase()}`);
    fundingParts.push(`Funding Target: ${formatCurrency(startup.fundingTarget)}`);
    if (startup.valuation) fundingParts.push(`Valuation: ${formatCurrency(startup.valuation)}`);
    addMemoSection(doc, 'Funding History', fundingParts.join('\n'), null, undefined, undefined, userEmail);
  }

  // Deal Terms (5%)
  addMemoSection(
    doc,
    'Deal Terms',
    getSummaryFromData(dealTermsData),
    evaluation?.dealTermsScore,
    '5%',
    undefined,
    userEmail,
  );

  // Legal & Regulatory (5%)
  addMemoSection(
    doc,
    'Legal & Regulatory',
    getSummaryFromData(legalData),
    evaluation?.legalScore,
    '5%',
    undefined,
    userEmail,
  );

  // Exit Potential (2%)
  addMemoSection(
    doc,
    'Exit Potential',
    getSummaryFromData(exitPotentialData),
    evaluation?.exitPotentialScore,
    '2%',
    undefined,
    userEmail,
  );

  // Due Diligence Areas
  const dueDiligenceAreas = (investorMemo?.dueDiligenceAreas ?? []) as string[];
  if (dueDiligenceAreas.length > 0) {
    ensureSpace(doc, 600, userEmail);

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor(BRAND_COLOR)
      .text('Due Diligence Areas');
    doc.moveDown(0.4);

    for (const area of dueDiligenceAreas) {
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(TEXT_PRIMARY)
        .text(`\u2022 ${area}`, { indent: 10, width: CONTENT_WIDTH - 10 });
    }
    doc.moveDown(1);
  }

  // Key Recommendations
  const recommendations = (evaluation?.recommendations ?? []) as string[];
  if (recommendations.length > 0) {
    ensureSpace(doc, 600, userEmail);

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor(BRAND_COLOR)
      .text('Key Recommendations');
    doc.moveDown(0.4);

    for (let i = 0; i < Math.min(recommendations.length, 6); i++) {
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(TEXT_PRIMARY)
        .text(`${i + 1}. ${recommendations[i]}`, { indent: 10, width: CONTENT_WIDTH - 10 });
      doc.moveDown(0.2);
    }
  }

  // ========== HEADERS & FOOTERS ==========
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    if (i > 0) {
      addHeader(doc, startup.name, i + 1, pages.count);
    }
    addFooter(doc, timestamp);
  }

  return doc;
}

// ============================================================================
// HELPER FUNCTIONS
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

function addHeader(
  doc: PDFKit.PDFDocument,
  startupName: string,
  pageNum: number,
  totalPages: number,
): void {
  const headerY = 25;

  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor(BRAND_COLOR)
    .text('INSIDELINE.AI', MARGIN, headerY);

  doc
    .fontSize(8)
    .font('Helvetica')
    .fillColor(TEXT_MUTED)
    .text(`${startupName} | Investment Memo`, MARGIN, headerY, {
      align: 'center',
      width: CONTENT_WIDTH,
    });

  doc
    .fontSize(8)
    .font('Helvetica')
    .fillColor(TEXT_MUTED)
    .text(`${pageNum}/${totalPages}`, MARGIN, headerY, {
      align: 'right',
      width: CONTENT_WIDTH,
    });

  doc
    .strokeColor('#e5e5e5')
    .lineWidth(0.5)
    .moveTo(MARGIN, headerY + 15)
    .lineTo(PAGE_WIDTH - MARGIN, headerY + 15)
    .stroke();
}

function addFooter(doc: PDFKit.PDFDocument, timestamp: string): void {
  const footerY = doc.page.height - 35;

  doc
    .strokeColor('#e5e5e5')
    .lineWidth(0.5)
    .moveTo(MARGIN, footerY - 5)
    .lineTo(PAGE_WIDTH - MARGIN, footerY - 5)
    .stroke();

  doc
    .fontSize(7)
    .font('Helvetica')
    .fillColor(TEXT_MUTED)
    .text(
      `Generated: ${timestamp} | CONFIDENTIAL - For authorized recipients only`,
      MARGIN,
      footerY,
      { align: 'center', width: CONTENT_WIDTH },
    );
}

function addMemoSection(
  doc: PDFKit.PDFDocument,
  title: string,
  content: string | null,
  score?: number | null,
  weight?: string,
  additionalContent?: { label: string; text: string }[],
  userEmail?: string,
): boolean {
  if (!content && (!additionalContent || additionalContent.length === 0)) {
    return false;
  }

  ensureSpace(doc, 680, userEmail);

  const sectionStartY = doc.y;
  doc.rect(MARGIN, sectionStartY, CONTENT_WIDTH, 24).fill('#f8fafc');

  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .fillColor(BRAND_COLOR_DARK)
    .text(title, MARGIN + 10, sectionStartY + 6, { continued: !!weight });

  if (weight) {
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(TEXT_MUTED)
      .text(`  (Weight: ${weight})`, { continued: false });
  }

  if (score !== null && score !== undefined) {
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(getScoreColor(score))
      .text(`${score.toFixed(0)}/100`, MARGIN + CONTENT_WIDTH - 80, sectionStartY + 6, {
        width: 70,
        align: 'right',
      });
  }

  doc.y = sectionStartY + 30;

  if (content) {
    const sanitizedContent = sanitizeNarrativeText(content);
    if (sanitizedContent.length > 0) {
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(TEXT_PRIMARY)
        .text(sanitizedContent, MARGIN, doc.y, {
          align: 'justify',
          lineGap: 2,
          width: CONTENT_WIDTH,
        });
      doc.moveDown(0.5);
    }
  }

  if (additionalContent && additionalContent.length > 0) {
    for (const item of additionalContent) {
      const sanitizedItemText = sanitizeNarrativeText(item.text);
      if (sanitizedItemText.length > 0) {
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor(TEXT_SECONDARY)
          .text(item.label, MARGIN);
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor(TEXT_PRIMARY)
          .text(sanitizedItemText, MARGIN, doc.y, {
            align: 'justify',
            lineGap: 2,
            width: CONTENT_WIDTH,
          });
        doc.moveDown(0.3);
      }
    }
  }

  doc.moveDown(0.8);
  return true;
}

function ensureSpace(
  doc: PDFKit.PDFDocument,
  threshold: number,
  userEmail?: string,
): void {
  if (doc.y > threshold) {
    doc.addPage();
    if (userEmail) addWatermark(doc, userEmail);
    doc.y = 70;
  }
}
