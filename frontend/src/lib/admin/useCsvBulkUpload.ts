import { useMutation } from "@tanstack/react-query";
import { env } from "@/env";

// =============================================================================
// Bulk-upload manual hook.
//
// Orval cannot generate a multipart/form-data hook from the NestJS Swagger
// output (the @UploadedFile interceptor is not surfaced in OpenAPI). Until
// `bun generate:api` is wired into CI and the swagger output is enriched, the
// cleanest place to keep this single multipart call is here, in `lib/admin/`,
// rather than hand-editing `src/api/generated/`.
//
// Follow-up: re-run `bun generate:api` once the backend is up and revisit if
// Orval grows multipart support — track in DS-E1-F6-S1.
// =============================================================================

export type BulkUploadRowStatus = "created" | "duplicate_merged" | "failed";

export interface BulkUploadRowResult {
  rowIndex: number;
  company: string;
  status: BulkUploadRowStatus;
  startupId?: string;
  reason?: string;
}

export interface BulkUploadSummary {
  total: number;
  created: number;
  duplicate_merged: number;
  failed: number;
  rows: BulkUploadRowResult[];
}

const ENDPOINT = "/admin/startups/bulk-upload";

async function uploadCsv(file: File): Promise<BulkUploadSummary> {
  const body = new FormData();
  body.append("file", file, file.name);

  // The shared `customFetch` mutator always sets Content-Type: application/json,
  // which breaks multipart. We use fetch directly here — credentials: include
  // mirrors the rest of the API client so the JWT httpOnly cookie travels.
  const response = await fetch(`${env.VITE_API_BASE_URL}${ENDPOINT}`, {
    method: "POST",
    credentials: "include",
    body,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      typeof error?.message === "string"
        ? error.message
        : Array.isArray(error?.message)
          ? error.message.join("; ")
          : `Upload failed (${response.status})`;
    throw new Error(message);
  }

  return response.json() as Promise<BulkUploadSummary>;
}

export function useCsvBulkUpload() {
  return useMutation({
    mutationKey: ["admin", "startups", "bulk-upload"],
    mutationFn: (file: File) => uploadCsv(file),
  });
}

/** Build a CSV (with header) that lists every failed row, for re-download. */
export function buildErrorCsv(summary: BulkUploadSummary): string {
  const header = "rowIndex,company,reason";
  const lines = summary.rows
    .filter((row) => row.status === "failed")
    .map((row) =>
      [row.rowIndex, escapeCsv(row.company), escapeCsv(row.reason ?? "")].join(","),
    );
  return [header, ...lines].join("\n");
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
