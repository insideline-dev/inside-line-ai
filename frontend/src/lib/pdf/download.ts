import { env } from "@/env";

const API_BASE_URL = env.VITE_API_BASE_URL;

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFilename(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-");
  return sanitized || "startup";
}

async function fetchPdf(path: string): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/pdf" },
  });
  if (!res.ok) {
    const message = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(message || `HTTP ${res.status}`);
  }
  return res.blob();
}

export interface PdfDownloadTarget {
  startup: { id: string; name: string };
}

export async function downloadMemo(data: PdfDownloadTarget): Promise<void> {
  const blob = await fetchPdf(`/startups/${data.startup.id}/memo.pdf`);
  await downloadBlob(blob, `${sanitizeFilename(data.startup.name)}-Investment-Memo.pdf`);
}

export async function downloadReport(data: PdfDownloadTarget): Promise<void> {
  const blob = await fetchPdf(`/startups/${data.startup.id}/report.pdf`);
  await downloadBlob(blob, `${sanitizeFilename(data.startup.name)}-Analysis-Report.pdf`);
}
