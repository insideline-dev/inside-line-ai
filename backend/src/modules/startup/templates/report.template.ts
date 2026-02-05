import PDFDocument from 'pdfkit';
import type { StartupWithAnalysis } from './memo.template';

interface ReportContext {
  startup: StartupWithAnalysis;
  userEmail: string;
  generatedAt: Date;
}

// Color utilities
function getScoreColor(score: number): string {
  if (score >= 70) return '#22c55e'; // green
  if (score >= 50) return '#eab308'; // yellow
  return '#ef4444'; // red
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 60) return 'Above Average';
  if (score >= 50) return 'Average';
  if (score >= 40) return 'Below Average';
  return 'Needs Improvement';
}

// Layout constants
const MARGIN = 50;
const PAGE_WIDTH = 612;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export function generateReportDocument(ctx: ReportContext): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
  });

  const { startup, userEmail, generatedAt } = ctx;
  const analysis = startup.analysis ?? {};

  // Cover Page
  renderCoverPage(doc, startup, generatedAt);

  // Table of Contents
  doc.addPage();
  renderTableOfContents(doc);

  // Executive Summary
  doc.addPage();
  renderExecutiveSummary(doc, startup, analysis);

  // Detailed Scoring Breakdown
  doc.addPage();
  renderScoringBreakdown(doc, analysis);

  // Team Analysis
  if (analysis.teamAnalysis || analysis.founders?.length) {
    checkPageBreak(doc);
    renderDetailedSection(doc, 'Team Analysis', analysis.teamScore, analysis.teamAnalysis, {
      founders: analysis.founders,
    });
  }

  // Market Analysis
  if (analysis.marketAnalysis || analysis.marketSize) {
    checkPageBreak(doc);
    renderDetailedSection(doc, 'Market Analysis', analysis.marketScore, analysis.marketAnalysis, {
      marketSize: analysis.marketSize,
      targetMarket: analysis.targetMarket,
    });
  }

  // Product Analysis
  if (analysis.productAnalysis || startup.description) {
    checkPageBreak(doc);
    renderDetailedSection(doc, 'Product Analysis', analysis.productScore, analysis.productAnalysis, {
      description: startup.description,
      stage: startup.stage,
    });
  }

  // Traction Analysis
  if (analysis.tractionAnalysis || analysis.keyMetrics?.length) {
    checkPageBreak(doc);
    renderDetailedSection(doc, 'Traction Analysis', analysis.tractionScore, analysis.tractionAnalysis, {
      metrics: analysis.keyMetrics,
    });
  }

  // Financial Analysis
  if (analysis.financialAnalysis || startup.fundingTarget) {
    checkPageBreak(doc);
    renderDetailedSection(doc, 'Financial Analysis', analysis.financialScore, analysis.financialAnalysis, {
      fundingTarget: startup.fundingTarget,
      amountRaised: analysis.amountRaised,
      stage: startup.stage,
    });
  }

  // Risk Factors (if available in analysis)
  renderRiskFactors(doc, analysis);

  // Footer on all pages
  addFooter(doc, userEmail, generatedAt);

  return doc;
}

function renderCoverPage(doc: PDFKit.PDFDocument, startup: StartupWithAnalysis, date: Date): void {
  // Logo at top
  doc.y = 100;
  doc
    .fontSize(28)
    .fillColor('#1f2937')
    .text('INSIDE LINE', { align: 'center' });

  doc
    .fontSize(12)
    .fillColor('#6b7280')
    .text('Investment Intelligence Platform', { align: 'center' });

  // Main title area
  doc.y = 280;

  doc
    .fontSize(32)
    .fillColor('#111827')
    .text('Analysis Report', { align: 'center' });

  doc.moveDown(0.5);

  doc
    .fontSize(24)
    .fillColor('#374151')
    .text(startup.name, { align: 'center' });

  doc.moveDown(2);

  // Score display
  if (startup.analysis?.overallScore !== undefined) {
    const score = startup.analysis.overallScore;
    const scoreColor = getScoreColor(score);
    const scoreLabel = getScoreLabel(score);

    // Center the score box
    const boxX = (PAGE_WIDTH - 120) / 2;
    const boxY = doc.y;

    doc
      .roundedRect(boxX, boxY, 120, 60, 8)
      .fill(scoreColor);

    doc
      .fontSize(36)
      .fillColor('#ffffff')
      .text(score.toString(), boxX, boxY + 8, { width: 120, align: 'center' });

    doc
      .fontSize(12)
      .fillColor('#ffffff')
      .text(scoreLabel, boxX, boxY + 42, { width: 120, align: 'center' });

    doc.y = boxY + 80;
  }

  // Meta info
  doc.y = 550;
  doc
    .fontSize(10)
    .fillColor('#6b7280')
    .text(`Industry: ${startup.industry}`, { align: 'center' });

  doc.text(`Stage: ${startup.stage}`, { align: 'center' });
  doc.text(`Location: ${startup.location}`, { align: 'center' });

  doc.y = 680;
  doc
    .fontSize(10)
    .fillColor('#9ca3af')
    .text(`Report Generated: ${date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
}

function renderTableOfContents(doc: PDFKit.PDFDocument): void {
  doc
    .fontSize(18)
    .fillColor('#111827')
    .text('Table of Contents', MARGIN, MARGIN);

  doc.moveDown(2);

  const tocItems = [
    'Executive Summary',
    'Scoring Breakdown',
    'Team Analysis',
    'Market Analysis',
    'Product Analysis',
    'Traction Analysis',
    'Financial Analysis',
    'Risk Factors',
  ];

  tocItems.forEach((item, index) => {
    doc
      .fontSize(12)
      .fillColor('#374151')
      .text(`${index + 1}. ${item}`, MARGIN + 20, doc.y, { continued: true })
      .text('', { align: 'left' });
    doc.moveDown(0.5);
  });
}

function renderExecutiveSummary(
  doc: PDFKit.PDFDocument,
  startup: StartupWithAnalysis,
  analysis: StartupWithAnalysis['analysis'],
): void {
  doc
    .fontSize(18)
    .fillColor('#111827')
    .text('1. Executive Summary', MARGIN, MARGIN);

  doc.moveDown();
  drawHorizontalLine(doc);
  doc.moveDown();

  // Company Overview
  doc
    .fontSize(12)
    .fillColor('#111827')
    .text('Company Overview', { underline: true });

  doc.moveDown(0.5);

  doc
    .font('Helvetica-Oblique')
    .fontSize(11)
    .fillColor('#374151')
    .text(startup.tagline)
    .font('Helvetica');

  doc.moveDown(0.5);

  doc
    .fontSize(10)
    .fillColor('#4b5563')
    .text(startup.description, { width: CONTENT_WIDTH });

  doc.moveDown();

  // Key Details Grid
  doc
    .fontSize(12)
    .fillColor('#111827')
    .text('Key Details', { underline: true });

  doc.moveDown(0.5);

  const details = [
    ['Industry', startup.industry],
    ['Stage', startup.stage],
    ['Location', startup.location],
    ['Team Size', startup.teamSize.toString()],
    ['Funding Target', `$${startup.fundingTarget.toLocaleString()}`],
    ['Website', startup.website],
  ];

  details.forEach(([label, value]) => {
    doc
      .fontSize(10)
      .fillColor('#6b7280')
      .text(`${label}: `, MARGIN, doc.y, { continued: true })
      .fillColor('#374151')
      .text(value);
  });

  // Key Highlights
  if (analysis?.highlights?.length) {
    doc.moveDown();
    doc
      .fontSize(12)
      .fillColor('#111827')
      .text('Key Highlights', { underline: true });

    doc.moveDown(0.5);

    analysis.highlights.forEach(highlight => {
      doc
        .fontSize(10)
        .fillColor('#059669')
        .text('+ ', { continued: true })
        .fillColor('#374151')
        .text(highlight);
    });
  }
}

function renderScoringBreakdown(doc: PDFKit.PDFDocument, analysis: StartupWithAnalysis['analysis']): void {
  doc
    .fontSize(18)
    .fillColor('#111827')
    .text('2. Scoring Breakdown', MARGIN, MARGIN);

  doc.moveDown();
  drawHorizontalLine(doc);
  doc.moveDown();

  const categories = [
    { name: 'Overall Score', score: analysis?.overallScore },
    { name: 'Team', score: analysis?.teamScore },
    { name: 'Market', score: analysis?.marketScore },
    { name: 'Product', score: analysis?.productScore },
    { name: 'Traction', score: analysis?.tractionScore },
    { name: 'Financials', score: analysis?.financialScore },
  ].filter(c => c.score !== undefined);

  if (categories.length === 0) {
    doc
      .font('Helvetica-Oblique')
      .fontSize(10)
      .fillColor('#6b7280')
      .text('No scoring data available.')
      .font('Helvetica');
    return;
  }

  const barWidth = 300;
  const barHeight = 20;
  const labelWidth = 100;

  categories.forEach(({ name, score }) => {
    if (score === undefined) return;

    const y = doc.y;
    const fillWidth = (score / 100) * barWidth;
    const color = getScoreColor(score);

    // Label
    doc
      .fontSize(11)
      .fillColor('#374151')
      .text(name, MARGIN, y + 4, { width: labelWidth });

    // Background bar
    doc
      .roundedRect(MARGIN + labelWidth, y, barWidth, barHeight, 3)
      .fill('#e5e7eb');

    // Score fill
    doc
      .roundedRect(MARGIN + labelWidth, y, fillWidth, barHeight, 3)
      .fill(color);

    // Score text
    doc
      .fontSize(11)
      .fillColor('#111827')
      .text(`${score}`, MARGIN + labelWidth + barWidth + 10, y + 4);

    // Rating label
    doc
      .fontSize(9)
      .fillColor('#6b7280')
      .text(getScoreLabel(score), MARGIN + labelWidth + barWidth + 40, y + 5);

    doc.y = y + barHeight + 15;
  });
}

function renderDetailedSection(
  doc: PDFKit.PDFDocument,
  title: string,
  score: number | undefined,
  analysisText: string | undefined,
  details: Record<string, unknown>,
): void {
  doc
    .fontSize(16)
    .fillColor('#111827')
    .text(title, MARGIN);

  // Score badge
  if (score !== undefined) {
    const badgeX = MARGIN + CONTENT_WIDTH - 80;
    const badgeY = doc.y - 20;
    const color = getScoreColor(score);

    doc
      .roundedRect(badgeX, badgeY, 80, 24, 4)
      .fill(color);

    doc
      .fontSize(12)
      .fillColor('#ffffff')
      .text(`${score} - ${getScoreLabel(score).split(' ')[0]}`, badgeX, badgeY + 6, { width: 80, align: 'center' });
  }

  doc.moveDown(0.5);
  drawHorizontalLine(doc);
  doc.moveDown();

  // Details based on section type
  if (details.founders && Array.isArray(details.founders)) {
    doc
      .fontSize(11)
      .fillColor('#111827')
      .text('Team Members:', { underline: true });
    doc.moveDown(0.3);

    (details.founders as Array<{ name: string; title: string }>).forEach(f => {
      doc
        .fontSize(10)
        .fillColor('#374151')
        .text(`- ${f.name} (${f.title})`);
    });
    doc.moveDown();
  }

  if (details.marketSize) {
    doc
      .fontSize(10)
      .fillColor('#6b7280')
      .text('Market Size: ', { continued: true })
      .fillColor('#374151')
      .text(String(details.marketSize));
  }

  if (details.targetMarket) {
    doc
      .fontSize(10)
      .fillColor('#6b7280')
      .text('Target Market: ', { continued: true })
      .fillColor('#374151')
      .text(String(details.targetMarket));
  }

  if (details.description) {
    doc
      .fontSize(10)
      .fillColor('#374151')
      .text(String(details.description), { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
  }

  if (details.stage) {
    doc
      .fontSize(10)
      .fillColor('#6b7280')
      .text('Stage: ', { continued: true })
      .fillColor('#374151')
      .text(String(details.stage));
  }

  if (details.metrics && Array.isArray(details.metrics)) {
    doc
      .fontSize(11)
      .fillColor('#111827')
      .text('Key Metrics:', { underline: true });
    doc.moveDown(0.3);

    (details.metrics as string[]).forEach(m => {
      doc
        .fontSize(10)
        .fillColor('#374151')
        .text(`- ${m}`);
    });
    doc.moveDown();
  }

  if (details.fundingTarget) {
    doc
      .fontSize(10)
      .fillColor('#6b7280')
      .text('Funding Target: ', { continued: true })
      .fillColor('#374151')
      .text(`$${Number(details.fundingTarget).toLocaleString()}`);
  }

  if (details.amountRaised !== undefined) {
    doc
      .fontSize(10)
      .fillColor('#6b7280')
      .text('Amount Raised: ', { continued: true })
      .fillColor('#374151')
      .text(`$${Number(details.amountRaised).toLocaleString()}`);
  }

  // Analysis text
  if (analysisText) {
    doc.moveDown();
    doc
      .fontSize(11)
      .fillColor('#111827')
      .text('Analysis:', { underline: true });
    doc.moveDown(0.3);

    doc
      .fontSize(10)
      .fillColor('#4b5563')
      .text(analysisText, { width: CONTENT_WIDTH });
  }

  doc.moveDown(1.5);
}

function renderRiskFactors(doc: PDFKit.PDFDocument, analysis: StartupWithAnalysis['analysis']): void {
  checkPageBreak(doc);

  doc
    .fontSize(16)
    .fillColor('#111827')
    .text('Risk Factors', MARGIN);

  doc.moveDown(0.5);
  drawHorizontalLine(doc);
  doc.moveDown();

  // Generate risk factors based on low scores
  const risks: string[] = [];

  if (analysis?.teamScore !== undefined && analysis.teamScore < 50) {
    risks.push('Team experience or composition may need strengthening');
  }
  if (analysis?.marketScore !== undefined && analysis.marketScore < 50) {
    risks.push('Market opportunity or competitive positioning needs validation');
  }
  if (analysis?.productScore !== undefined && analysis.productScore < 50) {
    risks.push('Product-market fit or differentiation is unclear');
  }
  if (analysis?.tractionScore !== undefined && analysis.tractionScore < 50) {
    risks.push('Traction metrics need improvement before scaling');
  }
  if (analysis?.financialScore !== undefined && analysis.financialScore < 50) {
    risks.push('Financial model or unit economics need refinement');
  }

  if (risks.length === 0) {
    risks.push('No significant risk factors identified based on current analysis');
  }

  risks.forEach(risk => {
    doc
      .fontSize(10)
      .fillColor('#dc2626')
      .text('! ', { continued: true })
      .fillColor('#374151')
      .text(risk);
    doc.moveDown(0.3);
  });
}

function drawHorizontalLine(doc: PDFKit.PDFDocument): void {
  doc
    .strokeColor('#e5e7eb')
    .lineWidth(1)
    .moveTo(MARGIN, doc.y)
    .lineTo(PAGE_WIDTH - MARGIN, doc.y)
    .stroke();
}

function checkPageBreak(doc: PDFKit.PDFDocument): void {
  if (doc.y > 650) {
    doc.addPage();
  }
}

function addFooter(doc: PDFKit.PDFDocument, userEmail: string, date: Date): void {
  const pages = doc.bufferedPageRange();

  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);

    // Watermark
    doc
      .fontSize(8)
      .fillColor('#9ca3af')
      .text(
        `Confidential - Prepared for ${userEmail}`,
        MARGIN,
        750,
        { width: CONTENT_WIDTH, align: 'center' },
      );

    // Footer line
    doc
      .fontSize(8)
      .fillColor('#9ca3af')
      .text(
        `Generated by Inside Line | ${date.toLocaleDateString()}`,
        MARGIN,
        762,
        { width: CONTENT_WIDTH / 2, align: 'left' },
      );

    doc
      .fontSize(8)
      .fillColor('#9ca3af')
      .text(
        `Page ${i + 1} of ${pages.count}`,
        MARGIN + CONTENT_WIDTH / 2,
        762,
        { width: CONTENT_WIDTH / 2, align: 'right' },
      );
  }
}
