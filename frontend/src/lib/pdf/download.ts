import { pdf } from "@react-pdf/renderer";
import { InvestmentMemoPDF } from "./memo-pdf";
import { AnalysisReportPDF } from "./report-pdf";
import type { PdfData } from "./shared";

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke asynchronously to avoid intermittent browser download failures.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFilename(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-");
  return sanitized || "startup";
}

export async function downloadMemo(data: PdfData): Promise<void> {
  const doc = InvestmentMemoPDF(data);
  const blob = await pdf(doc).toBlob();
  await downloadBlob(blob, `${sanitizeFilename(data.startup.name)}-Investment-Memo.pdf`);
}

export async function downloadReport(data: PdfData): Promise<void> {
  const doc = AnalysisReportPDF(data);
  const blob = await pdf(doc).toBlob();
  await downloadBlob(blob, `${sanitizeFilename(data.startup.name)}-Analysis-Report.pdf`);
}
