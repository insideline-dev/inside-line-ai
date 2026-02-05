import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUploadDropzone } from "@/components/FileUploadDropzone";
import { env } from "@/env";

export const Route = createFileRoute("/_protected/admin/bulk-data")({
  component: BulkDataPage,
});

type ImportResult = {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
};

async function uploadStartups(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${env.VITE_API_BASE_URL}/admin/bulk/import-startups`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to import startups");
  }

  return response.json();
}

function BulkDataPage() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const importMutation = useMutation({
    mutationFn: uploadStartups,
  });

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const response = await fetch(
        `${env.VITE_API_BASE_URL}/admin/bulk/export-startups`,
        {
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to export startups");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "startups.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setExportError((error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">Bulk Data Management</h1>
        <p className="text-muted-foreground text-pretty">
          Import or export startup data in CSV format.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Import Startups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUploadDropzone
            accept=".csv"
            onUpload={(file) => importMutation.mutate(file)}
          />
          {importMutation.error && (
            <p className="text-sm text-destructive text-pretty">
              {(importMutation.error as Error).message}
            </p>
          )}
          {importMutation.data && (
            <div className="text-sm text-muted-foreground text-pretty">
              Imported {importMutation.data.imported} startups, skipped{" "}
              {importMutation.data.skipped}.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-balance">Export Startups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Export Startups CSV"}
          </Button>
          {exportError && (
            <p className="text-sm text-destructive text-pretty">{exportError}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
