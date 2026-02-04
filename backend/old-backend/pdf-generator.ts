import PDFDocument from "pdfkit";
import { Startup, StartupEvaluation } from "@shared/schema";

const BRAND_COLOR = "#0ea5e9";
const BRAND_COLOR_DARK = "#0284c7";
const TEXT_PRIMARY = "#1a1a1a";
const TEXT_SECONDARY = "#4b5563";
const TEXT_MUTED = "#9ca3af";
const SUCCESS_COLOR = "#16a34a";
const WARNING_COLOR = "#ca8a04";
const DANGER_COLOR = "#dc2626";

function getScoreColor(score: number): string {
  if (score >= 70) return SUCCESS_COLOR;
  if (score >= 50) return WARNING_COLOR;
  return DANGER_COLOR;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 70) return "Good";
  if (score >= 50) return "Moderate";
  if (score >= 30) return "Weak";
  return "Critical";
}

function getSummaryFromData(data: any): string | null {
  if (!data) return null;
  
  if (typeof data.narrativeSummary === 'string' && data.narrativeSummary.length > 50) {
    return data.narrativeSummary;
  }
  
  const summaryFields = ['memoNarrative', 'summary', 'assessment', 'overview', 'analysis', 'description', 'detailedAnalysis'];
  for (const field of summaryFields) {
    if (typeof data[field] === 'string' && data[field].length > 50) {
      return data[field];
    }
  }
  
  const summaryParts: string[] = [];
  for (const key of Object.keys(data)) {
    if (typeof data[key] === 'object' && data[key]) {
      if (data[key].assessment && typeof data[key].assessment === 'string') {
        summaryParts.push(data[key].assessment);
      } else if (data[key].summary && typeof data[key].summary === 'string') {
        summaryParts.push(data[key].summary);
      }
    }
  }
  
  if (summaryParts.length > 0) {
    return summaryParts.slice(0, 2).join('\n\n');
  }
  
  return null;
}

function formatCurrency(value: number | null | undefined): string {
  if (!value) return "N/A";
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
}

function addWatermark(doc: PDFKit.PDFDocument, userWatermark: string) {
  doc.save();
  doc.opacity(0.04);
  doc.fontSize(14);
  doc.font("Helvetica");
  doc.fillColor("#000000");
  doc.rotate(-45, { origin: [300, 400] });
  
  const watermarkText = userWatermark;
  for (let y = 100; y < 700; y += 120) {
    for (let x = 0; x < 600; x += 250) {
      doc.text(watermarkText, x, y, { width: 240, align: "center" });
    }
  }
  
  doc.restore();
}

function addHeader(doc: PDFKit.PDFDocument, startupName: string, pageNum: number, totalPages: number) {
  const headerY = 25;
  
  doc.fontSize(9).font("Helvetica-Bold").fillColor(BRAND_COLOR)
    .text("INSIDELINE.AI", 50, headerY);
  
  doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED)
    .text(`${startupName} | Investment Memo`, 50, headerY, { align: "center", width: 495 });
  
  doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED)
    .text(`${pageNum}/${totalPages}`, 50, headerY, { align: "right", width: 495 });
  
  doc.strokeColor("#e5e5e5").lineWidth(0.5)
    .moveTo(50, headerY + 15).lineTo(545, headerY + 15).stroke();
}

function addFooter(doc: PDFKit.PDFDocument, timestamp: string) {
  const footerY = doc.page.height - 35;
  
  doc.strokeColor("#e5e5e5").lineWidth(0.5)
    .moveTo(50, footerY - 5).lineTo(545, footerY - 5).stroke();
  
  doc.fontSize(7).font("Helvetica").fillColor(TEXT_MUTED)
    .text(`Generated: ${timestamp} | CONFIDENTIAL - For authorized recipients only`, 50, footerY, { 
      align: "center", 
      width: 495 
    });
}

function addMemoSection(
  doc: PDFKit.PDFDocument, 
  title: string, 
  content: string | null, 
  score?: number | null, 
  weight?: string,
  additionalContent?: { label: string; text: string }[],
  userWatermark?: string
): boolean {
  if (!content && (!additionalContent || additionalContent.length === 0)) {
    return false;
  }
  
  if (doc.y > 680) {
    doc.addPage();
    if (userWatermark) addWatermark(doc, userWatermark);
    doc.y = 70;
  }
  
  const sectionStartY = doc.y;
  doc.rect(50, sectionStartY, 495, 24).fill("#f8fafc");
  
  doc.fontSize(12).font("Helvetica-Bold").fillColor(BRAND_COLOR_DARK)
    .text(title, 60, sectionStartY + 6, { continued: weight ? true : false });
  
  if (weight) {
    doc.fontSize(9).font("Helvetica").fillColor(TEXT_MUTED)
      .text(`  (Weight: ${weight})`, { continued: false });
  }
  
  if (score !== null && score !== undefined) {
    doc.fontSize(11).font("Helvetica-Bold").fillColor(getScoreColor(score))
      .text(`${score.toFixed(0)}/100`, 480, sectionStartY + 6, { width: 60, align: "right" });
  }
  
  doc.y = sectionStartY + 30;
  
  if (content) {
    doc.fontSize(10).font("Helvetica").fillColor(TEXT_PRIMARY)
      .text(content, 50, doc.y, { align: "justify", lineGap: 2, width: 495 });
    doc.moveDown(0.5);
  }
  
  if (additionalContent && additionalContent.length > 0) {
    for (const item of additionalContent) {
      if (item.text) {
        doc.fontSize(10).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text(item.label, 50);
        doc.fontSize(10).font("Helvetica").fillColor(TEXT_PRIMARY)
          .text(item.text, 50, doc.y, { align: "justify", lineGap: 2, width: 495 });
        doc.moveDown(0.3);
      }
    }
  }
  
  doc.moveDown(0.8);
  return true;
}

export async function generateStartupMemoPDF(
  startup: Startup,
  evaluation: StartupEvaluation,
  userWatermark: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 60, bottom: 50, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: `${startup.name} - Investment Memo`,
          Author: "InsideLine.AI",
          Subject: "AI-Generated Investment Memo",
          Keywords: "investment, memo, startup, analysis",
          CreationDate: new Date(),
        },
      });
      
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      
      const timestamp = new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
      
      const investorMemo = evaluation.investorMemo as any;
      const teamData = evaluation.teamData as any;
      const marketData = evaluation.marketData as any;
      const productData = evaluation.productData as any;
      const businessModelData = evaluation.businessModelData as any;
      const tractionData = evaluation.tractionData as any;
      const gtmData = evaluation.gtmData as any;
      const competitiveAdvantageData = evaluation.competitiveAdvantageData as any;
      const financialsData = evaluation.financialsData as any;
      const dealTermsData = evaluation.dealTermsData as any;
      const legalData = evaluation.legalData as any;
      const exitPotentialData = evaluation.exitPotentialData as any;
      
      addWatermark(doc, userWatermark);
      
      doc.y = 80;
      doc.fontSize(10).font("Helvetica-Bold").fillColor(BRAND_COLOR)
        .text("INSIDELINE.AI", 50, doc.y, { align: "center", width: 495 });
      doc.moveDown(0.3);
      
      doc.fontSize(28).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
        .text("Investment Memo", 50, doc.y, { align: "center", width: 495 });
      doc.moveDown(0.8);
      
      doc.fontSize(22).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
        .text(startup.name, 50, doc.y, { align: "center", width: 495 });
      doc.moveDown(0.5);
      
      const overallScore = evaluation.overallScore || startup.overallScore || 0;
      const scoreColor = getScoreColor(overallScore);
      const scoreLabel = getScoreLabel(overallScore);
      
      const pageWidth = 595;
      const boxWidth = 195;
      const boxX = (pageWidth - boxWidth) / 2;
      const scoreBoxY = doc.y;
      
      doc.rect(boxX, scoreBoxY, boxWidth, 55).fill("#f8fafc").stroke("#e2e8f0");
      
      doc.fontSize(32).font("Helvetica-Bold").fillColor(scoreColor)
        .text(overallScore.toFixed(0), boxX, scoreBoxY + 8, { align: "center", width: boxWidth });
      doc.fontSize(11).font("Helvetica").fillColor(TEXT_SECONDARY)
        .text(`${scoreLabel} Investment`, boxX, scoreBoxY + 40, { align: "center", width: boxWidth });
      
      doc.y = scoreBoxY + 70;
      
      const metaItems = [];
      if (startup.sector) metaItems.push(`Sector: ${startup.sector}`);
      if (startup.stage) metaItems.push(`Stage: ${startup.stage.replace(/_/g, " ").toUpperCase()}`);
      if (startup.location) metaItems.push(`Location: ${startup.location}`);
      
      if (metaItems.length > 0) {
        doc.fontSize(10).font("Helvetica").fillColor(TEXT_SECONDARY)
          .text(metaItems.join("  |  "), 50, doc.y, { align: "center", width: 495 });
        doc.moveDown(0.3);
      }
      
      doc.fontSize(9).fillColor(TEXT_MUTED)
        .text(`Generated: ${timestamp}`, 50, doc.y, { align: "center", width: 495 });
      
      doc.moveDown(1.2);
      
      const lineX = (pageWidth - 195) / 2;
      doc.strokeColor(BRAND_COLOR).lineWidth(2)
        .moveTo(lineX, doc.y).lineTo(lineX + 195, doc.y).stroke();
      doc.moveDown(1.5);
      
      const executiveSummary = (evaluation as any).executiveSummary || investorMemo?.summary || startup.description;
      addMemoSection(doc, "Executive Summary", executiveSummary, null, undefined, 
        investorMemo?.rationale ? [{ label: "Investment Rationale:", text: investorMemo.rationale }] : undefined,
        userWatermark
      );
      
      const teamNarrative = teamData?.memoNarrative || getSummaryFromData(teamData);
      const teamAdditional: { label: string; text: string }[] = [];
      
      if (teamData?.founders && Array.isArray(teamData.founders) && teamData.founders.length > 0) {
        const founderSummaries: string[] = [];
        for (const founder of teamData.founders.slice(0, 4)) {
          if (founder.name) {
            let founderInfo = `${founder.name}`;
            if (founder.role) founderInfo += ` (${founder.role})`;
            if (founder.background || founder.experience) {
              founderInfo += `: ${founder.background || founder.experience}`;
            }
            founderSummaries.push(founderInfo);
          }
        }
        if (founderSummaries.length > 0) {
          teamAdditional.push({ label: "Key Team Members:", text: founderSummaries.join("\n") });
        }
      }
      
      if (teamData?.founderMarketFit?.assessment) {
        teamAdditional.push({ label: "Founder-Market Fit:", text: teamData.founderMarketFit.assessment });
      }
      
      if (teamData?.teamComposition) {
        const comp = teamData.teamComposition;
        const compParts: string[] = [];
        if (comp.hasBusinessLeader) compParts.push("Business Leader");
        if (comp.hasTechnicalLeader) compParts.push("Technical Leader");
        if (comp.hasIndustryExpert) compParts.push("Industry Expert");
        if (compParts.length > 0) {
          teamAdditional.push({ label: "Team Composition:", text: compParts.join(", ") });
        }
      }
      
      addMemoSection(doc, "Team", teamNarrative, evaluation.teamScore, "20%", teamAdditional, userWatermark);
      
      addMemoSection(doc, "Market Opportunity", getSummaryFromData(marketData), evaluation.marketScore, "15%",
        marketData?.whyNow ? [{ label: "Why Now:", text: marketData.whyNow }] : undefined, userWatermark
      );
      
      addMemoSection(doc, "Product & Technology", getSummaryFromData(productData), evaluation.productScore, "10%", undefined, userWatermark);
      
      addMemoSection(doc, "Business Model", getSummaryFromData(businessModelData), evaluation.businessModelScore, "10%", undefined, userWatermark);
      
      addMemoSection(doc, "Traction & Metrics", getSummaryFromData(tractionData), evaluation.tractionScore, "10%", undefined, userWatermark);
      
      addMemoSection(doc, "Go-to-Market Strategy", getSummaryFromData(gtmData), evaluation.gtmScore, "8%", undefined, userWatermark);
      
      const competitiveSummary = competitiveAdvantageData?.narrativeSummary || getSummaryFromData(competitiveAdvantageData);
      addMemoSection(doc, "Competitive Landscape", competitiveSummary, evaluation.competitiveAdvantageScore, "8%", undefined, userWatermark);
      
      addMemoSection(doc, "Financials", getSummaryFromData(financialsData), evaluation.financialsScore, "7%", undefined, userWatermark);
      
      if (startup.roundSize || startup.valuation) {
        const fundingContent = `Current Round: ${startup.stage?.replace("_", " ") || "N/A"}\nRound Size: ${formatCurrency(startup.roundSize)}\nValuation: ${formatCurrency(startup.valuation)}`;
        addMemoSection(doc, "Funding History", fundingContent, null, undefined, undefined, userWatermark);
      }
      
      addMemoSection(doc, "Deal Terms", getSummaryFromData(dealTermsData), evaluation.dealTermsScore, "5%", undefined, userWatermark);
      
      addMemoSection(doc, "Legal & Regulatory", getSummaryFromData(legalData), evaluation.legalScore, "5%", undefined, userWatermark);
      
      addMemoSection(doc, "Exit Potential", getSummaryFromData(exitPotentialData), evaluation.exitPotentialScore, "2%", undefined, userWatermark);
      
      let hasMoreContent = false;
      
      if (investorMemo?.dueDiligenceAreas && Array.isArray(investorMemo.dueDiligenceAreas) && investorMemo.dueDiligenceAreas.length > 0) {
        if (doc.y > 600) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.fontSize(14).font("Helvetica-Bold").fillColor(BRAND_COLOR)
          .text("Due Diligence Areas");
        doc.moveDown(0.4);
        
        for (const area of investorMemo.dueDiligenceAreas) {
          doc.fontSize(10).font("Helvetica").fillColor(TEXT_PRIMARY)
            .text(`• ${area}`, { indent: 10, width: 480 });
        }
        doc.moveDown(1);
        hasMoreContent = true;
      }
      
      const recommendations = evaluation.recommendations as string[] || [];
      if (recommendations.length > 0) {
        if (doc.y > 600) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.fontSize(14).font("Helvetica-Bold").fillColor(BRAND_COLOR)
          .text("Key Recommendations");
        doc.moveDown(0.4);
        
        for (let i = 0; i < Math.min(recommendations.length, 6); i++) {
          doc.fontSize(10).font("Helvetica").fillColor(TEXT_PRIMARY)
            .text(`${i + 1}. ${recommendations[i]}`, { indent: 10, width: 480 });
          doc.moveDown(0.2);
        }
        hasMoreContent = true;
      }
      
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        if (i > 0) {
          addHeader(doc, startup.name, i + 1, pages.count);
        }
        addFooter(doc, timestamp);
      }
      
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function addReportSection(
  doc: PDFKit.PDFDocument,
  title: string,
  userWatermark?: string
): void {
  if (doc.y > 680) {
    doc.addPage();
    if (userWatermark) addWatermark(doc, userWatermark);
    doc.y = 70;
  }
  
  const sectionStartY = doc.y;
  doc.rect(50, sectionStartY, 495, 28).fill(BRAND_COLOR);
  
  doc.fontSize(14).font("Helvetica-Bold").fillColor("#ffffff")
    .text(title, 60, sectionStartY + 7);
  
  doc.y = sectionStartY + 38;
}

function addReportSubSection(
  doc: PDFKit.PDFDocument,
  title: string,
  content: string | null,
  score?: number | null,
  userWatermark?: string
): boolean {
  if (!content) return false;
  
  if (doc.y > 680) {
    doc.addPage();
    if (userWatermark) addWatermark(doc, userWatermark);
    doc.y = 70;
  }
  
  const sectionStartY = doc.y;
  doc.rect(50, sectionStartY, 495, 22).fill("#f1f5f9");
  
  doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
    .text(title, 58, sectionStartY + 5);
  
  if (score !== null && score !== undefined) {
    doc.fontSize(10).font("Helvetica-Bold").fillColor(getScoreColor(score))
      .text(`${score.toFixed(0)}/100`, 480, sectionStartY + 5, { width: 60, align: "right" });
  }
  
  doc.y = sectionStartY + 28;
  
  doc.fontSize(10).font("Helvetica").fillColor(TEXT_PRIMARY)
    .text(content, 50, doc.y, { align: "justify", lineGap: 2, width: 495 });
  doc.moveDown(0.8);
  
  return true;
}

function addBulletList(
  doc: PDFKit.PDFDocument,
  items: string[],
  userWatermark?: string
): void {
  for (const item of items) {
    if (doc.y > 720) {
      doc.addPage();
      if (userWatermark) addWatermark(doc, userWatermark);
      doc.y = 70;
    }
    doc.fontSize(10).font("Helvetica").fillColor(TEXT_PRIMARY)
      .text(`• ${item}`, 60, doc.y, { indent: 0, width: 480 });
    doc.moveDown(0.2);
  }
  doc.moveDown(0.5);
}

function addReportHeader(doc: PDFKit.PDFDocument, startupName: string, pageNum: number, totalPages: number) {
  const headerY = 25;
  
  doc.fontSize(9).font("Helvetica-Bold").fillColor(BRAND_COLOR)
    .text("INSIDELINE.AI", 50, headerY);
  
  doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED)
    .text(`${startupName} | Analysis Report`, 50, headerY, { align: "center", width: 495 });
  
  doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED)
    .text(`${pageNum}/${totalPages}`, 50, headerY, { align: "right", width: 495 });
  
  doc.strokeColor("#e5e5e5").lineWidth(0.5)
    .moveTo(50, headerY + 15).lineTo(545, headerY + 15).stroke();
}

function addScoreCard(
  doc: PDFKit.PDFDocument,
  title: string,
  score: number,
  weight: number | undefined,
  iconColor: string,
  userWatermark?: string
): void {
  if (doc.y > 680) {
    doc.addPage();
    if (userWatermark) addWatermark(doc, userWatermark);
    doc.y = 70;
  }
  
  const cardY = doc.y;
  doc.rect(50, cardY, 495, 50).fill("#f8fafc").stroke("#e2e8f0");
  
  doc.circle(85, cardY + 25, 15).fillAndStroke(iconColor, iconColor);
  
  doc.fontSize(12).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
    .text(title, 110, cardY + 12);
  doc.fontSize(9).font("Helvetica").fillColor(TEXT_MUTED)
    .text(weight !== undefined ? `${weight}% weight in overall evaluation` : "", 110, cardY + 28);
  
  doc.fontSize(24).font("Helvetica-Bold").fillColor(getScoreColor(score))
    .text(`${score}`, 460, cardY + 12, { width: 60, align: "right" });
  doc.fontSize(10).font("Helvetica").fillColor(TEXT_MUTED)
    .text("/100", 520, cardY + 20);
  
  doc.y = cardY + 60;
}

function addStrengthsRisksGrid(
  doc: PDFKit.PDFDocument,
  strengths: string[],
  risks: string[],
  strengthsTitle: string,
  risksTitle: string,
  userWatermark?: string
): void {
  if (!strengths.length && !risks.length) return;
  
  if (doc.y > 580) {
    doc.addPage();
    if (userWatermark) addWatermark(doc, userWatermark);
    doc.y = 70;
  }
  
  const startY = doc.y;
  const colWidth = 240;
  
  if (strengths.length > 0) {
    doc.rect(50, startY, colWidth, 24).fill("#f0fdf4");
    doc.fontSize(10).font("Helvetica-Bold").fillColor(SUCCESS_COLOR)
      .text(strengthsTitle, 60, startY + 7);
    
    doc.y = startY + 30;
    for (const item of strengths.slice(0, 5)) {
      // Draw small filled circle as checkmark substitute
      doc.circle(60, doc.y + 4, 3).fill(SUCCESS_COLOR);
      doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
        .text(item, 70, doc.y, { width: colWidth - 25 });
      doc.moveDown(0.3);
    }
  }
  
  if (risks.length > 0) {
    doc.rect(305, startY, colWidth, 24).fill("#fef2f2");
    doc.fontSize(10).font("Helvetica-Bold").fillColor(DANGER_COLOR)
      .text(risksTitle, 315, startY + 7);
    
    let riskY = startY + 30;
    for (const item of risks.slice(0, 5)) {
      // Draw small triangle as warning substitute
      doc.polygon([315, riskY + 7], [318, riskY + 1], [321, riskY + 7]).fill(WARNING_COLOR);
      doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
        .text(item, 325, riskY, { width: colWidth - 25 });
      riskY += doc.heightOfString(item, { width: colWidth - 25 }) + 4;
    }
  }
  
  // Calculate actual heights based on content
  let strengthsHeight = 30;
  if (strengths.length > 0) {
    for (const item of strengths.slice(0, 5)) {
      strengthsHeight += doc.heightOfString(item, { width: 215 }) + 4;
    }
  }
  
  let risksHeight = 30;
  if (risks.length > 0) {
    for (const item of risks.slice(0, 5)) {
      risksHeight += doc.heightOfString(item, { width: 215 }) + 4;
    }
  }
  
  const maxHeight = Math.max(strengthsHeight, risksHeight);
  doc.y = startY + maxHeight + 10;
}

function addRoleIndicator(
  doc: PDFKit.PDFDocument,
  label: string,
  hasRole: boolean,
  x: number,
  y: number
): void {
  const bgColor = hasRole ? "#dcfce7" : "#fee2e2";
  const borderColor = hasRole ? "#86efac" : "#fca5a5";
  const textColor = hasRole ? SUCCESS_COLOR : DANGER_COLOR;
  
  doc.rect(x, y, 235, 32).fillAndStroke(bgColor, borderColor);
  // Draw filled/hollow circle as indicator instead of emoji
  if (hasRole) {
    doc.circle(x + 15, y + 16, 5).fill(SUCCESS_COLOR);
  } else {
    doc.circle(x + 15, y + 16, 5).stroke(DANGER_COLOR);
  }
  doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
    .text(label, x + 30, y + 10, { width: 190 });
}

export async function generateStartupReportPDF(
  startup: Startup,
  evaluation: StartupEvaluation,
  userWatermark: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 60, bottom: 50, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: `${startup.name} - Analysis Report`,
          Author: "InsideLine.AI",
          Subject: "AI-Generated Analysis Report",
          Keywords: "analysis, report, startup, product, team, competitors",
          CreationDate: new Date(),
        },
      });
      
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      
      const timestamp = new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
      
      const teamData = evaluation.teamData as any;
      const productData = evaluation.productData as any;
      const competitiveData = evaluation.competitiveAdvantageData as any;
      const investorMemo = evaluation.investorMemo as any;
      const marketData = evaluation.marketData as any;
      
      addWatermark(doc, userWatermark);
      
      // ========== TITLE PAGE ==========
      doc.y = 80;
      doc.fontSize(10).font("Helvetica-Bold").fillColor(BRAND_COLOR)
        .text("INSIDELINE.AI", 50, doc.y, { align: "center", width: 495 });
      doc.moveDown(0.3);
      
      doc.fontSize(28).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
        .text("Analysis Report", 50, doc.y, { align: "center", width: 495 });
      doc.moveDown(0.8);
      
      doc.fontSize(22).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
        .text(startup.name, 50, doc.y, { align: "center", width: 495 });
      doc.moveDown(0.5);
      
      const overallScore = evaluation.overallScore || startup.overallScore || 0;
      const scoreColor = getScoreColor(overallScore);
      const scoreLabel = getScoreLabel(overallScore);
      
      const pageWidth = 595;
      const boxWidth = 195;
      const boxX = (pageWidth - boxWidth) / 2;
      const scoreBoxY = doc.y;
      
      // Score Ring (circular visual like UI)
      doc.circle(pageWidth / 2, scoreBoxY + 45, 40).stroke(scoreColor);
      doc.circle(pageWidth / 2, scoreBoxY + 45, 35).stroke("#e5e5e5");
      doc.fontSize(32).font("Helvetica-Bold").fillColor(scoreColor)
        .text(overallScore.toFixed(0), boxX, scoreBoxY + 30, { align: "center", width: boxWidth });
      doc.fontSize(11).font("Helvetica").fillColor(TEXT_SECONDARY)
        .text(`${scoreLabel} Investment`, boxX, scoreBoxY + 95, { align: "center", width: boxWidth });
      
      doc.y = scoreBoxY + 120;
      
      const metaItems = [];
      if (startup.sector) metaItems.push(`Sector: ${startup.sector}`);
      if (startup.stage) metaItems.push(`Stage: ${startup.stage.replace(/_/g, " ").toUpperCase()}`);
      if (startup.location) metaItems.push(`Location: ${startup.location}`);
      
      if (metaItems.length > 0) {
        doc.fontSize(10).font("Helvetica").fillColor(TEXT_SECONDARY)
          .text(metaItems.join("  |  "), 50, doc.y, { align: "center", width: 495 });
        doc.moveDown(0.3);
      }
      
      doc.fontSize(9).fillColor(TEXT_MUTED)
        .text(`Generated: ${timestamp}`, 50, doc.y, { align: "center", width: 495 });
      
      doc.moveDown(1.5);
      
      // ========== SUMMARY TAB ==========
      addReportSection(doc, "SUMMARY", userWatermark);
      
      // Deal Info Grid - matches Summary tab 8-field grid
      if (doc.y > 680) {
        doc.addPage();
        addWatermark(doc, userWatermark);
        doc.y = 70;
      }
      
      doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
      doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
        .text("Deal Information", 58, doc.y + 6);
      doc.y += 32;
      
      const dealInfoItems: { label: string; value: string }[] = [];
      if (startup.stage) dealInfoItems.push({ label: "Stage", value: startup.stage.replace(/_/g, " ").toUpperCase() });
      if (startup.sectorIndustryGroup) dealInfoItems.push({ label: "Industry Group", value: startup.sectorIndustryGroup.replace(/_/g, " ") });
      if (startup.sectorIndustry) dealInfoItems.push({ label: "Industry", value: startup.sectorIndustry.replace(/_/g, " ") });
      if (startup.location) dealInfoItems.push({ label: "Location", value: startup.location });
      if (startup.roundSize) dealInfoItems.push({ label: "Round Size", value: formatCurrency(startup.roundSize) });
      if (startup.valuation) dealInfoItems.push({ label: "Valuation", value: formatCurrency(startup.valuation) });
      if (startup.raiseType) dealInfoItems.push({ label: "Raise Type", value: startup.raiseType.replace(/_/g, " ").toUpperCase() });
      if (startup.leadSecured !== undefined) dealInfoItems.push({ 
        label: "Lead Investor", 
        value: startup.leadSecured ? `Yes${startup.leadInvestorName ? ` (${startup.leadInvestorName})` : ""}` : "No" 
      });
      
      // Display deal info in 2-column grid format like UI
      const gridStartY = doc.y;
      const leftCol = 55;
      const rightCol = 300;
      let currentRow = 0;
      
      for (let i = 0; i < dealInfoItems.length; i++) {
        const item = dealInfoItems[i];
        const x = i % 2 === 0 ? leftCol : rightCol;
        const y = gridStartY + (Math.floor(i / 2) * 20);
        
        doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_MUTED)
          .text(item.label, x, y);
        doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
          .text(item.value, x + 90, y, { width: 140 });
        
        currentRow = Math.floor(i / 2);
      }
      doc.y = gridStartY + ((currentRow + 1) * 20) + 10;
      
      // Previous Funding - matches UI Previous Funding card
      if (startup.hasPreviousFunding && startup.previousFundingAmount) {
        if (doc.y > 680) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text("Previous Funding", 58, doc.y + 6);
        doc.y += 32;
        
        doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text("Amount Raised: ", 60, doc.y, { continued: true });
        doc.font("Helvetica").fillColor(TEXT_PRIMARY)
          .text(formatCurrency(startup.previousFundingAmount));
        
        if (startup.previousRoundType) {
          doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
            .text("Round Type: ", 60, doc.y, { continued: true });
          doc.font("Helvetica").fillColor(TEXT_PRIMARY)
            .text(startup.previousRoundType);
        }
        if (startup.previousInvestors) {
          doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
            .text("Previous Investors: ", 60, doc.y, { continued: true });
          doc.font("Helvetica").fillColor(TEXT_PRIMARY)
            .text(startup.previousInvestors, { width: 400 });
        }
        doc.moveDown(0.5);
      }
      
      // Deal Snapshot - matches UI Deal Snapshot card
      const dealSnapshot = investorMemo?.snapshot || investorMemo?.dealSnapshot;
      if (dealSnapshot) {
        if (doc.y > 680) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text("Deal Snapshot", 58, doc.y + 6);
        doc.y += 32;
        
        doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
          .text(dealSnapshot, 55, doc.y, { width: 485, align: "justify" });
        doc.moveDown(0.8);
      }
      
      // Thesis Alignment - matches UI Thesis Alignment card
      const thesisAlignment = investorMemo?.thesisAlignment || 
                             (evaluation as any).thesisAlignment ||
                             marketData?.thesisAlignment;
      if (thesisAlignment) {
        if (doc.y > 650) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.rect(50, doc.y, 495, 24).fill("#e0f2fe");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(BRAND_COLOR)
          .text("Thesis Alignment", 58, doc.y + 6);
        doc.y += 32;
        
        // Handle different thesis alignment formats
        if (typeof thesisAlignment === "string") {
          doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
            .text(thesisAlignment, 55, doc.y, { width: 485 });
        } else if (thesisAlignment.summary) {
          doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
            .text(thesisAlignment.summary, 55, doc.y, { width: 485 });
        }
        
        // Show alignment factors if available
        if (thesisAlignment.alignmentFactors && Array.isArray(thesisAlignment.alignmentFactors)) {
          doc.moveDown(0.3);
          doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_MUTED)
            .text("Alignment Factors:", 55, doc.y);
          doc.moveDown(0.2);
          for (const factor of thesisAlignment.alignmentFactors.slice(0, 5)) {
            doc.circle(65, doc.y + 4, 2).fill(SUCCESS_COLOR);
            doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
              .text(typeof factor === "string" ? factor : factor.factor || factor.name, 75, doc.y, { width: 460 });
            doc.moveDown(0.2);
          }
        }
        
        // Show misalignment concerns if available
        if (thesisAlignment.concerns && Array.isArray(thesisAlignment.concerns)) {
          doc.moveDown(0.3);
          doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_MUTED)
            .text("Potential Concerns:", 55, doc.y);
          doc.moveDown(0.2);
          for (const concern of thesisAlignment.concerns.slice(0, 3)) {
            doc.polygon([65, doc.y + 6], [68, doc.y], [71, doc.y + 6]).fill(WARNING_COLOR);
            doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
              .text(typeof concern === "string" ? concern : concern.concern || concern.issue, 75, doc.y, { width: 460 });
            doc.moveDown(0.2);
          }
        }
        
        doc.moveDown(0.8);
      }
      
      // Key Strengths & Risks - side-by-side grid like UI
      const keyStrengths = (evaluation.keyStrengths as string[]) || investorMemo?.keyStrengths || [];
      const keyRisks = (evaluation.keyRisks as string[]) || investorMemo?.keyRisks || [];
      
      addStrengthsRisksGrid(doc, keyStrengths, keyRisks, "Key Strengths", "Key Risks", userWatermark);
      
      // Section Scores with weights - matches UI Section Scores card
      if (doc.y > 580) {
        doc.addPage();
        addWatermark(doc, userWatermark);
        doc.y = 70;
      }
      
      doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
      doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
        .text("Section Scores", 58, doc.y + 6);
      doc.y += 32;
      
      const sectionScores = [
        { name: "Team", score: evaluation.teamScore, weight: 20 },
        { name: "Market", score: evaluation.marketScore, weight: 15 },
        { name: "Product", score: evaluation.productScore, weight: 10 },
        { name: "Traction", score: evaluation.tractionScore, weight: 10 },
        { name: "Business Model", score: evaluation.businessModelScore, weight: 10 },
        { name: "Go-to-Market", score: evaluation.gtmScore, weight: 8 },
        { name: "Competitive Advantage", score: evaluation.competitiveAdvantageScore, weight: 8 },
        { name: "Financials", score: evaluation.financialsScore, weight: 7 },
        { name: "Legal", score: evaluation.legalScore, weight: 5 },
        { name: "Deal Terms", score: evaluation.dealTermsScore, weight: 5 },
        { name: "Exit Potential", score: evaluation.exitPotentialScore, weight: 2 },
      ];
      
      // Display scores in 2-column grid with progress bars like UI
      const scoreStartY = doc.y;
      let scoreRow = 0;
      for (let i = 0; i < sectionScores.length; i++) {
        const section = sectionScores[i];
        if (section.score === null || section.score === undefined) continue;
        
        const col = scoreRow % 2;
        const x = col === 0 ? 55 : 300;
        const y = scoreStartY + (Math.floor(scoreRow / 2) * 30);
        
        doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
          .text(`${section.name} (${section.weight}%)`, x, y, { width: 150 });
        
        // Progress bar
        const barWidth = 80;
        const barHeight = 8;
        doc.rect(x + 150, y + 2, barWidth, barHeight).fill("#e5e7eb");
        doc.rect(x + 150, y + 2, barWidth * (section.score / 100), barHeight).fill(getScoreColor(section.score));
        
        doc.fontSize(9).font("Helvetica-Bold").fillColor(getScoreColor(section.score))
          .text(`${section.score.toFixed(0)}`, x + 235, y);
        
        scoreRow++;
      }
      doc.y = scoreStartY + (Math.ceil(scoreRow / 2) * 30) + 15;
      
      // ========== PRODUCT TAB ==========
      addReportSection(doc, "PRODUCT", userWatermark);
      
      // Product Score Card - matches ProductScoreSummary component
      const productScore = evaluation.productScore || 0;
      addScoreCard(doc, "Product Score", productScore, 10, BRAND_COLOR, userWatermark);
      
      // Product Summary - matches Product Summary card
      const productSummary = evaluation.productSummary || productData?.productSummary || productData?.one_liner || getSummaryFromData(productData);
      if (productSummary) {
        if (doc.y > 680) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text("Product Summary", 58, doc.y + 6);
        doc.y += 32;
        doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
          .text(productSummary, 55, doc.y, { width: 485, align: "justify" });
        doc.moveDown(0.8);
      }
      
      // Product Readiness - matches UI Product Readiness card with TRL stage and moat
      const trlStage = startup.technologyReadinessLevel || productData?.technologyReadiness?.stage;
      const moatType = productData?.competitiveMoat?.moatType;
      const moatStrength = productData?.competitiveMoat?.strength;
      
      if (trlStage || moatType) {
        if (doc.y > 650) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text("Product Readiness", 58, doc.y + 6);
        doc.y += 32;
        
        // Technology Stage and Moat in 2-column grid
        const readinessY = doc.y;
        if (trlStage) {
          const trlLabel = trlStage === 'idea' ? 'Idea Stage' : 
                          trlStage === 'mvp' ? 'MVP' : 
                          trlStage === 'scaling' ? 'Scaling' : 
                          trlStage === 'mature' ? 'Mature' : trlStage.toUpperCase();
          doc.rect(55, readinessY, 230, 35).fillAndStroke("#f8fafc", "#e2e8f0");
          doc.fontSize(9).font("Helvetica").fillColor(TEXT_MUTED)
            .text("Technology Stage", 65, readinessY + 8);
          doc.fontSize(10).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
            .text(trlLabel, 65, readinessY + 20);
        }
        
        if (moatType) {
          doc.rect(300, readinessY, 230, 35).fillAndStroke("#f8fafc", "#e2e8f0");
          doc.fontSize(9).font("Helvetica").fillColor(TEXT_MUTED)
            .text("Competitive Moat", 310, readinessY + 8);
          doc.fontSize(10).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
            .text(moatType.replace(/_/g, ' '), 310, readinessY + 20);
        }
        
        doc.y = readinessY + 45;
        
        // Moat Strength progress bar
        if (moatStrength !== undefined && moatStrength !== null) {
          doc.fontSize(9).font("Helvetica").fillColor(TEXT_MUTED)
            .text("Moat Strength:", 55, doc.y);
          const barX = 130;
          const barWidth = 200;
          const barHeight = 8;
          doc.rect(barX, doc.y, barWidth, barHeight).fill("#e5e7eb");
          doc.rect(barX, doc.y, barWidth * (moatStrength / 100), barHeight).fill(getScoreColor(moatStrength));
          doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
            .text(`${moatStrength}/100`, barX + barWidth + 10, doc.y);
          doc.moveDown(0.8);
        }
      }
      
      // Product Strengths & Risks - side-by-side grid
      const productStrengths = productData?.keyStrengths || [];
      const productRisks = productData?.keyRisks || [];
      addStrengthsRisksGrid(doc, productStrengths, productRisks, "Product Strengths", "Product Risks", userWatermark);
      
      // Key Features - matches UI Key Features section
      const extractedFeatures = (evaluation.extractedFeatures as any[]) || [];
      if (extractedFeatures.length > 0) {
        if (doc.y > 600) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text("Key Features", 58, doc.y + 6);
        doc.y += 32;
        
        for (const feature of extractedFeatures.slice(0, 6)) {
          const name = feature.name || feature;
          const desc = feature.description || '';
          const category = feature.category || '';
          
          doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
            .text(`• ${name}`, 55, doc.y, { width: 485 });
          if (desc) {
            doc.fontSize(8).font("Helvetica").fillColor(TEXT_SECONDARY)
              .text(desc, 65, doc.y, { width: 475 });
          }
          if (category) {
            doc.fontSize(8).font("Helvetica-Oblique").fillColor(TEXT_MUTED)
              .text(`Category: ${category}`, 65, doc.y);
          }
          doc.moveDown(0.3);
        }
        doc.moveDown(0.5);
      }
      
      // Tech Stack - matches UI Technology Stack section
      const extractedTechStack = (evaluation.extractedTechStack as any[]) || [];
      if (extractedTechStack.length > 0) {
        if (doc.y > 650) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text("Technology Stack", 58, doc.y + 6);
        doc.y += 32;
        
        // Display as tags/badges like UI
        const techNames = extractedTechStack.slice(0, 12).map(t => t.technology || t);
        doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
          .text(techNames.join("  •  "), 55, doc.y, { width: 485 });
        doc.moveDown(0.8);
      }
      
      // ========== TEAM TAB ==========
      addReportSection(doc, "TEAM", userWatermark);
      
      // Team Score Card - matches TeamCompositionSummary component
      const teamScore = evaluation.teamScore || 0;
      addScoreCard(doc, "Team Score", teamScore, 20, BRAND_COLOR, userWatermark);
      
      // Team Composition - matches UI role indicator grid
      const teamComposition = teamData?.teamComposition || evaluation.teamComposition as any;
      if (teamComposition) {
        if (doc.y > 600) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text("Team Composition", 58, doc.y + 6);
        doc.y += 32;
        
        const roleY = doc.y;
        addRoleIndicator(doc, "Business/CEO Leader", !!teamComposition.hasBusinessLeader, 55, roleY);
        addRoleIndicator(doc, "Technical/CTO Leader", !!teamComposition.hasTechnicalLeader, 300, roleY);
        addRoleIndicator(doc, "Industry Expert", !!teamComposition.hasIndustryExpert, 55, roleY + 40);
        addRoleIndicator(doc, "Operations Leader", !!(teamComposition.hasOperationsLeader || teamComposition.hasOperationsLead), 300, roleY + 40);
        
        doc.y = roleY + 85;
        
        // Team Balance assessment
        if (teamComposition.teamBalance) {
          doc.fontSize(9).font("Helvetica").fillColor(TEXT_SECONDARY)
            .text(teamComposition.teamBalance, 55, doc.y, { width: 485 });
          doc.moveDown(0.5);
        }
      }
      
      // Team Strengths & Risks - side-by-side grid
      const teamStrengths = teamData?.keyStrengths || [];
      const teamRisks = teamData?.keyRisks || [];
      addStrengthsRisksGrid(doc, teamStrengths, teamRisks, "Team Strengths", "Team Risks", userWatermark);
      
      // Founder-Market Fit
      if (teamData?.founderMarketFit?.assessment) {
        if (doc.y > 680) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text("Founder-Market Fit", 50);
        doc.moveDown(0.2);
        doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
          .text(teamData.founderMarketFit.assessment, 50, doc.y, { width: 495 });
        doc.moveDown(0.5);
      }
      
      // Key Team Members
      const founders = teamData?.founders || [];
      if (founders.length > 0) {
        if (doc.y > 680) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text("Team Member Profiles", 50);
        doc.moveDown(0.3);
        
        for (const founder of founders.slice(0, 4)) {
          if (doc.y > 650) {
            doc.addPage();
            addWatermark(doc, userWatermark);
            doc.y = 70;
          }
          let founderInfo = `${founder.name || "Unknown"}`;
          if (founder.role) founderInfo += ` - ${founder.role}`;
          doc.fontSize(10).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
            .text(founderInfo, 60);
          
          if (founder.headline) {
            doc.fontSize(9).font("Helvetica-Oblique").fillColor(TEXT_SECONDARY)
              .text(founder.headline, 60, doc.y, { width: 475 });
          }
          
          // Experience
          const experience = founder.experience || [];
          if (Array.isArray(experience) && experience.length > 0) {
            doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
              .text("Experience:", 70);
            for (const exp of experience.slice(0, 3)) {
              const expLine = `${exp.title || ""} at ${exp.company || ""}${exp.startDate ? ` (${exp.startDate}${exp.endDate ? ` - ${exp.endDate}` : " - Present"})` : ""}`;
              doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED)
                .text(`  • ${expLine}`, 70, doc.y, { width: 465 });
            }
          }
          
          // Education
          const education = founder.education || [];
          if (Array.isArray(education) && education.length > 0) {
            doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
              .text("Education:", 70);
            for (const edu of education.slice(0, 2)) {
              const eduLine = `${edu.school || ""}${edu.degree ? ` - ${edu.degree}` : ""}${edu.field ? ` in ${edu.field}` : ""}`;
              doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED)
                .text(`  • ${eduLine}`, 70, doc.y, { width: 465 });
            }
          }
          
          doc.moveDown(0.5);
        }
        doc.moveDown(0.3);
      }
      
      // ========== COMPETITORS TAB ==========
      addReportSection(doc, "COMPETITORS", userWatermark);
      
      // Competitive Advantage Score Card - matches CompetitorAnalysis component
      const competitiveScore = evaluation.competitiveAdvantageScore || 0;
      addScoreCard(doc, "Competitive Advantage Score", competitiveScore, 8, BRAND_COLOR, userWatermark);
      
      // Strategic Positioning - matches UI Strategic Positioning card
      const positioning = competitiveData?.positioning;
      const competitivePositioning = competitiveData?.competitivePositioning;
      if (positioning || competitivePositioning) {
        if (doc.y > 600) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text("Strategic Positioning", 58, doc.y + 6);
        doc.y += 32;
        
        // Strategy and Differentiation in 2-column grid
        const posY = doc.y;
        if (positioning?.strategy) {
          doc.rect(55, posY, 230, 40).fillAndStroke("#f8fafc", "#e2e8f0");
          doc.fontSize(9).font("Helvetica").fillColor(TEXT_MUTED)
            .text("Market Strategy", 65, posY + 8);
          doc.fontSize(10).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
            .text(positioning.strategy, 65, posY + 22);
        }
        
        if (competitivePositioning?.differentiationStrength) {
          doc.rect(300, posY, 230, 40).fillAndStroke("#f8fafc", "#e2e8f0");
          doc.fontSize(9).font("Helvetica").fillColor(TEXT_MUTED)
            .text("Differentiation Strength", 310, posY + 8);
          doc.fontSize(10).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
            .text(competitivePositioning.differentiationStrength.toUpperCase(), 310, posY + 22);
        }
        
        doc.y = posY + 50;
        
        if (positioning?.differentiation) {
          doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_MUTED)
            .text("Differentiation:", 55, doc.y);
          doc.moveDown(0.2);
          doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
            .text(positioning.differentiation, 55, doc.y, { width: 485 });
          doc.moveDown(0.5);
        }
        
        if (positioning?.uniqueValueProp) {
          doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_MUTED)
            .text("Unique Value Proposition:", 55, doc.y);
          doc.moveDown(0.2);
          doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
            .text(positioning.uniqueValueProp, 55, doc.y, { width: 485 });
          doc.moveDown(0.5);
        }
      }
      
      // Strategic Recommendation - matches UI Strategic Recommendation card
      if (competitivePositioning?.positioningRecommendation) {
        if (doc.y > 650) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.rect(50, doc.y, 495, 24).fill("#e0f2fe");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(BRAND_COLOR)
          .text("Strategic Recommendation", 58, doc.y + 6);
        doc.y += 32;
        
        doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
          .text(competitivePositioning.positioningRecommendation, 55, doc.y, { width: 485 });
        doc.moveDown(0.8);
      }
      
      // Barriers to Entry - matches UI Barriers to Entry card
      const barriersToEntry = competitiveData?.barriersToEntry || competitiveData?.["4_barriers_to_entry"];
      if (barriersToEntry && (barriersToEntry.technical || barriersToEntry.regulatory || barriersToEntry.capital || barriersToEntry.network)) {
        if (doc.y > 580) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text("Barriers to Entry", 58, doc.y + 6);
        doc.y += 32;
        
        // 2-column barrier grid
        const barrierY = doc.y;
        let barrierRow = 0;
        
        const barriers = [
          { label: "Technical", value: barriersToEntry.technical },
          { label: "Capital Requirements", value: barriersToEntry.capital },
          { label: "Network Effects", value: barriersToEntry.network },
          { label: "Regulatory", value: barriersToEntry.regulatory },
        ];
        
        for (const barrier of barriers) {
          if (!barrier.value) continue;
          
          const col = barrierRow % 2;
          const x = col === 0 ? 55 : 300;
          const y = barrierY + (Math.floor(barrierRow / 2) * 50);
          
          doc.rect(x, y, 230, 45).fillAndStroke("#f8fafc", "#e2e8f0");
          doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_MUTED)
            .text(barrier.label, x + 10, y + 8);
          doc.fontSize(8).font("Helvetica").fillColor(TEXT_PRIMARY)
            .text(barrier.value, x + 10, y + 22, { width: 210 });
          
          barrierRow++;
        }
        
        doc.y = barrierY + (Math.ceil(barrierRow / 2) * 50) + 10;
      }
      
      // Product Definition (from CompetitorAnalysis)
      const productDefinition = competitiveData?.productDefinition;
      if (productDefinition) {
        doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
          .text("Product Definition", 50);
        doc.moveDown(0.2);
        
        if (productDefinition.coreOffering) {
          doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
            .text("Core Offering: ", 60, doc.y, { continued: true });
          doc.font("Helvetica").fillColor(TEXT_PRIMARY)
            .text(productDefinition.coreOffering, { width: 465 });
        }
        if (productDefinition.targetCustomers) {
          doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
            .text("Target Customers: ", 60, doc.y, { continued: true });
          doc.font("Helvetica").fillColor(TEXT_PRIMARY)
            .text(productDefinition.targetCustomers, { width: 465 });
        }
        if (productDefinition.valueProposition) {
          doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
            .text("Value Proposition: ", 60, doc.y, { continued: true });
          doc.font("Helvetica").fillColor(TEXT_PRIMARY)
            .text(productDefinition.valueProposition, { width: 465 });
        }
        doc.moveDown(0.5);
      }
      
      // Competitive Advantages & Risks - side-by-side grid like UI
      const advantages = competitiveData?.competitiveAdvantages || 
                        competitiveData?.competitivePositioning?.startupAdvantages ||
                        competitiveData?.basicLandscape?.competitiveAdvantages ||
                        competitiveData?.keyStrengths || [];
      const disadvantages = competitiveData?.competitiveDisadvantages || 
                           competitiveData?.competitivePositioning?.startupDisadvantages ||
                           competitiveData?.basicLandscape?.competitiveDisadvantages ||
                           competitiveData?.keyRisks || [];
      
      addStrengthsRisksGrid(doc, advantages, disadvantages, "Competitive Advantages", "Competitive Risks", userWatermark);
      
      // Direct Competitors - styled like UI with count in header
      const directCompetitorProfiles = competitiveData?.competitorProfiles || [];
      const directCompetitorsList = competitiveData?.["3_competitor_analysis"]?.direct_competitors || [];
      const directCompetitors = directCompetitorProfiles.length > 0 ? directCompetitorProfiles : directCompetitorsList;
      const basicDirectCompetitors = competitiveData?.competitorLandscape?.directCompetitors || [];
      
      if (directCompetitors.length > 0 || basicDirectCompetitors.length > 0) {
        if (doc.y > 650) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.rect(50, doc.y, 495, 24).fill("#fef2f2");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(DANGER_COLOR)
          .text(`Direct Competitors (${directCompetitors.length || basicDirectCompetitors.length})`, 58, doc.y + 6);
        doc.y += 32;
        
        // Show as clickable badges/tags like UI
        const directNames = basicDirectCompetitors.length > 0 
          ? basicDirectCompetitors 
          : directCompetitors.map((c: any) => c.name || c.category || c);
        
        doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
          .text(directNames.slice(0, 10).join("  •  "), 55, doc.y, { width: 485 });
        doc.moveDown(0.8);
      }
      
      // Indirect Competitors - styled like UI with count in header
      const indirectCompetitorProfiles = competitiveData?.indirectCompetitorProfiles || [];
      const indirectCompetitorsList = competitiveData?.["3_competitor_analysis"]?.adjacent_indirect_competitors || [];
      const indirectCompetitors = indirectCompetitorProfiles.length > 0 ? indirectCompetitorProfiles : indirectCompetitorsList;
      const basicIndirectCompetitors = competitiveData?.competitorLandscape?.indirectCompetitors || [];
      
      if (indirectCompetitors.length > 0 || basicIndirectCompetitors.length > 0) {
        if (doc.y > 650) {
          doc.addPage();
          addWatermark(doc, userWatermark);
          doc.y = 70;
        }
        
        doc.rect(50, doc.y, 495, 24).fill("#fef3c7");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(WARNING_COLOR)
          .text(`Indirect Competitors (${indirectCompetitors.length || basicIndirectCompetitors.length})`, 58, doc.y + 6);
        doc.y += 32;
        
        // Show as clickable badges/tags like UI
        const indirectNames = basicIndirectCompetitors.length > 0 
          ? basicIndirectCompetitors 
          : indirectCompetitors.map((c: any) => c.name || c.category || c);
        
        doc.fontSize(9).font("Helvetica").fillColor(TEXT_PRIMARY)
          .text(indirectNames.slice(0, 10).join("  •  "), 55, doc.y, { width: 485 });
        doc.moveDown(0.8);
      }
      
      // Market Landscape
      const marketLandscape = competitiveData?.marketLandscape;
      if (marketLandscape) {
        if (marketLandscape.marketTrends && marketLandscape.marketTrends.length > 0) {
          if (doc.y > 680) {
            doc.addPage();
            addWatermark(doc, userWatermark);
            doc.y = 70;
          }
          doc.fontSize(11).font("Helvetica-Bold").fillColor(TEXT_SECONDARY)
            .text("Market Trends", 50);
          doc.moveDown(0.3);
          addBulletList(doc, marketLandscape.marketTrends.slice(0, 4), userWatermark);
        }
        
        if (marketLandscape.emergingThreats && marketLandscape.emergingThreats.length > 0) {
          if (doc.y > 680) {
            doc.addPage();
            addWatermark(doc, userWatermark);
            doc.y = 70;
          }
          doc.fontSize(11).font("Helvetica-Bold").fillColor(WARNING_COLOR)
            .text("Emerging Threats", 50);
          doc.moveDown(0.3);
          addBulletList(doc, marketLandscape.emergingThreats.slice(0, 4), userWatermark);
        }
      }
      
      // ========== SOURCES TAB ==========
      const sources = (evaluation.sources as any[]) || [];
      if (sources.length > 0) {
        addReportSection(doc, "SOURCES", userWatermark);
        
        // Data Sources header card - matches UI header
        doc.rect(50, doc.y, 495, 40).fill("#f1f5f9");
        doc.fontSize(12).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
          .text("Data Sources", 58, doc.y + 8);
        doc.fontSize(9).font("Helvetica").fillColor(TEXT_MUTED)
          .text("All sources used by AI agents to generate this evaluation", 58, doc.y + 24);
        doc.y += 50;
        
        // Group sources by category
        const documentSources = sources.filter(s => s.category === "document");
        const websiteSources = sources.filter(s => s.category === "website");
        const linkedinSources = sources.filter(s => s.category === "linkedin");
        const apiSources = sources.filter(s => s.category === "api");
        const databaseSources = sources.filter(s => s.category === "database");
        
        // Documents - blue icon
        if (documentSources.length > 0) {
          if (doc.y > 650) {
            doc.addPage();
            addWatermark(doc, userWatermark);
            doc.y = 70;
          }
          doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
          doc.fontSize(10).font("Helvetica-Bold").fillColor("#3b82f6")
            .text("Documents", 58, doc.y + 6);
          doc.y += 32;
          
          for (const source of documentSources.slice(0, 5)) {
            doc.rect(55, doc.y, 480, 30).fillAndStroke("#f8fafc", "#e2e8f0");
            doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
              .text(source.name, 65, doc.y + 6);
            if (source.description) {
              doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED)
                .text(source.description, 65, doc.y + 18, { width: 400 });
            }
            if (source.agent) {
              doc.fontSize(7).font("Helvetica").fillColor(TEXT_MUTED)
                .text(source.agent, 470, doc.y + 10, { width: 60, align: "right" });
            }
            doc.y += 35;
          }
          doc.moveDown(0.3);
        }
        
        // Websites - green icon
        if (websiteSources.length > 0) {
          if (doc.y > 650) {
            doc.addPage();
            addWatermark(doc, userWatermark);
            doc.y = 70;
          }
          doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
          doc.fontSize(10).font("Helvetica-Bold").fillColor("#22c55e")
            .text("Websites", 58, doc.y + 6);
          doc.y += 32;
          
          for (const source of websiteSources.slice(0, 5)) {
            doc.rect(55, doc.y, 480, 30).fillAndStroke("#f8fafc", "#e2e8f0");
            doc.fontSize(9).font("Helvetica-Bold").fillColor(BRAND_COLOR)
              .text(source.name, 65, doc.y + 6);
            if (source.url) {
              doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED)
                .text(source.url, 65, doc.y + 18, { width: 400 });
            }
            if (source.agent) {
              doc.fontSize(7).font("Helvetica").fillColor(TEXT_MUTED)
                .text(source.agent, 470, doc.y + 10, { width: 60, align: "right" });
            }
            doc.y += 35;
          }
          doc.moveDown(0.3);
        }
        
        // LinkedIn Profiles - blue LinkedIn color
        if (linkedinSources.length > 0) {
          if (doc.y > 650) {
            doc.addPage();
            addWatermark(doc, userWatermark);
            doc.y = 70;
          }
          doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
          doc.fontSize(10).font("Helvetica-Bold").fillColor("#0a66c2")
            .text("LinkedIn Profiles", 58, doc.y + 6);
          doc.y += 32;
          
          for (const source of linkedinSources.slice(0, 5)) {
            doc.rect(55, doc.y, 480, 30).fillAndStroke("#f8fafc", "#e2e8f0");
            doc.fontSize(9).font("Helvetica-Bold").fillColor(BRAND_COLOR)
              .text(source.name, 65, doc.y + 6);
            if (source.description) {
              doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED)
                .text(source.description, 65, doc.y + 18, { width: 400 });
            }
            if (source.agent) {
              doc.fontSize(7).font("Helvetica").fillColor(TEXT_MUTED)
                .text(source.agent, 470, doc.y + 10, { width: 60, align: "right" });
            }
            doc.y += 35;
          }
          doc.moveDown(0.3);
        }
        
        // AI Analysis Agents - purple color
        if (apiSources.length > 0) {
          if (doc.y > 650) {
            doc.addPage();
            addWatermark(doc, userWatermark);
            doc.y = 70;
          }
          doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
          doc.fontSize(10).font("Helvetica-Bold").fillColor("#a855f7")
            .text("AI Analysis Agents", 58, doc.y + 6);
          doc.y += 32;
          
          for (const source of apiSources.slice(0, 8)) {
            doc.rect(55, doc.y, 480, 30).fillAndStroke("#f8fafc", "#e2e8f0");
            doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
              .text(source.agent || source.name, 65, doc.y + 6);
            if (source.description) {
              doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED)
                .text(source.description, 65, doc.y + 18, { width: 400 });
            }
            if (source.dataExtracted) {
              doc.fontSize(7).font("Helvetica").fillColor(TEXT_MUTED)
                .text(source.dataExtracted, 470, doc.y + 10, { width: 60, align: "right" });
            }
            doc.y += 35;
          }
          doc.moveDown(0.3);
        }
        
        // Database Records - orange color
        if (databaseSources.length > 0) {
          if (doc.y > 650) {
            doc.addPage();
            addWatermark(doc, userWatermark);
            doc.y = 70;
          }
          doc.rect(50, doc.y, 495, 24).fill("#f1f5f9");
          doc.fontSize(10).font("Helvetica-Bold").fillColor("#f97316")
            .text("Database Records", 58, doc.y + 6);
          doc.y += 32;
          
          for (const source of databaseSources.slice(0, 5)) {
            doc.rect(55, doc.y, 480, 30).fillAndStroke("#f8fafc", "#e2e8f0");
            doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_PRIMARY)
              .text(source.name, 65, doc.y + 6);
            if (source.description) {
              doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED)
                .text(source.description, 65, doc.y + 18, { width: 400 });
            }
            if (source.agent) {
              doc.fontSize(7).font("Helvetica").fillColor(TEXT_MUTED)
                .text(source.agent, 470, doc.y + 10, { width: 60, align: "right" });
            }
            doc.y += 35;
          }
          doc.moveDown(0.3);
        }
      }
      
      // Add headers and footers
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        if (i > 0) {
          addReportHeader(doc, startup.name, i + 1, pages.count);
        }
        addFooter(doc, timestamp);
      }
      
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
