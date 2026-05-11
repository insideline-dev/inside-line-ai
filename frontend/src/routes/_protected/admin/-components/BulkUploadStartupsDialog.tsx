import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, FileText, Download, AlertTriangle } from "lucide-react";
import {
  useCsvBulkUpload,
  buildErrorCsv,
  type BulkUploadRowStatus,
  type BulkUploadSummary,
} from "@/lib/admin/useCsvBulkUpload";

const TEMPLATE = `company,website,founder_name,founder_email,deck_url,stage,funding_target
Acme Robotics,https://acme.example,Alice Founder,alice@acme.example,,seed,500000
`;

function statusBadge(status: BulkUploadRowStatus) {
  if (status === "created") {
    return (
      <Badge
        variant="outline"
        className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
      >
        Created
      </Badge>
    );
  }
  if (status === "duplicate_merged") {
    return (
      <Badge
        variant="outline"
        className="bg-amber-500/10 text-amber-700 border-amber-500/20"
      >
        Duplicate
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="bg-destructive/10 text-destructive border-destructive/20"
    >
      Failed
    </Badge>
  );
}

interface Props {
  triggerLabel?: string;
}

export function BulkUploadStartupsDialog({
  triggerLabel = "Bulk Upload",
}: Props = {}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [summary, setSummary] = useState<BulkUploadSummary | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const mutation = useCsvBulkUpload();

  const reset = useCallback(() => {
    setSelected(null);
    setSummary(null);
    mutation.reset();
    if (inputRef.current) inputRef.current.value = "";
  }, [mutation]);

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (
        !file.name.toLowerCase().endsWith(".csv") &&
        !file.type.includes("csv")
      ) {
        toast.error("File must be a CSV");
        return;
      }
      if (file.size > 1 * 1024 * 1024) {
        toast.error("CSV must be 1MB or smaller");
        return;
      }
      setSelected(file);
      setSummary(null);
    },
    [],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0] ?? null;
      handleFile(file);
    },
    [handleFile],
  );

  const onSubmit = useCallback(() => {
    if (!selected) return;
    mutation.mutate(selected, {
      onSuccess: (data) => {
        setSummary(data);
        const noun = data.created === 1 ? "startup" : "startups";
        if (data.failed > 0) {
          toast.warning(
            `${data.created} ${noun} created, ${data.failed} failed`,
          );
        } else if (data.duplicate_merged > 0) {
          toast.success(
            `${data.created} created, ${data.duplicate_merged} duplicate(s) merged`,
          );
        } else {
          toast.success(`${data.created} ${noun} created`);
        }
        queryClient.invalidateQueries({ queryKey: ["/admin/startups"] });
        queryClient.invalidateQueries({ queryKey: ["/admin/stats"] });
      },
      onError: (error) => {
        toast.error(
          error instanceof Error ? error.message : "Bulk upload failed",
        );
      },
    });
  }, [mutation, queryClient, selected]);

  const downloadErrors = useCallback(() => {
    if (!summary) return;
    const csv = buildErrorCsv(summary);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bulk-upload-errors-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [summary]);

  const downloadTemplate = useCallback(() => {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cohort-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const isUploading = mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UploadCloud className="w-4 h-4 mr-2" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        data-testid="bulk-upload-dialog"
      >
        <DialogHeader>
          <DialogTitle>Bulk Upload Cohort</DialogTitle>
          <DialogDescription>
            Upload a CSV of cohort startups. Each row is fed through the
            standard intake pipeline (dedupe, normalization, AI analysis). Max
            100 rows / 1MB.
          </DialogDescription>
        </DialogHeader>

        {!summary && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/30 hover:border-muted-foreground/60"
              }`}
              data-testid="bulk-upload-dropzone"
            >
              <UploadCloud className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium text-sm">
                Drag a CSV here or click to choose a file
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Required columns: company, website, founder_name, founder_email
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                data-testid="bulk-upload-input"
              />
            </div>

            {selected && (
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/40">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selected.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(null)}
                  disabled={isUploading}
                >
                  Remove
                </Button>
              </div>
            )}

            {isUploading && (
              <div className="space-y-2">
                <Progress value={undefined} />
                <p className="text-xs text-muted-foreground text-center">
                  Processing rows…
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={downloadTemplate}
                disabled={isUploading}
              >
                <Download className="w-4 h-4 mr-1.5" />
                Download template
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={onSubmit}
                  disabled={!selected || isUploading}
                >
                  {isUploading ? "Uploading…" : "Upload"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {summary && (
          <div className="space-y-4" data-testid="bulk-upload-results">
            <div className="grid grid-cols-4 gap-3">
              <SummaryStat label="Total" value={summary.total} />
              <SummaryStat
                label="Created"
                value={summary.created}
                tone="emerald"
              />
              <SummaryStat
                label="Duplicates"
                value={summary.duplicate_merged}
                tone="amber"
              />
              <SummaryStat
                label="Failed"
                value={summary.failed}
                tone="destructive"
              />
            </div>

            <div className="border rounded-md max-h-[40vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => (
                    <tr
                      key={`${row.rowIndex}-${row.company}`}
                      className={
                        row.status === "failed"
                          ? "bg-destructive/5"
                          : row.status === "duplicate_merged"
                            ? "bg-amber-500/5"
                            : ""
                      }
                      data-testid={`bulk-upload-row-${row.status}`}
                    >
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {row.rowIndex}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {row.company || (
                          <span className="text-muted-foreground italic">
                            (blank)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{statusBadge(row.status)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.reason ?? row.startupId ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {summary.failed > 0 && (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                    <span>
                      {summary.failed} row{summary.failed === 1 ? "" : "s"}{" "}
                      need attention
                    </span>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {summary.failed > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={downloadErrors}
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    Download errors
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={reset}>
                  Upload another
                </Button>
                <Button type="button" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "amber" | "destructive";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/40 text-emerald-700"
      : tone === "amber"
        ? "border-amber-500/40 text-amber-700"
        : tone === "destructive"
          ? "border-destructive/40 text-destructive"
          : "border-border text-foreground";
  return (
    <div className={`border rounded-md px-3 py-2 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums leading-tight">
        {value}
      </p>
    </div>
  );
}
