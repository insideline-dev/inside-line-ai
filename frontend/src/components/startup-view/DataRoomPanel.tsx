import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Presentation,
  Banknote,
  PieChart,
  Scale,
  Cpu,
  Target,
  TrendingUp,
  FileSignature,
  Users,
  FolderOpen,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileUploadDropzone } from "@/components/FileUploadDropzone";
import { useStartupControllerUpdateDataRoomCategory } from "@/api/generated/startups/startups";
import { UpdateDataRoomCategoryDtoCategory } from "@/api/generated/model/updateDataRoomCategoryDtoCategory";
import { useDataRoomClassification } from "@/lib/auth/useSocket";
import { formatAgentLabels, formatCategoryLabel } from "@/lib/agent-labels";
import { customFetch } from "@/api/client";
import { env } from "@/env";
import { cn } from "@/lib/utils";

export interface DataRoomPanelProps {
  startupId: string;
  role: "admin" | "investor" | "founder";
  allowUpload?: boolean;
  allowCategoryEdit?: boolean;
}

type ClassificationStatus = "pending" | "classifying" | "completed" | "failed";

type DataRoomDoc = {
  id: string;
  assetUrl?: string | null;
  assetMimeType?: string | null;
  assetSize?: number | null;
  originalFileName?: string | null;
  category: string;
  classificationStatus?: ClassificationStatus | null;
  classificationConfidence?: string | number | null;
  routedAgents?: string[] | null;
  classificationError?: string | null;
  classifiedAt?: string | null;
  uploadedAt: string;
  visibleToInvestors?: string[] | null;
};

type DocumentCategory = UpdateDataRoomCategoryDtoCategory;

const CATEGORY_OPTIONS = Object.values(
  UpdateDataRoomCategoryDtoCategory,
) as DocumentCategory[];

const CATEGORY_ORDER: DocumentCategory[] = [
  "pitch_deck",
  "financial",
  "cap_table",
  "legal",
  "technical_product",
  "business_plan",
  "market_research",
  "contract",
  "team_hr",
  "miscellaneous",
] as DocumentCategory[];

const CATEGORY_META: Record<
  string,
  { label: string; description: string; Icon: LucideIcon }
> = {
  pitch_deck: {
    label: "Pitch Deck",
    description: "Investor pitch decks and slide presentations.",
    Icon: Presentation,
  },
  financial: {
    label: "Financial Documents",
    description: "P&L, balance sheet, forecasts, and financial models.",
    Icon: Banknote,
  },
  cap_table: {
    label: "Cap Table",
    description: "Share ownership, option pools, and dilution history.",
    Icon: PieChart,
  },
  legal: {
    label: "Legal Documents",
    description: "Incorporation, IP, compliance, and regulatory filings.",
    Icon: Scale,
  },
  technical_product: {
    label: "Technical / Product",
    description: "Architecture, specs, and product documentation.",
    Icon: Cpu,
  },
  business_plan: {
    label: "Business Plan / Strategy",
    description: "Roadmaps, strategy docs, and long-term plans.",
    Icon: Target,
  },
  market_research: {
    label: "Market Research",
    description: "Market sizing, competitor studies, and customer research.",
    Icon: TrendingUp,
  },
  contract: {
    label: "Contracts & Agreements",
    description: "Customer, vendor, and partnership contracts.",
    Icon: FileSignature,
  },
  team_hr: {
    label: "Team / HR",
    description: "Org charts, employment docs, and HR policies.",
    Icon: Users,
  },
  miscellaneous: {
    label: "Miscellaneous",
    description: "Anything else that doesn't fit above.",
    Icon: FolderOpen,
  },
};

function getCategoryMeta(category: string) {
  return CATEGORY_META[category] ?? CATEGORY_META.miscellaneous;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, idx);
  return `${value < 10 && idx > 0 ? value.toFixed(1) : Math.round(value)} ${units[idx]}`;
}

function getFileName(doc: DataRoomDoc): string {
  if (doc.originalFileName && doc.originalFileName.trim().length > 0) {
    return doc.originalFileName.trim();
  }
  if (!doc.assetUrl) return "Untitled document";
  try {
    const url = new URL(doc.assetUrl);
    const path = decodeURIComponent(url.pathname);
    const name = path.split("/").filter(Boolean).pop();
    return name && name.length > 0 ? name : "Untitled document";
  } catch {
    const path = doc.assetUrl.split("?")[0];
    const name = path.split("/").filter(Boolean).pop();
    return name && name.length > 0 ? name : "Untitled document";
  }
}

async function fetchDataRoom(startupId: string) {
  return customFetch<DataRoomDoc[]>(`/startups/${startupId}/data-room`);
}

async function uploadDocument(startupId: string, file: File, category: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);

  const { getAccessToken } = await import("@/lib/auth/token");
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(
    `${env.VITE_API_BASE_URL}/startups/${startupId}/data-room`,
    {
      method: "POST",
      body: formData,
      credentials: "include",
      headers,
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Upload failed");
  }

  return response.json();
}

function ClassificationBadge({ doc }: { doc: DataRoomDoc }) {
  const status = doc.classificationStatus ?? "pending";
  if (status === "classifying" || status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Classifying
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-destructive"
        title={doc.classificationError ?? "Classification failed"}
      >
        <AlertCircle className="size-3.5" />
        Failed
      </span>
    );
  }
  const confidence =
    typeof doc.classificationConfidence === "string"
      ? Number.parseFloat(doc.classificationConfidence)
      : doc.classificationConfidence;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="size-3.5" />
      {typeof confidence === "number" && !Number.isNaN(confidence)
        ? `${Math.round(confidence * 100)}%`
        : "Classified"}
    </span>
  );
}

function RowCategorySelect({
  doc,
  startupId,
}: {
  doc: DataRoomDoc;
  startupId: string;
}) {
  const queryClient = useQueryClient();
  const updateCategory = useStartupControllerUpdateDataRoomCategory({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: ["data-room", startupId],
        });
        toast.success("Category updated");
      },
      onError: (err) => {
        toast.error((err as Error).message || "Failed to update category");
      },
    },
  });

  return (
    <Select
      value={doc.category}
      disabled={updateCategory.isPending}
      onValueChange={(value) =>
        updateCategory.mutate({
          id: startupId,
          docId: doc.id,
          data: { category: value as DocumentCategory },
        })
      }
    >
      <SelectTrigger className="h-8 w-[180px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CATEGORY_OPTIONS.map((option) => (
          <SelectItem key={option} value={option} className="text-xs">
            {formatCategoryLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface DocumentRowProps {
  doc: DataRoomDoc;
  startupId: string;
  allowCategoryEdit: boolean;
}

function DocumentRow({ doc, startupId, allowCategoryEdit }: DocumentRowProps) {
  const fileName = getFileName(doc);
  const size = formatBytes(doc.assetSize);
  const uploaded = new Date(doc.uploadedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const agentLabels = formatAgentLabels(doc.routedAgents ?? []);

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-background px-3 py-3 transition-colors hover:bg-muted/40">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <FileText className="size-4 text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={fileName}>
              {fileName}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {size} · Uploaded {uploaded}
            </p>
          </div>

          {doc.assetUrl && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5"
            >
              <a href={doc.assetUrl} target="_blank" rel="noreferrer" download>
                <Download className="size-3.5" />
                <span className="hidden sm:inline">Download</span>
              </a>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <ClassificationBadge doc={doc} />

          {agentLabels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {agentLabels.map((label) => (
                <Badge
                  key={label}
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] font-normal"
                >
                  {label}
                </Badge>
              ))}
            </div>
          )}

          {allowCategoryEdit && (
            <div className="ml-auto">
              <RowCategorySelect doc={doc} startupId={startupId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CategorySectionProps {
  category: string;
  docs: DataRoomDoc[];
  startupId: string;
  allowCategoryEdit: boolean;
  defaultOpen: boolean;
}

function CategorySection({
  category,
  docs,
  startupId,
  allowCategoryEdit,
  defaultOpen,
}: CategorySectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { label, description, Icon } = getCategoryMeta(category);
  const count = docs.length;
  const isEmpty = count === 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "rounded-lg border transition-colors",
          open ? "border-border bg-card" : "border-border/60 bg-card/50",
          isEmpty && "opacity-75",
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/40"
          >
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-md",
                isEmpty ? "bg-muted/50" : "bg-primary/10",
              )}
            >
              <Icon
                className={cn(
                  "size-4",
                  isEmpty ? "text-muted-foreground" : "text-primary",
                )}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{label}</span>
                <Badge
                  variant={isEmpty ? "outline" : "secondary"}
                  className="h-5 px-1.5 text-[10px] tabular-nums"
                >
                  {count}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {description}
              </p>
            </div>

            <ChevronRight
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
                open && "rotate-90",
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-2 border-t px-4 py-3">
            {isEmpty ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No documents in this section yet.
              </p>
            ) : (
              docs.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  startupId={startupId}
                  allowCategoryEdit={allowCategoryEdit}
                />
              ))
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function DataRoomPanel({
  startupId,
  role,
  allowUpload = true,
  allowCategoryEdit = true,
}: DataRoomPanelProps) {
  const queryClient = useQueryClient();

  const { data: documents, isLoading: loadingDocs } = useQuery({
    queryKey: ["data-room", startupId],
    queryFn: () => fetchDataRoom(startupId),
    enabled: !!startupId,
  });

  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>(
    CATEGORY_ORDER[0],
  );

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadDocument(startupId, file, uploadCategory),
    onSuccess: () => {
      toast.success("Document uploaded — classifying…");
      queryClient.invalidateQueries({ queryKey: ["data-room", startupId] });
    },
    onError: (err) => {
      toast.error((err as Error).message || "Upload failed");
    },
  });

  const invalidateDataRoom = () => {
    queryClient.invalidateQueries({ queryKey: ["data-room", startupId] });
  };

  useDataRoomClassification(startupId, {
    onClassifying: invalidateDataRoom,
    onClassified: (event) => {
      invalidateDataRoom();
      const agents = formatAgentLabels(event.routedAgents);
      toast.success(
        agents.length > 0
          ? `Classified "${event.fileName}" → ${formatCategoryLabel(event.category)} · used by ${agents.join(", ")}`
          : `Classified "${event.fileName}" → ${formatCategoryLabel(event.category)}`,
      );
    },
    onFailed: (event) => {
      invalidateDataRoom();
      toast.error(`Classification failed for "${event.fileName}": ${event.error}`);
    },
  });

  const effectiveAllowUpload = useMemo(() => {
    if (!allowUpload) return false;
    return role === "admin" || role === "founder";
  }, [allowUpload, role]);

  const effectiveAllowCategoryEdit = useMemo(() => {
    if (!allowCategoryEdit) return false;
    return role === "admin" || role === "founder";
  }, [allowCategoryEdit, role]);

  const docsByCategory = useMemo(() => {
    const map = new Map<string, DataRoomDoc[]>();
    for (const key of CATEGORY_ORDER) map.set(key, []);
    for (const doc of (documents as DataRoomDoc[] | undefined) ?? []) {
      const bucket = map.get(doc.category) ?? map.get("miscellaneous")!;
      bucket.push(doc);
    }
    for (const [key, list] of map) {
      list.sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
      );
      map.set(key, list);
    }
    return map;
  }, [documents]);

  const totalDocs =
    ((documents as DataRoomDoc[] | undefined) ?? []).length ?? 0;

  return (
    <div className="space-y-6">
      {effectiveAllowUpload && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
                <Upload className="size-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Upload document</CardTitle>
                <CardDescription className="text-xs">
                  Category is auto-detected after upload. You can change it later.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="data-room-upload-category"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Category hint
              </label>
              <Select
                value={uploadCategory}
                onValueChange={(value) =>
                  setUploadCategory(value as DocumentCategory)
                }
              >
                <SelectTrigger id="data-room-upload-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((key) => {
                    const { label, Icon } = getCategoryMeta(key);
                    return (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className="size-3.5 text-muted-foreground" />
                          {label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <FileUploadDropzone onUpload={(file) => uploadMutation.mutate(file)} />

            {uploadMutation.isPending && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Uploading…
              </p>
            )}
            {uploadMutation.error && (
              <p className="text-sm text-destructive">
                {(uploadMutation.error as Error).message}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Documents</h2>
            <p className="text-xs text-muted-foreground">
              {totalDocs === 0
                ? "No documents uploaded yet."
                : `${totalDocs} document${totalDocs === 1 ? "" : "s"} across ${CATEGORY_ORDER.length} sections.`}
            </p>
          </div>
        </div>

        {loadingDocs ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="space-y-2">
            {CATEGORY_ORDER.map((category) => {
              const docs = docsByCategory.get(category) ?? [];
              if (role === "investor" && docs.length === 0) return null;
              return (
                <CategorySection
                  key={category}
                  category={category}
                  docs={docs}
                  startupId={startupId}
                  allowCategoryEdit={effectiveAllowCategoryEdit}
                  defaultOpen={docs.length > 0}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
