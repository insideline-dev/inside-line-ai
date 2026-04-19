import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";
import { env } from "@/env";

const API_BASE_URL = env.VITE_API_BASE_URL;

export interface PdfDownloadTarget {
  startup: Startup;
  evaluation?: Evaluation;
  weights?: Record<string, number> | null;
  watermarkEmail?: string | null;
}

function sanitizeFilename(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-");
  return sanitized || "startup";
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function fetchPdf(startupId: string, kind: "memo" | "report"): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/startups/${startupId}/${kind}.pdf`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/pdf" },
  });

  if (!res.ok) {
    let message = `Failed to download ${kind} (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = typeof body.message === "string" ? body.message : message;
    } catch {
      // non-JSON error body — keep default message
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  if (blob.size === 0) throw new Error(`Empty ${kind} PDF received from server`);
  return blob;
}

export async function downloadMemo(data: PdfDownloadTarget): Promise<void> {
  const blob = await fetchPdf(data.startup.id, "memo");
  triggerBlobDownload(blob, `${sanitizeFilename(data.startup.name)}-Investment-Memo.pdf`);
}

export async function downloadReport(data: PdfDownloadTarget): Promise<void> {
  const blob = await fetchPdf(data.startup.id, "report");
  triggerBlobDownload(blob, `${sanitizeFilename(data.startup.name)}-Startup-Report.pdf`);
}
