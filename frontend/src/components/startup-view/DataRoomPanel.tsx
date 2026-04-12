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
  Search,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileUploadDropzone } from "@/components/FileUploadDropzone";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStartupControllerUpdateDataRoomCategory } from "@/api/generated/startups/startups";
import { UpdateDataRoomCategoryDtoCategory } from "@/api/generated/model/updateDataRoomCategoryDtoCategory";
import { useDataRoomClassification } from "@/lib/auth/useSocket";
import {
  RESEARCH_AGENT_LABELS,
  SYNTHESIS_AGENT_LABELS,
  formatAgentLabel,
  formatAgentLabels,
  formatCategoryLabel,
} from "@/lib/agent-labels";
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

  const response = await fetch(
    `${env.VITE_API_BASE_URL}/startups/${startupId}/data-room`,
    {
      method: "POST",
      body: formData,
      credentials: "include",
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Upload failed");
  }

  return response.json();
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
      <SelectTrigger
        aria-label="Change category"
        className="h-8 w-[150px] border-transparent bg-transparent text-xs text-muted-foreground shadow-none hover:border-border hover:text-foreground focus:border-border focus:text-foreground"
      >
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

function AgentsTooltip({ routedAgents }: { routedAgents: string[] }) {
  const evaluationAgents = routedAgents.map(formatAgentLabel);
  const evalCount = evaluationAgents.length;
  const researchCount = RESEARCH_AGENT_LABELS.length;
  const synthesisCount = SYNTHESIS_AGENT_LABELS.length;
  const total = evalCount + researchCount + synthesisCount;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="cursor-help rounded border-b border-dotted border-muted-foreground/50 tabular-nums underline-offset-2 hover:text-foreground"
        >
          {total} {total === 1 ? "agent" : "agents"}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className="max-w-xs space-y-3 p-3 text-xs"
      >
        <AgentsTooltipGroup
          title="Evaluation"
          count={evalCount}
          accent="bg-primary"
          agents={evaluationAgents}
          emptyHint="No evaluation agents routed"
        />
        <AgentsTooltipGroup
          title="Research"
          count={researchCount}
          accent="bg-sky-500"
          agents={RESEARCH_AGENT_LABELS}
          note="All research agents receive every document"
        />
        <AgentsTooltipGroup
          title="Synthesis"
          count={synthesisCount}
          accent="bg-amber-500"
          agents={SYNTHESIS_AGENT_LABELS}
          note="Uses evaluation + research outputs"
        />
      </TooltipContent>
    </Tooltip>
  );
}

function AgentsTooltipGroup({
  title,
  count,
  accent,
  agents,
  note,
  emptyHint,
}: {
  title: string;
  count: number;
  accent: string;
  agents: string[];
  note?: string;
  emptyHint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full", accent)} aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
          {title}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      {agents.length > 0 ? (
        <ul className="space-y-0.5 pl-3.5 text-[11px] text-muted-foreground">
          {agents.map((name) => (
            <li key={name} className="truncate">
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pl-3.5 text-[11px] italic text-muted-foreground">
          {emptyHint ?? "None"}
        </p>
      )}
      {note && (
        <p className="pl-3.5 text-[10px] leading-snug text-muted-foreground/80">
          {note}
        </p>
      )}
    </div>
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
  const agentCount = (doc.routedAgents ?? []).length;
  const status = doc.classificationStatus ?? "pending";
  const rawConfidence =
    typeof doc.classificationConfidence === "string"
      ? Number.parseFloat(doc.classificationConfidence)
      : doc.classificationConfidence;
  const confidencePct =
    typeof rawConfidence === "number" && !Number.isNaN(rawConfidence)
      ? Math.round(rawConfidence * 100)
      : null;

  return (
    <div className="group flex items-center gap-3 rounded-md border border-transparent bg-background px-3 py-2 transition-all hover:border-border hover:bg-muted/40 hover:shadow-sm">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <FileText className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={fileName}>
          {fileName}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">{size}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{uploaded}</span>
          {agentCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <AgentsTooltip routedAgents={doc.routedAgents ?? []} />
            </>
          )}
          {status === "completed" && confidencePct !== null && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3" />
                {confidencePct}%
              </span>
            </>
          )}
          {(status === "pending" || status === "classifying") && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
                Classifying
              </span>
            </>
          )}
          {status === "failed" && (
            <>
              <span aria-hidden>·</span>
              <span
                className="inline-flex items-center gap-1 text-destructive"
                title={doc.classificationError ?? "Classification failed"}
              >
                <AlertCircle className="size-3" />
                Failed
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {allowCategoryEdit && (
          <RowCategorySelect doc={doc} startupId={startupId} />
        )}
        {doc.assetUrl && (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
          >
            <a
              href={doc.assetUrl}
              target="_blank"
              rel="noreferrer"
              download
              aria-label={`Download ${fileName}`}
            >
              <Download className="size-4" />
            </a>
          </Button>
        )}
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
          "overflow-hidden rounded-lg border bg-card",
          isEmpty && "opacity-70",
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-3 bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/60"
          >
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-md",
                isEmpty
                  ? "bg-background text-muted-foreground"
                  : "bg-primary/10 text-primary",
              )}
            >
              <Icon className="size-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{label}</span>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-medium tabular-nums text-primary">
                  {count}
                </span>
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
          <div className="space-y-1 border-t p-2">
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

  const [searchTerm, setSearchTerm] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadDocument(startupId, file, "miscellaneous"),
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

  const allDocs = useMemo(
    () => (documents as DataRoomDoc[] | undefined) ?? [],
    [documents],
  );

  const filteredDocs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return allDocs;
    return allDocs.filter((doc) =>
      getFileName(doc).toLowerCase().includes(q),
    );
  }, [allDocs, searchTerm]);

  const docsByCategory = useMemo(() => {
    const map = new Map<string, DataRoomDoc[]>();
    for (const key of CATEGORY_ORDER) map.set(key, []);
    for (const doc of filteredDocs) {
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
  }, [filteredDocs]);

  const totalDocs = allDocs.length;
  const filledCategories = useMemo(
    () =>
      CATEGORY_ORDER.filter(
        (key) => (docsByCategory.get(key)?.length ?? 0) > 0,
      ).length,
    [docsByCategory],
  );

  const showEmptyEffective = role === "investor" ? false : showEmpty;
  const visibleCategories = CATEGORY_ORDER.filter((category) => {
    const count = docsByCategory.get(category)?.length ?? 0;
    if (role === "investor") return count > 0;
    return showEmptyEffective || count > 0;
  });
  const hiddenEmptyCount = CATEGORY_ORDER.length - filledCategories;

  return (
    <TooltipProvider delayDuration={100}>
    <div className="space-y-6">
      {effectiveAllowUpload && (
        <div className="space-y-2">
          <FileUploadDropzone
            onUpload={(file) => uploadMutation.mutate(file)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              Documents are auto-classified into the right section.
            </p>
            {uploadMutation.isPending && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <Loader2 className="size-3.5 animate-spin" />
                Uploading…
              </span>
            )}
            {uploadMutation.error && !uploadMutation.isPending && (
              <span className="text-xs text-destructive">
                {(uploadMutation.error as Error).message}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search documents by name…"
              className="pl-9"
              aria-label="Search documents"
            />
          </div>
          {role !== "investor" && totalDocs > 0 && hiddenEmptyCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowEmpty((prev) => !prev)}
              className="h-9 gap-1.5 text-xs"
            >
              {showEmptyEffective ? (
                <>
                  <EyeOff className="size-3.5" />
                  Hide empty sections
                </>
              ) : (
                <>
                  <Eye className="size-3.5" />
                  Show all sections ({hiddenEmptyCount})
                </>
              )}
            </Button>
          )}
        </div>

        {loadingDocs ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : totalDocs === 0 ? (
          <EmptyState canUpload={effectiveAllowUpload} />
        ) : visibleCategories.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No documents match "{searchTerm}".
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleCategories.map((category) => {
              const docs = docsByCategory.get(category) ?? [];
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
    </TooltipProvider>
  );
}

function EmptyState({ canUpload }: { canUpload: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
        <FolderOpen className="size-5 text-primary" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">Your data room is empty</h3>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        {canUpload
          ? "Drag a pitch deck, financial model, or cap table above to get started. We'll sort it into the right section automatically."
          : "No documents have been shared yet."}
      </p>
    </div>
  );
}
