import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  getStartupControllerFindAllQueryKey,
  startupControllerCreate,
  startupControllerExtractDeckMetadata,
  startupControllerRegisterDataRoomFilesBulk,
  startupControllerSubmit,
} from "@/api/generated/startups/startups";
import { getInvestorControllerGetPipelineQueryKey } from "@/api/generated/investor/investor";
import { storageControllerGetUploadUrl } from "@/api/generated/storage/storage";
import type { CreateStartupDto, ExtractDeckMetadataResponseDto } from "@/api/generated/model";
import { CreateStartupDtoStage } from "@/api/generated/model/createStartupDtoStage";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { unwrapApiResponse } from "@/lib/api-utils";
import { Upload, FileText, Loader2, CheckCircle2, Sparkles } from "lucide-react";

type Phase = "uploading" | "extracting" | "review" | "submitting" | "done" | "error";

type ExtractionResult = ExtractDeckMetadataResponseDto;

// ─── Stage normalization ──────────────────────────────────────────────────────

const STAGE_VALUES = Object.values(CreateStartupDtoStage) as CreateStartupDtoStage[];

const STAGE_LABELS: Record<CreateStartupDtoStage, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c: "Series C",
  series_d: "Series D",
  series_e: "Series E",
  series_f_plus: "Series F+",
};

/** Maps free-form AI-extracted stage text to a valid enum value, or "" when unknown. */
function normalizeStage(raw: string | null | undefined): CreateStartupDtoStage | "" {
  if (!raw) return "";

  const slug = raw
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z_]/g, "");

  if (!slug) return "";

  // Direct enum match.
  if ((STAGE_VALUES as string[]).includes(slug)) {
    return slug as CreateStartupDtoStage;
  }

  // Pre-seed variants.
  if (/^pre_?seed/.test(slug)) return "pre_seed";

  // Seed (but not pre-seed, handled above).
  if (slug.startsWith("seed")) return "seed";

  // Series A–E, with anything F and beyond folded into series_f_plus.
  const seriesMatch = slug.match(/series_?([a-z])/);
  if (seriesMatch) {
    const letter = seriesMatch[1];
    if (letter >= "a" && letter <= "e") {
      return `series_${letter}` as CreateStartupDtoStage;
    }
    return "series_f_plus";
  }

  if (slug.includes("f_plus")) return "series_f_plus";

  return "";
}

// ─── Drop Zone ──────────────────────────────────────────────────────────────

function hasFiles(e: globalThis.DragEvent): boolean {
  return e.dataTransfer?.types?.includes("Files") ?? false;
}

export function useQuickDeckDrop() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    const onDragEnter = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) {
        setIsDragOver(true);
      }
    };

    const onDragOver = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const onDragLeave = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragOver(false);
      }
    };

    const onDrop = (e: globalThis.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      if (!e.dataTransfer?.files.length) return;
      const files = Array.from(e.dataTransfer.files);
      const pdf = files.find((f) => f.type === "application/pdf");
      if (pdf) {
        setDroppedFile(pdf);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const clearDroppedFile = useCallback(() => {
    setDroppedFile(null);
  }, []);

  return { isDragOver, droppedFile, clearDroppedFile };
}

export function DropZoneOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-primary bg-primary/5 p-12">
        <Upload className="h-12 w-12 text-primary" />
        <div className="text-center">
          <p className="text-lg font-semibold">Drop pitch deck to analyze</p>
          <p className="text-sm text-muted-foreground">PDF files only</p>
        </div>
      </div>
    </div>
  );
}

// ─── Quick Submit Dialog ─────────────────────────────────────────────────────

async function uploadAndExtract(
  file: File,
  onProgress: (phase: Phase, progress: number) => void,
): Promise<{ key: string; publicUrl: string; extraction: ExtractionResult }> {
  onProgress("uploading", 10);

  const uploadResult = await storageControllerGetUploadUrl({
    assetType: "transcripts",
    contentType: "application/pdf",
  });
  const data = unwrapApiResponse<{
    uploadUrl?: string;
    key?: string;
    publicUrl?: string;
  }>(uploadResult);

  if (!data.uploadUrl || !data.key) {
    throw new Error("No upload URL received");
  }

  onProgress("uploading", 30);

  await fetch(data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  });

  onProgress("extracting", 60);

  const extraction = await startupControllerExtractDeckMetadata({
    storageKey: data.key,
  });

  onProgress("extracting", 100);

  return {
    key: data.key,
    publicUrl: data.publicUrl || "",
    extraction: unwrapApiResponse<ExtractionResult>(extraction),
  };
}

async function createAndSubmit(
  file: File,
  upload: { key: string; publicUrl: string },
  name: string,
  website: string,
  stage: CreateStartupDto["stage"] | undefined,
  extra: Pick<ExtractionResult, "industry" | "description">,
) {
  let normalizedWebsite = website.trim();
  if (!/^https?:\/\//i.test(normalizedWebsite)) {
    normalizedWebsite = `https://${normalizedWebsite}`;
  }

  const createPayload: CreateStartupDto = {
    name: name.trim(),
    website: normalizedWebsite,
    pitchDeckUrl: upload.publicUrl,
    pitchDeckPath: upload.key,
    industry: extra.industry || undefined,
    stage: stage,
    description: extra.description || undefined,
  };

  const createResult = await startupControllerCreate(createPayload);

  // The generated response types `data` as `void`; the backend returns the
  // created startup, so narrow it to read the id.
  const created = unwrapApiResponse<{ id?: string }>(createResult);
  if (!created?.id) throw new Error("Startup created but no ID returned");

  await startupControllerRegisterDataRoomFilesBulk(created.id, {
    files: [
      {
        path: upload.key,
        name: file.name,
        type: "application/pdf",
        size: file.size,
      },
    ],
  });

  await startupControllerSubmit(created.id, {});

  return created.id;
}

export function QuickSubmitDialog({
  file,
  open,
  onClose,
}: {
  file: File;
  open: boolean;
  onClose: () => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [stage, setStage] = useState<CreateStartupDtoStage | "">("");
  const [phase, setPhase] = useState<Phase>("uploading");
  const [progress, setProgress] = useState(0);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  const uploadRef = useRef<{ key: string; publicUrl: string } | null>(null);
  const extractionRef = useRef<ExtractionResult | null>(null);
  const startedRef = useRef(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getStartupControllerFindAllQueryKey() });
    queryClient.invalidateQueries({ queryKey: getInvestorControllerGetPipelineQueryKey() });
  }, [queryClient]);

  // Upload + AI extraction pipeline
  useEffect(() => {
    if (!open || startedRef.current) return;
    startedRef.current = true;

    uploadAndExtract(file, (p, pct) => {
      setPhase(p);
      setProgress(pct);
    })
      .then(async (result) => {
        uploadRef.current = { key: result.key, publicUrl: result.publicUrl };
        extractionRef.current = result.extraction;

        const extractedName = result.extraction.companyName || "";
        const extractedWebsite = result.extraction.website || "";
        const normalizedStage = normalizeStage(result.extraction.stage);

        setCompanyName(extractedName);
        setWebsite(extractedWebsite);
        setStage(normalizedStage);

        // Auto-submit only when all of name, website, and a valid stage were
        // inferred. Otherwise fall through to the review form so the user can
        // confirm the details and pick a stage.
        if (extractedName && extractedWebsite && normalizedStage) {
          setPhase("submitting");
          setAutoSubmitted(true);

          try {
            await createAndSubmit(
              file,
              { key: result.key, publicUrl: result.publicUrl },
              extractedName,
              extractedWebsite,
              normalizedStage,
              result.extraction,
            );
            setPhase("done");
            toast.success(`${extractedName} submitted for analysis`);
            invalidateQueries();
            setTimeout(onClose, 1500);
          } catch (error) {
            setPhase("review");
            setAutoSubmitted(false);
            toast.error(
              error instanceof Error ? error.message : "Auto-submission failed",
            );
          }
        } else {
          setPhase("review");
        }
      })
      .catch(() => {
        setPhase("error");
        toast.error("Failed to process deck. Please try again.");
      });
  }, [open, file, toast, onClose, invalidateQueries]);

  // Manual submit
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!uploadRef.current) throw new Error("File not uploaded yet");
      if (!companyName.trim()) throw new Error("Company name is required");
      if (!website.trim()) throw new Error("Website is required");

      setPhase("submitting");

      return createAndSubmit(
        file,
        uploadRef.current,
        companyName,
        website,
        stage || undefined,
        extractionRef.current ?? { industry: null, description: null },
      );
    },
    onSuccess: () => {
      setPhase("done");
      toast.success("Startup submitted for analysis");
      invalidateQueries();
      setTimeout(onClose, 1200);
    },
    onError: (error) => {
      setPhase("review");
      toast.error(error instanceof Error ? error.message : "Submission failed");
    },
  });

  const isProcessing = phase === "uploading" || phase === "extracting";
  const isReview = phase === "review";
  const isSubmitting = phase === "submitting";
  const isDone = phase === "done";
  const canSubmit = isReview && companyName.trim().length > 0 && website.trim().length > 0;

  const phaseLabel =
    phase === "uploading"
      ? "Uploading deck..."
      : phase === "extracting"
        ? "Extracting company details..."
        : phase === "submitting" && autoSubmitted
          ? "Auto-submitting for analysis..."
          : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isSubmitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick analyze</DialogTitle>
          <DialogDescription>
            {isProcessing
              ? "Processing your pitch deck..."
              : isDone
                ? "Startup submitted for analysis."
                : "Confirm the company details to start analysis."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File indicator */}
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
            <FileText className="h-5 w-5 shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
            {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {!isProcessing && phase !== "error" && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
          </div>

          {/* Progress bar for upload + extraction */}
          {(isProcessing || (isSubmitting && autoSubmitted)) && (
            <div className="space-y-2">
              <Progress value={progress} className="h-1.5" />
              {phaseLabel && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {phase === "extracting" && (
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  )}
                  {phaseLabel}
                </div>
              )}
            </div>
          )}

          {/* Form fields — shown once extraction completes */}
          {(isReview || (isSubmitting && !autoSubmitted) || isDone) && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="quick-name">
                  Company name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="quick-name"
                  placeholder="e.g. Acme Corp"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={isSubmitting || isDone}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quick-website">
                  Website <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="quick-website"
                  placeholder="e.g. acme.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  disabled={isSubmitting || isDone}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSubmit) {
                      e.preventDefault();
                      submitMutation.mutate();
                    }
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quick-stage">Funding stage</Label>
                <Select
                  value={stage || "none"}
                  onValueChange={(value) =>
                    setStage(value === "none" ? "" : (value as CreateStartupDtoStage))
                  }
                  disabled={isSubmitting || isDone}
                >
                  <SelectTrigger id="quick-stage">
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {STAGE_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {STAGE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Error state */}
          {phase === "error" && (
            <p className="text-sm text-destructive">
              Failed to process the deck. Please close and try again.
            </p>
          )}
        </div>

        <DialogFooter>
          {!isDone && !isProcessing && !(isSubmitting && autoSubmitted) && (
            <>
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Analyze startup"
                )}
              </Button>
            </>
          )}
          {isDone && (
            <Button onClick={onClose}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
