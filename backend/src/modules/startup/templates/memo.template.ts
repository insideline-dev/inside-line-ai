import PDFDocument from 'pdfkit';
import type { Startup } from '../entities/startup.schema';

// Types for startup data with analysis
export interface StartupWithAnalysis extends Startup {
  analysis?: {
    overallScore?: number;
    teamScore?: number;
    marketScore?: number;
    productScore?: number;
    tractionScore?: number;
    financialScore?: number;
    highlights?: string[];
    teamAnalysis?: string;
    marketAnalysis?: string;
    productAnalysis?: string;
    tractionAnalysis?: string;
    financialAnalysis?: string;
    founders?: Array<{ name: string; title: string }>;
    marketSize?: string;
    targetMarket?: string;
    productDescription?: string;
    keyMetrics?: string[];
    amountRaised?: number;
  };
  user?: { email: string; name: string };
}

interface MemoContext {
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

// Layout constants
const MARGIN = 50;
const PAGE_WIDTH = 612;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export function generateMemoDocument(ctx: MemoContext): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
  });

  const { startup, userEmail, generatedAt } = ctx;
  const analysis = startup.analysis ?? {};

  // Header
  renderHeader(doc, startup.name, generatedAt);

  // Executive Summary
  renderExecutiveSummary(doc, startup, analysis);

  // Team Section
  if (analysis.teamScore !== undefined || analysis.founders?.length) {
    renderSection(doc, 'Team', analysis.teamScore, analysis.founders
      ?.map(f => `${f.name} - ${f.title}`)
      .join('\n') || 'No founder information available');
  }

  // Market Section
  if (analysis.marketScore !== undefined || analysis.marketSize) {
    const marketContent = [
      analysis.marketSize && `Market Size: ${analysis.marketSize}`,
      analysis.targetMarket && `Target Market: ${analysis.targetMarket}`,
    ].filter(Boolean).join('\n') || 'No market data available';
    renderSection(doc, 'Market', analysis.marketScore, marketContent);
  }

  // Product Section
  if (analysis.productScore !== undefined || analysis.productDescription) {
    const productContent = [
      analysis.productDescription || startup.description,
      `Stage: ${startup.stage}`,
    ].join('\n');
    renderSection(doc, 'Product', analysis.productScore, productContent);
  }

  // Traction Section
  if (analysis.tractionScore !== undefined || analysis.keyMetrics?.length) {
    const tractionContent = analysis.keyMetrics?.length
      ? analysis.keyMetrics.map(m => `- ${m}`).join('\n')
      : 'No traction metrics available';
    renderSection(doc, 'Traction', analysis.tractionScore, tractionContent);
  }

  // Financials Section
  if (analysis.financialScore !== undefined || startup.fundingTarget) {
    const financialContent = [
      `Funding Stage: ${startup.stage}`,
      `Funding Target: $${startup.fundingTarget.toLocaleString()}`,
      analysis.amountRaised !== undefined && `Amount Raised: $${analysis.amountRaised.toLocaleString()}`,
    ].filter(Boolean).join('\n');
    renderSection(doc, 'Financials', analysis.financialScore, financialContent);
  }

  // Footer on all pages
  addFooter(doc, userEmail, generatedAt);

  return doc;
}

function renderHeader(doc: PDFKit.PDFDocument, startupName: string, date: Date): void {
  // Logo placeholder
  doc
    .fontSize(20)
    .fillColor('#1f2937')
    .text('INSIDE LINE', MARGIN, MARGIN, { align: 'left' });

  doc
    .fontSize(10)
    .fillColor('#6b7280')
    .text('Investment Intelligence', MARGIN, doc.y + 2);

  doc.moveDown(2);

  // Title
  doc
    .fontSize(24)
    .fillColor('#111827')
    .text('Investment Memo', { align: 'center' });

  doc
    .fontSize(16)
    .fillColor('#374151')
    .text(startupName, { align: 'center' });

  doc
    .fontSize(10)
    .fillColor('#6b7280')
    .text(date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), { align: 'center' });

  doc.moveDown(2);
  drawHorizontalLine(doc);
  doc.moveDown();
}

function renderExecutiveSummary(
  doc: PDFKit.PDFDocument,
  startup: StartupWithAnalysis,
  analysis: StartupWithAnalysis['analysis'],
): void {
  doc
    .fontSize(14)
    .fillColor('#111827')
    .text('Executive Summary', { underline: true });

  doc.moveDown(0.5);

  // One-liner / Tagline
  doc
    .font('Helvetica-Oblique')
    .fontSize(11)
    .fillColor('#374151')
    .text(startup.tagline)
    .font('Helvetica');

  doc.moveDown();

  // Overall Score Box
  if (analysis?.overallScore !== undefined) {
    const score = analysis.overallScore;
    const scoreColor = getScoreColor(score);

    const boxY = doc.y;
    const boxHeight = 40;

    doc
      .roundedRect(MARGIN, boxY, 100, boxHeight, 5)
      .fill(scoreColor);

    doc
      .fontSize(20)
      .fillColor('#ffffff')
      .text(score.toString(), MARGIN, boxY + 10, { width: 100, align: 'center' });

    doc
      .fontSize(10)
      .fillColor('#6b7280')
      .text('Overall Score', MARGIN + 110, boxY + 14);

    doc.y = boxY + boxHeight + 10;
  }

  // Key Highlights
  if (analysis?.highlights?.length) {
    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .fillColor('#111827')
      .text('Key Highlights:');

    analysis.highlights.forEach(highlight => {
      doc
        .fontSize(10)
        .fillColor('#374151')
        .text(`  - ${highlight}`, { indent: 10 });
    });
  }

  doc.moveDown();
  drawHorizontalLine(doc);
  doc.moveDown();
}

function renderSection(
  doc: PDFKit.PDFDocument,
  title: string,
  score: number | undefined,
  content: string,
): void {
  // Check for page break
  if (doc.y > 650) {
    doc.addPage();
  }

  // Section Title with Score Badge
  const titleY = doc.y;

  doc
    .fontSize(14)
    .fillColor('#111827')
    .text(title, MARGIN, titleY);

  // Score badge
  if (score !== undefined) {
    const badgeX = MARGIN + CONTENT_WIDTH - 50;
    const badgeColor = getScoreColor(score);

    doc
      .roundedRect(badgeX, titleY - 2, 50, 20, 3)
      .fill(badgeColor);

    doc
      .fontSize(11)
      .fillColor('#ffffff')
      .text(score.toString(), badgeX, titleY + 2, { width: 50, align: 'center' });
  }

  doc.y = titleY + 25;

  // Content
  doc
    .fontSize(10)
    .fillColor('#374151')
    .text(content, MARGIN, doc.y, { width: CONTENT_WIDTH });

  doc.moveDown(1.5);
}

function drawHorizontalLine(doc: PDFKit.PDFDocument): void {
  doc
    .strokeColor('#e5e7eb')
    .lineWidth(1)
    .moveTo(MARGIN, doc.y)
    .lineTo(PAGE_WIDTH - MARGIN, doc.y)
    .stroke();
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
