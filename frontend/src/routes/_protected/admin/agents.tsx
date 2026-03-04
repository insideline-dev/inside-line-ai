import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminControllerGetAiModelConfigQueryKey,
  useAdminControllerCreateAiModelConfigDraft,
  useAdminControllerGetAiModelConfig,
  useAdminControllerGetAiPromptContextSchema,
  useAdminControllerGetAiPromptFlow,
  useAdminControllerGetAiPromptOutputSchema,
  useAdminControllerGetAiPromptRevisions,
  useAdminControllerGetAiPrompts,
  useAdminControllerPublishAiModelConfigDraft,
  useAdminControllerPreviewAiPrompt,
  useAdminControllerPreviewAiPipelineContext,
  useAdminControllerUpdateAiModelConfigDraft,
} from "@/api/generated/admin/admin";
import type {
  AiModelConfigResponseDto,
  AiPromptContextSchemaResponseDto,
  AiPromptDefinitionsResponseDto,
  AiPromptDefinitionsResponseDtoItem,
  AiPromptFlowResponseDto,
  AiPromptFlowResponseDtoFlowsItem,
  AiPromptFlowResponseDtoFlowsItemNodesItemInputsItem,
  AiPromptFlowResponseDtoFlowsItemNodesItem,
  AiPromptPreviewResponseDto,
  AiPromptOutputSchemaResponseDto,
  AiPipelineContextPreviewResponseDto,
  AiPromptFlowResponseDtoFlowsItemNodesItemPromptKeysItem,
  AiPromptRevisionsResponseDto,
  CreateAiModelConfigDraftDto,
  PreviewAiPromptRequestDto,
} from "@/api/generated/model";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Bot,
  Clock,
  FileSearch,
  Globe,
  Handshake,
  Layers,
  Linkedin,
  Newspaper,
  Eye,
  RefreshCw,
  Search,
  Target,
  Workflow,
} from "lucide-react";

export const Route = createFileRoute("/_protected/admin/agents")({
  component: AdminAgentsPage,
});

type PromptKey = AiPromptFlowResponseDtoFlowsItemNodesItemPromptKeysItem;
type FlowDefinition = AiPromptFlowResponseDtoFlowsItem;
type FlowNode = AiPromptFlowResponseDtoFlowsItemNodesItem;
type FlowPort = AiPromptFlowResponseDtoFlowsItemNodesItemInputsItem;
type PromptDefinition = AiPromptDefinitionsResponseDtoItem;

type PromptRevision = AiPromptRevisionsResponseDto["revisions"][number];
type VariableDefinition = {
  description?: string;
  source?: string;
  example?: string;
  examples?: string;
};

const STAGES = [
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "series_c",
  "series_d",
  "series_e",
  "series_f_plus",
] as const;
type StageOption = (typeof STAGES)[number];

function extractResponseData<T>(payload: unknown): T | null {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

function formatStage(value: string | null): string {
  if (!value) return "Global";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function humanizePromptKey(key: string): string {
  return key
    .replace(/\./g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPreviewValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractNamedRuntimeVariables(
  variables: Record<string, unknown> | undefined,
): Array<[string, unknown]> {
  if (!variables) {
    return [];
  }

  return Object.entries(variables).filter(
    ([key]) =>
      ![
        "contextJson",
        "contextSections",
        "agentName",
        "agentKey",
      ].includes(key),
  );
}

type PreviewContextSection = {
  title: string;
  data: unknown;
};

function getPreviewParsedSections(
  preview: AiPromptPreviewResponseDto | null,
): PreviewContextSection[] {
  if (!preview) {
    return [];
  }

  const raw = (preview as unknown as { parsedContextSections?: unknown })
    .parsedContextSections;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const candidate = item as { title?: unknown; data?: unknown };
      if (typeof candidate.title !== "string") {
        return null;
      }
      return { title: candidate.title, data: candidate.data };
    })
    .filter((item): item is PreviewContextSection => item !== null);
}

function getPreviewParsedContextJson(
  preview: AiPromptPreviewResponseDto | null,
): unknown | null {
  if (!preview) {
    return null;
  }
  const raw = (preview as unknown as { parsedContextJson?: unknown })
    .parsedContextJson;
  return raw ?? null;
}

function getPreviewSectionTitles(preview: AiPromptPreviewResponseDto | null): string[] {
  if (!preview) {
    return [];
  }
  const raw = (preview as unknown as { sectionTitles?: unknown }).sectionTitles;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === "string");
}

function pickNodeIcon(nodeId: string) {
  if (nodeId.includes("gap") || nodeId.includes("hybrid") || nodeId.includes("brave")) {
    return Search;
  }
  if (nodeId.includes("extract")) return FileSearch;
  if (nodeId.includes("scrape")) return Globe;
  if (nodeId.includes("linkedin")) return Linkedin;
  if (nodeId.includes("news")) return Newspaper;
  if (nodeId.includes("competitor")) return Target;
  if (nodeId.includes("synthesis")) return Layers;
  if (nodeId.includes("matching") || nodeId.includes("thesis")) return Handshake;
  if (nodeId.includes("orchestrator")) return Workflow;
  return Bot;
}

function NodeCard({
  node,
  active,
  incomingCount,
  outgoingCount,
  onClick,
}: {
  node: FlowNode;
  active: boolean;
  incomingCount: number;
  outgoingCount: number;
  onClick: () => void;
}) {
  const Icon = pickNodeIcon(node.id);
  const isSystemNode = node.kind === "system";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-[204px] rounded-lg border-2 bg-background p-2.5 text-left shadow-sm transition-all ${
        isSystemNode ? "border-dashed" : "border-solid"
      } ${
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border hover:border-primary/30 hover:bg-muted/40"
      }`}
    >
      <div className="flex items-start gap-1.5">
        <span
          className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
            active
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-muted/30 text-muted-foreground group-hover:text-foreground"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-snug break-words">{node.label}</p>
        </div>
      </div>

      <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{node.description}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {node.promptKeys.length > 0 ? (
          <Badge variant="outline" className="text-[10px]">
            {node.promptKeys.length} key{node.promptKeys.length === 1 ? "" : "s"}
          </Badge>
        ) : null}
        <Badge variant="outline" className="text-[10px]">
          in {incomingCount}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          out {outgoingCount}
        </Badge>
      </div>
    </button>
  );
}

function JsonSchemaTreeNode({
  name,
  schema,
  depth = 0,
}: {
  name: string;
  schema: unknown;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (!schema || typeof schema !== "object") {
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }} className="py-1 text-xs">
        <span className="font-mono text-muted-foreground">{name}</span>
        <Badge variant="outline" className="ml-2 text-[10px]">
          {typeof schema}
        </Badge>
      </div>
    );
  }

  const schemaRecord = schema as Record<string, unknown>;
  const type = schemaRecord.type;
  const isArray = type === "array";
  const isObject = type === "object";

  if (!isArray && !isObject) {
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }} className="py-1 text-xs">
        <span className="font-mono text-muted-foreground">{name}</span>
        <Badge variant="outline" className="ml-2 text-[10px]">
          {typeof type === "string" ? type : "unknown"}
        </Badge>
      </div>
    );
  }

  const propertiesRaw = schemaRecord.properties;
  const properties =
    propertiesRaw && typeof propertiesRaw === "object"
      ? (propertiesRaw as Record<string, unknown>)
      : {};
  const itemsRaw = schemaRecord.items;
  const items =
    itemsRaw && typeof itemsRaw === "object"
      ? (itemsRaw as Record<string, unknown>)
      : {};

  return (
    <div style={{ paddingLeft: `${depth * 16}px` }} className="py-1 text-xs">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex cursor-pointer items-center gap-1 font-mono text-muted-foreground hover:text-foreground"
      >
        <span>{expanded ? "▼" : "▶"}</span>
        <span>{name}</span>
        <Badge variant="outline" className="text-[10px]">
          {isArray ? "array" : "object"}
        </Badge>
      </button>

      {expanded ? (
        <div>
          {isArray && Object.keys(items).length > 0 ? (
            <JsonSchemaTreeNode name="[items]" schema={items} depth={depth + 1} />
          ) : null}
          {isObject
            ? Object.entries(properties).map(([key, value]) => (
                <JsonSchemaTreeNode key={key} name={key} schema={value} depth={depth + 1} />
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

function GraphContextPanel({
  activeFlow,
  selectedNode,
  nodeById,
  onSelectNode,
}: {
  activeFlow: FlowDefinition | null;
  selectedNode: FlowNode;
  nodeById: Map<string, FlowNode>;
  onSelectNode: (nodeId: string) => void;
}) {
  const incomingEdges = activeFlow?.edges.filter((edge) => edge.to === selectedNode.id) ?? [];
  const outgoingEdges = activeFlow?.edges.filter((edge) => edge.from === selectedNode.id) ?? [];
  const inputPorts = selectedNode.inputs as FlowPort[];
  const outputPorts = selectedNode.outputs as FlowPort[];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Inputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {inputPorts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No inputs</p>
          ) : (
            inputPorts.map((port, index) => (
              <div
                key={`${port.label}-${index}`}
                className="flex items-center justify-between rounded border p-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {port.type}
                  </Badge>
                  <span className="font-mono">{port.label}</span>
                </div>
                {port.fromNodeId ? (
                  <button
                    type="button"
                    onClick={() => onSelectNode(port.fromNodeId!)}
                    className="cursor-pointer rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:bg-blue-200"
                  >
                    {nodeById.get(port.fromNodeId)?.label ?? port.fromNodeId}
                  </button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Outputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {outputPorts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No outputs</p>
          ) : (
            outputPorts.map((port, index) => (
              <div
                key={`${port.label}-${index}`}
                className="flex items-start justify-between rounded border p-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {port.type}
                  </Badge>
                  <span className="font-mono">{port.label}</span>
                </div>
                {port.toNodeIds && port.toNodeIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {port.toNodeIds.map((nodeId) => (
                      <button
                        key={nodeId}
                        type="button"
                        onClick={() => onSelectNode(nodeId)}
                        className="cursor-pointer rounded bg-green-100 px-2 py-1 text-xs text-green-700 hover:bg-green-200"
                      >
                        {nodeById.get(nodeId)?.label ?? nodeId}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Incoming</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {incomingEdges.length === 0 ? (
              <p className="text-xs text-muted-foreground">None</p>
            ) : (
              incomingEdges.map((edge) => {
                const fromNode = nodeById.get(edge.from);
                if (!fromNode) return null;
                return (
                  <button
                    key={`${edge.from}->${edge.to}`}
                    type="button"
                    onClick={() => onSelectNode(edge.from)}
                    className="block w-full cursor-pointer rounded p-2 text-left text-xs hover:bg-muted"
                  >
                    {fromNode.label}
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Outgoing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {outgoingEdges.length === 0 ? (
              <p className="text-xs text-muted-foreground">None</p>
            ) : (
              outgoingEdges.map((edge) => {
                const toNode = nodeById.get(edge.to);
                if (!toNode) return null;
                return (
                  <button
                    key={`${edge.from}->${edge.to}`}
                    type="button"
                    onClick={() => onSelectNode(edge.to)}
                    className="block w-full cursor-pointer rounded p-2 text-left text-xs hover:bg-muted"
                  >
                    {toNode.label}
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AdminAgentsPage() {
  const queryClient = useQueryClient();

  const [selectedFlowId, setSelectedFlowId] = useState<"pipeline" | "clara">("pipeline");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedPromptKey, setSelectedPromptKey] = useState<PromptKey | null>(null);
  const [editorStage, setEditorStage] = useState<"global" | StageOption>("global");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [notes, setNotes] = useState("");
  const [modelName, setModelName] = useState("gemini-3-flash-preview");
  const [searchMode, setSearchMode] = useState<
    | "off"
    | "provider_grounded_search"
    | "brave_tool_search"
    | "provider_and_brave_search"
  >("provider_grounded_search");
  const [enableLegacyModelEditing, setEnableLegacyModelEditing] = useState(false);
  const [modelStage, setModelStage] = useState<"global" | StageOption>("global");
  const [modelNotes, setModelNotes] = useState("");
  const [activeEditorTab, setActiveEditorTab] = useState("prompts");
  const [revisionStageFilter, setRevisionStageFilter] = useState<"all" | "global" | StageOption>("all");
  const [schemaViewMode, setSchemaViewMode] = useState<"tree" | "json">("tree");
  const [previewStartupId, setPreviewStartupId] = useState("");
  const [previewStage, setPreviewStage] = useState<"auto" | StageOption>("auto");
  const [previewResult, setPreviewResult] = useState<AiPromptPreviewResponseDto | null>(null);
  const [pipelineContextPreviewResult, setPipelineContextPreviewResult] =
    useState<AiPipelineContextPreviewResponseDto | null>(null);

  const definitionsQuery = useAdminControllerGetAiPrompts();
  const flowQuery = useAdminControllerGetAiPromptFlow();

  const definitions = useMemo(() => {
    const data = extractResponseData<AiPromptDefinitionsResponseDto>(definitionsQuery.data);
    return data ?? [];
  }, [definitionsQuery.data]);

  const flowResponse = useMemo(() => {
    const data = extractResponseData<AiPromptFlowResponseDto>(flowQuery.data);
    return data;
  }, [flowQuery.data]);

  const flows = flowResponse?.flows ?? [];

  useEffect(() => {
    if (!flows.find((flow) => flow.id === selectedFlowId) && flows.length > 0) {
      setSelectedFlowId(flows[0]!.id);
    }
  }, [flows, selectedFlowId]);

  const activeFlow = useMemo(
    () => flows.find((flow) => flow.id === selectedFlowId) ?? null,
    [flows, selectedFlowId],
  );

  const nodeById = useMemo(() => {
    const map = new Map<string, FlowNode>();
    for (const node of activeFlow?.nodes ?? []) {
      map.set(node.id, node);
    }
    return map;
  }, [activeFlow]);

  const edgeCountsByNode = useMemo(() => {
    const map = new Map<string, { incoming: number; outgoing: number }>();

    for (const node of activeFlow?.nodes ?? []) {
      map.set(node.id, { incoming: 0, outgoing: 0 });
    }

    for (const edge of activeFlow?.edges ?? []) {
      const from = map.get(edge.from);
      if (from) {
        from.outgoing += 1;
      }

      const to = map.get(edge.to);
      if (to) {
        to.incoming += 1;
      }
    }

    return map;
  }, [activeFlow]);

  const definitionsByKey = useMemo(() => {
    const map = new Map<string, PromptDefinition>();
    for (const definition of definitions) {
      map.set(definition.key, definition);
    }
    return map;
  }, [definitions]);

  useEffect(() => {
    if (!activeFlow) {
      setSelectedNodeId(null);
      return;
    }

    const nodeExists = selectedNodeId ? nodeById.has(selectedNodeId) : false;
    if (nodeExists) {
      return;
    }

    const firstPromptNode = activeFlow.nodes.find((node) => node.promptKeys.length > 0);
    const fallbackNode = firstPromptNode ?? activeFlow.nodes[0] ?? null;
    setSelectedNodeId(fallbackNode?.id ?? null);
  }, [activeFlow, nodeById, selectedNodeId]);

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;

  useEffect(() => {
    if (!selectedNode || selectedNode.promptKeys.length === 0) {
      setSelectedPromptKey(null);
      return;
    }

    if (
      selectedPromptKey &&
      selectedNode.promptKeys.includes(selectedPromptKey)
    ) {
      return;
    }

    setSelectedPromptKey(selectedNode.promptKeys[0]!);
  }, [selectedNode, selectedPromptKey]);

  const currentPromptKey = selectedNode?.promptKeys.includes(selectedPromptKey as PromptKey)
    ? (selectedPromptKey as PromptKey)
    : (selectedNode?.promptKeys[0] ?? null);
  const isEvaluationPrompt = currentPromptKey?.startsWith("evaluation.") ?? false;

  const revisionsQuery = useAdminControllerGetAiPromptRevisions(currentPromptKey ?? "", {
    query: {
      enabled: Boolean(currentPromptKey),
    },
  });
  const contextSchemaQuery = useAdminControllerGetAiPromptContextSchema(currentPromptKey ?? "", {
    query: {
      enabled: Boolean(currentPromptKey),
    },
  });
  const modelConfigQuery = useAdminControllerGetAiModelConfig(
    currentPromptKey ?? "",
    undefined,
    {
      query: {
        enabled: Boolean(currentPromptKey),
      },
    },
  );
  const outputSchemaQuery = useAdminControllerGetAiPromptOutputSchema(
    currentPromptKey ?? "",
    undefined,
    {
      query: {
        enabled: Boolean(currentPromptKey),
      },
    },
  );

  const revisionsPayload = useMemo(() => {
    const data = extractResponseData<AiPromptRevisionsResponseDto>(revisionsQuery.data);
    return data;
  }, [revisionsQuery.data]);
  const contextSchema = useMemo(() => {
    const data = extractResponseData<AiPromptContextSchemaResponseDto>(contextSchemaQuery.data);
    return data;
  }, [contextSchemaQuery.data]);
  const modelConfigPayload = useMemo(() => {
    const data = extractResponseData<AiModelConfigResponseDto>(modelConfigQuery.data);
    return data;
  }, [modelConfigQuery.data]);
  const outputSchemaPayload = useMemo(() => {
    const data = extractResponseData<AiPromptOutputSchemaResponseDto>(outputSchemaQuery.data);
    return data;
  }, [outputSchemaQuery.data]);

  const revisions = revisionsPayload?.revisions ?? [];
  const filteredRevisions = useMemo(() => {
    if (revisionStageFilter === "all") return revisions;
    const filterValue = revisionStageFilter === "global" ? null : revisionStageFilter;
    return revisions.filter((r) => r.stage === filterValue);
  }, [revisions, revisionStageFilter]);
  const modelConfigRevisions = modelConfigPayload?.revisions ?? [];
  const selectedDefinition = currentPromptKey
    ? definitionsByKey.get(currentPromptKey) ?? null
    : null;

  const stageValue: StageOption | null = editorStage === "global" ? null : editorStage;

  const activeDraft = useMemo(
    () =>
      revisions.find(
        (revision) => revision.status === "draft" && revision.stage === stageValue,
      ) ?? null,
    [revisions, stageValue],
  );

  const activePublished = useMemo(
    () =>
      revisions.find(
        (revision) => revision.status === "published" && revision.stage === stageValue,
      ) ??
      (stageValue !== null
        ? revisions.find(
            (revision) => revision.status === "published" && revision.stage === null,
          )
        : null) ??
      null,
    [revisions, stageValue],
  );
  const modelStageValue: StageOption | null = modelStage === "global" ? null : modelStage;
  const activeModelDraft = useMemo(
    () =>
      modelConfigRevisions.find(
        (revision) => revision.status === "draft" && revision.stage === modelStageValue,
      ) ?? null,
    [modelConfigRevisions, modelStageValue],
  );

  useEffect(() => {
    if (!currentPromptKey) {
      setSystemPrompt("");
      setUserPrompt("");
      setNotes("");
      return;
    }

    if (activeDraft) {
      setSystemPrompt(activeDraft.systemPrompt);
      setUserPrompt(activeDraft.userPrompt);
      setNotes(activeDraft.notes ?? "");
      return;
    }

    if (activePublished) {
      setSystemPrompt(activePublished.systemPrompt);
      setUserPrompt(activePublished.userPrompt);
      setNotes(activePublished.notes ?? "");
      return;
    }

    setSystemPrompt("");
    setUserPrompt("");
    setNotes("");
  }, [currentPromptKey, activeDraft, activePublished]);

  useEffect(() => {
    setPreviewResult(null);
  }, [currentPromptKey]);

  useEffect(() => {
    if (!currentPromptKey || !modelConfigPayload) {
      setModelName("");
      setSearchMode("off");
      setModelStage("global");
      setModelNotes("");
      return;
    }

    if (modelConfigPayload.resolved) {
      setModelName(modelConfigPayload.resolved.modelName);
      setSearchMode(modelConfigPayload.resolved.searchMode);
      setModelStage(
        modelConfigPayload.resolved.stage
          ? (modelConfigPayload.resolved.stage as StageOption)
          : "global",
      );
      setModelNotes("");
    }
  }, [currentPromptKey, modelConfigPayload]);

  const createModelConfigMutation = useAdminControllerCreateAiModelConfigDraft({
    mutation: {
      onSuccess: () => {
        if (currentPromptKey) {
          queryClient.invalidateQueries({
            queryKey: getAdminControllerGetAiModelConfigQueryKey(currentPromptKey),
          });
        }
        toast.success("Model config draft created");
      },
      onError: (error) =>
        toast.error((error as Error).message || "Failed to create model config draft"),
    },
  });
  const updateModelConfigMutation = useAdminControllerUpdateAiModelConfigDraft({
    mutation: {
      onSuccess: () => {
        if (currentPromptKey) {
          queryClient.invalidateQueries({
            queryKey: getAdminControllerGetAiModelConfigQueryKey(currentPromptKey),
          });
        }
        toast.success("Model config draft updated");
      },
      onError: (error) =>
        toast.error((error as Error).message || "Failed to update model config draft"),
    },
  });
  const publishModelConfigMutation = useAdminControllerPublishAiModelConfigDraft({
    mutation: {
      onSuccess: () => {
        if (currentPromptKey) {
          queryClient.invalidateQueries({
            queryKey: getAdminControllerGetAiModelConfigQueryKey(currentPromptKey),
          });
        }
        toast.success("Model config draft published");
      },
      onError: (error) =>
        toast.error((error as Error).message || "Failed to publish model config draft"),
    },
  });

  const previewMutation = useAdminControllerPreviewAiPrompt({
    mutation: {
      onSuccess: (result) => {
        const payload = extractResponseData<AiPromptPreviewResponseDto>(result);
        setPreviewResult(payload);
        toast.success("Runtime preview generated");
      },
      onError: (error) => toast.error((error as Error).message || "Failed to generate preview"),
    },
  });
  const pipelineContextPreviewMutation =
    useAdminControllerPreviewAiPipelineContext({
      mutation: {
        onSuccess: (result) => {
          const payload =
            extractResponseData<AiPipelineContextPreviewResponseDto>(result);
          setPipelineContextPreviewResult(payload);
          toast.success("Pipeline context preview generated");
        },
        onError: (error) =>
          toast.error(
            (error as Error).message || "Failed to generate pipeline context preview",
          ),
      },
    });

  const handleLoadRevision = (revision: PromptRevision) => {
    setSystemPrompt(revision.systemPrompt);
    setUserPrompt(revision.userPrompt);
    setNotes(revision.notes ?? "");
    setEditorStage(revision.stage ?? "global");
    setActiveEditorTab("prompts");
    toast.success(`Loaded v${revision.version} (${formatStage(revision.stage)}) into editor`);
  };

  const handleSaveModelConfigDraft = () => {
    if (!currentPromptKey || !modelName) {
      toast.error("Select a model before saving");
      return;
    }

    const selectedModel = modelConfigPayload?.allowedModels.find(
      (candidate) => candidate === modelName,
    );
    if (!selectedModel) {
      toast.error("Select a valid model from the allowed list");
      return;
    }

    const modelValue = selectedModel as CreateAiModelConfigDraftDto["modelName"];

    if (activeModelDraft) {
      updateModelConfigMutation.mutate({
        key: currentPromptKey,
        revisionId: activeModelDraft.id,
        data: {
          modelName: modelValue,
          searchMode,
          notes: modelNotes || undefined,
        },
      });
      return;
    }

    createModelConfigMutation.mutate({
      key: currentPromptKey,
      data: {
        modelName: modelValue,
        searchMode,
        stage: modelStageValue,
        notes: modelNotes || undefined,
      },
    });
  };

  const allowedVariables = contextSchema?.allowedVariables ?? revisionsPayload?.allowedVariables ?? selectedDefinition?.allowedVariables ?? [];
  const requiredVariables = contextSchema?.requiredVariables ?? revisionsPayload?.requiredVariables ?? selectedDefinition?.requiredVariables ?? [];
  const variableDefinitions = (contextSchema?.variableDefinitions as Record<string, VariableDefinition>) ??
    (revisionsPayload?.variableDefinitions as Record<string, VariableDefinition>) ??
    (selectedDefinition?.variableDefinitions as Record<string, VariableDefinition>) ??
    {};
  const runtimeFields = contextSchema?.contextFields ?? [];
  const requiredPhases = contextSchema?.requiredPhases ?? [];
  const contextNotes = contextSchema?.notes ?? [];
  const evaluationContextSourcePaths = useMemo(() => {
    if (!isEvaluationPrompt) {
      return [] as string[];
    }

    const paths = runtimeFields
      .map((field) => field.path)
      .filter(
        (path) => path.startsWith("contextJson.") && path !== "contextJson",
      )
      .map((path) => path.replace(/^contextJson\./, ""));

    return Array.from(new Set(paths));
  }, [isEvaluationPrompt, runtimeFields]);
  const previewParsedSections = getPreviewParsedSections(previewResult);
  const previewParsedContextJson = getPreviewParsedContextJson(previewResult);
  const previewSectionTitles = getPreviewSectionTitles(previewResult);

  const handlePreview = () => {
    if (!currentPromptKey) return;

    if (selectedDefinition?.surface === "pipeline" && !previewStartupId.trim()) {
      toast.error("Startup ID is required for pipeline prompt preview");
      return;
    }

    const payload: PreviewAiPromptRequestDto = {};
    if (previewStartupId.trim()) {
      payload.startupId = previewStartupId.trim();
    }
    if (previewStage !== "auto") {
      payload.stage = previewStage;
    }

    previewMutation.mutate({
      key: currentPromptKey,
      data: payload,
    });
  };

  const handlePipelineContextPreview = () => {
    if (!previewStartupId.trim()) {
      toast.error("Startup ID is required for pipeline context preview");
      return;
    }

    pipelineContextPreviewMutation.mutate({
      data: {
        startupId: previewStartupId.trim(),
        stage: previewStage === "auto" ? undefined : previewStage,
      },
    });
  };

  const isLoading = definitionsQuery.isLoading || flowQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">AI Agent Prompt Console</h1>
          <p className="text-muted-foreground">
            Visualize the data flow, click any agent, and preview stage-aware prompt templates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              flowQuery.refetch();
              definitionsQuery.refetch();
              if (currentPromptKey) {
                revisionsQuery.refetch();
                contextSchemaQuery.refetch();
                modelConfigQuery.refetch();
                outputSchemaQuery.refetch();
              }
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Primary model and search configuration now lives in
        {" "}
        <span className="font-semibold">/admin/flow</span>
        . Prompt templates are file-backed and preview-only in the app.
      </div>

      <Tabs
        value={selectedFlowId}
        onValueChange={(value) => setSelectedFlowId(value as "pipeline" | "clara")}
        className="space-y-4"
      >
        <TabsList>
          {(flows.length > 0 ? flows : [{ id: "pipeline", name: "Pipeline" } as FlowDefinition]).map((flow) => (
            <TabsTrigger key={flow.id} value={flow.id}>
              {flow.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={selectedFlowId}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-5 w-5" />
                {activeFlow?.name ?? "Loading flow"}
              </CardTitle>
              <CardDescription>
                {activeFlow?.description ?? "Visualize data flow across agents and edit prompts from one place."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-24 w-full" />
                  ))}
                </div>
              ) : !activeFlow ? (
                <p className="text-sm text-muted-foreground">No flow metadata found.</p>
              ) : (
                <div className="space-y-4 py-2">
                  {activeFlow.stages.map((stage, index) => {
                    const stageNodes = stage.nodeIds
                      .map((nodeId) => nodeById.get(nodeId))
                      .filter((node): node is FlowNode => Boolean(node));

                    return (
                      <div key={stage.id} className="space-y-3">
                        <div className="rounded-xl border bg-muted/20 p-4">
                          <div className="mb-3 text-center">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Step {index + 1}
                            </p>
                            <h3 className="text-sm font-semibold">{stage.title}</h3>
                            <p className="mt-1 text-xs text-muted-foreground">{stage.description}</p>
                            <Badge variant="outline" className="mt-2">
                              {stageNodes.length} node{stageNodes.length === 1 ? "" : "s"}
                            </Badge>
                          </div>
                          <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-2">
                            {stageNodes.map((node) => (
                              <NodeCard
                                key={node.id}
                                node={node}
                                active={selectedNodeId === node.id}
                                incomingCount={edgeCountsByNode.get(node.id)?.incoming ?? 0}
                                outgoingCount={edgeCountsByNode.get(node.id)?.outgoing ?? 0}
                                onClick={() => {
                                  setSelectedNodeId(node.id);
                                  setIsSheetOpen(true);
                                }}
                              />
                            ))}
                          </div>
                        </div>

                        {index < activeFlow.stages.length - 1 ? (
                          <div className="mx-auto h-4 w-px bg-border" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={Boolean(selectedNode) && isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="right" className="flex h-full w-full flex-col overflow-hidden sm:max-w-[780px]">
          {!selectedNode ? null : (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selectedNode.label}
                  <Badge variant={selectedNode.kind === "prompt" ? "default" : "secondary"}>
                    {selectedNode.kind}
                  </Badge>
                </SheetTitle>
                <SheetDescription>{selectedNode.description}</SheetDescription>
              </SheetHeader>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                {selectedNode.promptKeys.length === 0 ? (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Graph Context (Static)</CardTitle>
                        <CardDescription>This node is runtime logic, not prompt-configured.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <GraphContextPanel
                          activeFlow={activeFlow}
                          selectedNode={selectedNode}
                          nodeById={nodeById}
                          onSelectNode={setSelectedNodeId}
                        />
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="min-w-0 space-y-4 pb-6">
                    <Tabs value={activeEditorTab} onValueChange={setActiveEditorTab} className="min-w-0 space-y-4">
                    <div className="overflow-x-auto pb-1">
                    <TabsList className="w-max min-w-full whitespace-nowrap">
                      <TabsTrigger value="prompts">Prompts</TabsTrigger>
                      <TabsTrigger value="variables">Variables</TabsTrigger>
                      <TabsTrigger value="revisions">Revisions</TabsTrigger>
                      <TabsTrigger value="model-config">Model Config</TabsTrigger>
                      <TabsTrigger value="output-schema">Output Schema</TabsTrigger>
                      <TabsTrigger value="runtime-preview">Runtime Preview</TabsTrigger>
                      <TabsTrigger value="pipeline-context">Pipeline Context</TabsTrigger>
                      <TabsTrigger value="context">Graph Context (Static)</TabsTrigger>
                    </TabsList>
                    </div>

                    <TabsContent value="prompts" className="space-y-4">
                      {selectedNode.promptKeys.length > 1 ? (
                        <Tabs
                          value={currentPromptKey ?? undefined}
                          onValueChange={(value) => setSelectedPromptKey(value as PromptKey)}
                        >
                          <TabsList className="mb-3 flex h-auto flex-wrap justify-start">
                            {selectedNode.promptKeys.map((key) => (
                              <TabsTrigger key={key} value={key} className="text-xs">
                                {humanizePromptKey(key)}
                              </TabsTrigger>
                            ))}
                          </TabsList>
                        </Tabs>
                      ) : (
                        <Badge variant="outline">
                          {selectedNode.promptKeys[0] ? humanizePromptKey(selectedNode.promptKeys[0]) : "Prompt"}
                        </Badge>
                      )}

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Prompt Preview</CardTitle>
                          <CardDescription>
                            {selectedDefinition?.description ?? "Preview stage-aware prompt templates from local files."}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                            <div className="space-y-2">
                              <Label>Startup Stage</Label>
                              <Select
                                value={editorStage}
                                onValueChange={(value) => setEditorStage(value as "global" | StageOption)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select stage" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="global">Global</SelectItem>
                                  {STAGES.map((stage) => (
                                    <SelectItem key={stage} value={stage}>
                                      {formatStage(stage)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Notes</Label>
                              <Input
                                value={notes}
                                readOnly
                                placeholder="No notes"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>System Prompt</Label>
                            <Textarea
                              value={systemPrompt}
                              readOnly
                              className="min-h-[160px] font-mono text-xs bg-muted/20"
                              placeholder="System prompt"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>User Prompt</Label>
                            <Textarea
                              value={userPrompt}
                              readOnly
                              className="min-h-[240px] font-mono text-xs bg-muted/20"
                              placeholder="User prompt template"
                            />
                          </div>

                          {isEvaluationPrompt ? (
                            <div className="rounded-md border bg-muted/30 p-3">
                              <p className="text-sm font-medium">
                                Evaluation Context Visibility
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                <code>{"{{contextSections}}"}</code> is expanded at
                                runtime from structured evaluation context fields.
                                A shared <code>Startup Snapshot</code> baseline is
                                prepended for all evaluation agents.
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {previewSectionTitles.length > 0
                                  ? `Last preview section titles: ${previewSectionTitles.join(", ")}`
                                  : "Run Runtime Preview with a startup ID to inspect exact section payloads."}
                              </p>
                              {evaluationContextSourcePaths.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {evaluationContextSourcePaths.map((path) => (
                                    <Badge key={path} variant="outline">
                                      {`contextJson.${path}`}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">Preview Only</Badge>
                            <span className="text-xs text-muted-foreground">
                              Prompt templates are managed from files in
                              {" "}
                              <code>backend/src/modules/ai/prompts/library</code>.
                            </span>
                            {activePublished ? (
                              <Badge variant="outline" className="ml-auto">
                                Using {activePublished.stage ? formatStage(activePublished.stage) : "Global"} v{activePublished.version}
                              </Badge>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="variables">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Variables Contract</CardTitle>
                          <CardDescription>
                            Supported template variables for this prompt key.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <p className="mb-2 text-sm font-medium">Required Variables</p>
                            <div className="flex flex-wrap gap-2">
                              {requiredVariables.length === 0 ? (
                                <span className="text-sm text-muted-foreground">None</span>
                              ) : (
                                requiredVariables.map((variable) => (
                                  <Badge key={variable}>{`{{${variable}}}`}</Badge>
                                ))
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="mb-2 text-sm font-medium">Allowed Variables</p>
                            <div className="flex flex-wrap gap-2">
                              {allowedVariables.length === 0 ? (
                                <span className="text-sm text-muted-foreground">None</span>
                              ) : (
                                allowedVariables.map((variable) => (
                                  <Badge key={variable} variant="outline">{`{{${variable}}}`}</Badge>
                                ))
                              )}
                            </div>
                          </div>

                          {isEvaluationPrompt ? (
                            <div className="rounded-md border bg-muted/30 p-3">
                              <p className="text-sm font-medium">Evaluation Context Composition</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Evaluation prompts typically use <code>{"{{contextSections}}"}</code>, which is composed from structured evaluation context fields at runtime.
                                A shared <code>Startup Snapshot</code> baseline is always prepended before agent-specific sections.
                                Use Runtime Preview to inspect the exact expanded sections and raw JSON payload.
                              </p>
                            </div>
                          ) : null}

                          <div>
                            <p className="mb-2 text-sm font-medium">Required Pipeline Phases</p>
                            <div className="flex flex-wrap gap-2">
                              {requiredPhases.length === 0 ? (
                                <span className="text-sm text-muted-foreground">None</span>
                              ) : (
                                requiredPhases.map((phase) => (
                                  <Badge key={phase} variant="secondary">
                                    {phase}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm font-medium">Runtime Context Fields</p>
                            {runtimeFields.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No runtime field metadata found for this prompt key.</p>
                            ) : (
                              <div className="space-y-2">
                                {runtimeFields.map((field) => (
                                  <div key={field.path} className="rounded-md border p-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline">{field.path}</Badge>
                                      <Badge variant="secondary">{field.type}</Badge>
                                      {field.sourceVariable ? (
                                        <Badge>{`{{${field.sourceVariable}}}`}</Badge>
                                      ) : null}
                                    </div>
                                    {field.description ? (
                                      <p className="mt-2 text-sm">{field.description}</p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {contextNotes.length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-sm font-medium">Runtime Notes</p>
                              <div className="space-y-2">
                                {contextNotes.map((note) => (
                                  <p key={note} className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                                    {note}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="space-y-2">
                            <p className="text-sm font-medium">Variable Details</p>
                            {allowedVariables.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No variable metadata for this prompt key.</p>
                            ) : (
                              <div className="space-y-2">
                                {allowedVariables.map((variable) => {
                                  const definition = variableDefinitions[variable];
                                  return (
                                    <div key={variable} className="rounded-md border p-3">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline">{`{{${variable}}}`}</Badge>
                                        {requiredVariables.includes(variable) ? (
                                          <Badge>required</Badge>
                                        ) : (
                                          <Badge variant="secondary">optional</Badge>
                                        )}
                                      </div>
                                      <p className="mt-2 text-sm">{definition?.description ?? "No description yet."}</p>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        Source: {definition?.source ?? "Prompt runtime context builder"}
                                      </p>
                                      {definition?.example || definition?.examples ? (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          Example: <code>{definition?.example ?? definition?.examples}</code>
                                        </p>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="revisions">
                      <Card>
                        <CardHeader>
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <CardTitle className="text-base">Revision History</CardTitle>
                              <CardDescription>
                                Draft, published, and archived revisions for this prompt key.
                              </CardDescription>
                            </div>
                            <Select
                              value={revisionStageFilter}
                              onValueChange={(v) => setRevisionStageFilter(v as typeof revisionStageFilter)}
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue placeholder="Filter stage" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Stages</SelectItem>
                                <SelectItem value="global">Global</SelectItem>
                                {STAGES.map((stage) => (
                                  <SelectItem key={stage} value={stage}>
                                    {formatStage(stage)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {revisionsQuery.isLoading ? (
                            Array.from({ length: 3 }).map((_, index) => (
                              <Skeleton key={index} className="h-16 w-full" />
                            ))
                          ) : filteredRevisions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {revisions.length === 0
                                ? "No revisions found for this prompt key."
                                : "No revisions match the selected stage filter."}
                            </p>
                          ) : (
                            filteredRevisions.map((revision: PromptRevision) => (
                              <div key={revision.id} className="rounded-md border p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={revision.status === "published" ? "default" : revision.status === "draft" ? "secondary" : "outline"}>
                                    {revision.status}
                                  </Badge>
                                  <Badge variant="secondary">{formatStage(revision.stage)}</Badge>
                                  <span className="text-xs text-muted-foreground">v{revision.version}</span>
                                  <div className="ml-auto flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleLoadRevision(revision)}
                                      title="Load into editor"
                                    >
                                      <Eye className="mr-1 h-3 w-3" />
                                      Load
                                    </Button>
                                  </div>
                                </div>
                                {revision.userPrompt ? (
                                  <p className="mt-2 truncate text-xs text-muted-foreground">
                                    {revision.userPrompt.length > 80
                                      ? `${revision.userPrompt.slice(0, 80)}...`
                                      : revision.userPrompt}
                                  </p>
                                ) : null}
                                {revision.notes ? (
                                  <p className="mt-1 truncate text-xs italic text-muted-foreground">
                                    {revision.notes}
                                  </p>
                                ) : null}
                                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  Updated {new Date(revision.updatedAt).toLocaleString()}
                                </div>
                              </div>
                            ))
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="model-config" className="space-y-4">
                      {!currentPromptKey ? (
                        <Card>
                          <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">
                              Select a prompt to view model config
                            </p>
                          </CardContent>
                        </Card>
                      ) : (
                        <>
                          <Card className="border-amber-200 bg-amber-50">
                            <CardContent className="pt-6">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <p className="text-sm font-medium text-amber-900">
                                    Primary settings moved to /admin/flow
                                  </p>
                                  <p className="text-xs text-amber-900/90">
                                    Use Flow for day-to-day model/search configuration. Enable this
                                    editor only for fallback or advanced edits.
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant={enableLegacyModelEditing ? "secondary" : "outline"}
                                  onClick={() =>
                                    setEnableLegacyModelEditing((current) => !current)
                                  }
                                >
                                  {enableLegacyModelEditing
                                    ? "Disable Fallback Editing"
                                    : "Enable Fallback Editing"}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>

                          <div
                            className={`space-y-4 transition-opacity ${
                              enableLegacyModelEditing
                                ? "opacity-100"
                                : "pointer-events-none opacity-50"
                            }`}
                          >
                          {modelConfigPayload?.resolved ? (
                            <Card className="border-blue-200 bg-blue-50">
                              <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium">Current Configuration</p>
                                    <p className="text-xs text-muted-foreground">
                                      {modelConfigPayload.resolved.modelName}
                                      <Badge variant="outline" className="ml-2">
                                        {modelConfigPayload.resolved.source}
                                      </Badge>
                                    </p>
                                  </div>
                                  <div className="text-xs font-mono text-muted-foreground">
                                    {modelConfigPayload.resolved.provider}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ) : null}

                          <div>
                            <Label>Stage</Label>
                            <Select
                              value={modelStage}
                              onValueChange={(value) => setModelStage(value as "global" | StageOption)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="global">Global</SelectItem>
                                {STAGES.map((stage) => (
                                  <SelectItem key={stage} value={stage}>
                                    {formatStage(stage)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label>Model</Label>
                            <Select value={modelName} onValueChange={setModelName}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select model" />
                              </SelectTrigger>
                              <SelectContent>
                                {(modelConfigPayload?.allowedModels ?? []).map((model) => (
                                  <SelectItem key={model} value={model}>
                                    {model}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {modelConfigPayload?.resolved?.supportedSearchModes?.includes(
                            "provider_grounded_search",
                          ) ? (
                            <div className="flex items-center justify-between">
                              <Label>Grounded Search (Google)</Label>
                              <input
                                type="checkbox"
                                checked={searchMode === "provider_grounded_search"}
                                onChange={(event) =>
                                  setSearchMode(
                                    event.target.checked
                                      ? "provider_grounded_search"
                                      : "off",
                                  )
                                }
                                className="h-4 w-4"
                              />
                            </div>
                          ) : null}

                          <div>
                            <Label>Notes</Label>
                            <Textarea
                              value={modelNotes}
                              onChange={(event) => setModelNotes(event.target.value)}
                              placeholder="Optional notes about this configuration..."
                              className="h-20"
                            />
                          </div>

                          <div className="flex gap-2">
                            <Button
                              onClick={handleSaveModelConfigDraft}
                              disabled={
                                !modelName ||
                                createModelConfigMutation.isPending ||
                                updateModelConfigMutation.isPending
                              }
                            >
                              {createModelConfigMutation.isPending ||
                              updateModelConfigMutation.isPending
                                ? "Saving..."
                                : activeModelDraft
                                  ? "Update Draft"
                                  : "Save Draft"}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                if (!currentPromptKey || !activeModelDraft) return;
                                publishModelConfigMutation.mutate({
                                  key: currentPromptKey,
                                  revisionId: activeModelDraft.id,
                                });
                              }}
                              disabled={!activeModelDraft || publishModelConfigMutation.isPending}
                            >
                              {publishModelConfigMutation.isPending
                                ? "Publishing..."
                                : "Publish Draft"}
                            </Button>
                          </div>

                          <Card>
                            <CardHeader>
                              <CardTitle className="text-sm">Revision History</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2">
                                {modelConfigRevisions.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No model config revisions for this prompt key.
                                  </p>
                                ) : (
                                  modelConfigRevisions.map((revision) => (
                                    <div
                                      key={revision.id}
                                      className="flex items-center justify-between rounded border p-2 text-sm"
                                    >
                                      <div>
                                        <Badge variant="outline">{revision.status}</Badge>
                                        <span className="ml-2 text-xs text-muted-foreground">
                                          v{revision.version} • {formatStage(revision.stage)} •{" "}
                                          {new Date(revision.createdAt).toLocaleDateString()}
                                        </span>
                                      </div>
                                      <span className="text-xs">{revision.modelName}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </CardContent>
                          </Card>
                          </div>
                        </>
                      )}
                    </TabsContent>

                    <TabsContent value="output-schema" className="space-y-4">
                      {!currentPromptKey ? (
                        <Card>
                          <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">
                              Select a prompt to view output schema
                            </p>
                          </CardContent>
                        </Card>
                      ) : (
                        <>
                          <Card className="border-amber-200 bg-amber-50">
                            <CardContent className="pt-6">
                              <p className="text-xs text-amber-900">
                                Schema is defined in code. Editable schema config coming in a
                                future update.
                              </p>
                            </CardContent>
                          </Card>

                          <div className="flex gap-2">
                            <Button
                              variant={schemaViewMode === "tree" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setSchemaViewMode("tree")}
                            >
                              Visual Tree
                            </Button>
                            <Button
                              variant={schemaViewMode === "json" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setSchemaViewMode("json")}
                            >
                              Raw JSON
                            </Button>
                          </div>

                          {outputSchemaQuery.isLoading ? (
                            <Skeleton className="h-64 w-full" />
                          ) : outputSchemaPayload ? (
                            <Card>
                              <CardContent className="pt-6">
                                {schemaViewMode === "tree" ? (
                                  <div className="space-y-2 font-mono text-xs">
                                    <JsonSchemaTreeNode
                                      name={currentPromptKey}
                                      schema={outputSchemaPayload.jsonSchema}
                                    />
                                  </div>
                                ) : (
                                  <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">
                                    {JSON.stringify(outputSchemaPayload.jsonSchema, null, 2)}
                                  </pre>
                                )}
                              </CardContent>
                            </Card>
                          ) : (
                            <Card>
                              <CardContent className="pt-6">
                                <p className="text-sm text-muted-foreground">
                                  No schema found for this prompt
                                </p>
                              </CardContent>
                            </Card>
                          )}
                        </>
                      )}
                    </TabsContent>

                    <TabsContent value="runtime-preview">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Runtime Preview</CardTitle>
                          <CardDescription>
                            Resolve real runtime variables, render final prompts, and inspect effective model routing.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
                            <div className="space-y-2">
                              <Label>Startup ID {selectedDefinition?.surface === "pipeline" ? "(required)" : "(optional)"}</Label>
                              <Input
                                value={previewStartupId}
                                onChange={(event) => setPreviewStartupId(event.target.value)}
                                placeholder="UUID of startup to preview against"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Stage Override</Label>
                              <Select
                                value={previewStage}
                                onValueChange={(value) => setPreviewStage(value as "auto" | StageOption)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Auto" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="auto">Auto</SelectItem>
                                  {STAGES.map((stage) => (
                                    <SelectItem key={stage} value={stage}>
                                      {formatStage(stage)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-end">
                              <Button
                                onClick={handlePreview}
                                disabled={!currentPromptKey || previewMutation.isPending}
                              >
                                {previewMutation.isPending ? "Generating..." : "Generate Preview"}
                              </Button>
                            </div>
                          </div>

                          {!previewResult ? (
                            <p className="text-sm text-muted-foreground">Run preview to inspect rendered prompts and resolved runtime variables.</p>
                          ) : (
                            <div className="space-y-4">
                              <div className="rounded-md border p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge>{previewResult.source.promptSource}</Badge>
                                  {previewResult.source.effectiveStage ? (
                                    <Badge variant="secondary">{formatStage(previewResult.source.effectiveStage)}</Badge>
                                  ) : (
                                    <Badge variant="secondary">Global</Badge>
                                  )}
                                  <Badge variant="outline">{previewResult.model.modelName}</Badge>
                                  <Badge variant="outline">{previewResult.model.provider}</Badge>
                                  <Badge variant="outline">{previewResult.model.searchMode}</Badge>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Prompt revision: {previewResult.source.promptRevisionId ?? "code default"} · Startup: {previewResult.source.startupId ?? "none"}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Hashes: user={previewResult.hashes.renderedUserPrompt.slice(0, 16)}... · system={previewResult.hashes.renderedSystemPrompt.slice(0, 16)}... · vars={previewResult.hashes.variables.slice(0, 16)}...
                                </p>
                              </div>

                              <div className="space-y-2">
                                <Label>Rendered System Prompt</Label>
                                <Textarea
                                  readOnly
                                  value={previewResult.prompt.renderedSystemPrompt}
                                  className="min-h-[180px] font-mono text-xs"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>Rendered User Prompt</Label>
                                <Textarea
                                  readOnly
                                  value={previewResult.prompt.renderedUserPrompt}
                                  className="min-h-[260px] font-mono text-xs"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>Resolved Runtime Variables</Label>
                                <div className="space-y-2">
                                  {Object.entries(previewResult.resolvedVariables).map(([name, value]) => (
                                    <div key={name} className="rounded-md border p-3">
                                      <p className="text-xs font-semibold">{`{{${name}}}`}</p>
                                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs">
                                        {formatPreviewValue(value)}
                                      </pre>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {isEvaluationPrompt ? (
                                <div className="space-y-2">
                                  <Label>Evaluation Context (Expanded)</Label>
                                  {(() => {
                                    const startupSnapshotSection =
                                      previewParsedSections.find(
                                        (section) =>
                                          section.title === "Startup Snapshot",
                                      ) ?? null;
                                    return startupSnapshotSection ? (
                                      <div className="rounded-md border p-3">
                                        <p className="text-xs font-semibold">
                                          Startup Snapshot
                                        </p>
                                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs">
                                          {formatPreviewValue(
                                            startupSnapshotSection.data,
                                          )}
                                        </pre>
                                      </div>
                                    ) : null;
                                  })()}
                                  <div className="rounded-md border p-3">
                                    <p className="text-xs text-muted-foreground">
                                      Section titles:{" "}
                                      {previewSectionTitles.length > 0
                                        ? previewSectionTitles.join(", ")
                                        : "None"}
                                    </p>
                                  </div>

                                  {previewParsedSections.length > 0 ? (
                                    <div className="space-y-2">
                                      {previewParsedSections.map((section, index) => (
                                        section.title === "Startup Snapshot" ? null : (
                                        <div
                                          key={`${section.title}-${index}`}
                                          className="rounded-md border p-3"
                                        >
                                          <p className="text-xs font-semibold">
                                            {section.title}
                                          </p>
                                          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs">
                                            {formatPreviewValue(section.data)}
                                          </pre>
                                        </div>
                                        )
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">
                                      No parsed evaluation sections returned for this preview.
                                    </p>
                                  )}

                                  <div className="space-y-1">
                                    <Label className="text-xs">
                                      Parsed Context JSON
                                    </Label>
                                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs">
                                      {formatPreviewValue(previewParsedContextJson)}
                                    </pre>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="pipeline-context">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Pipeline Context Inspector</CardTitle>
                          <CardDescription>
                            Inspect the exact context payload and rendered prompt for every research and evaluation agent.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
                            <div className="space-y-2">
                              <Label>Startup ID (required)</Label>
                              <Input
                                value={previewStartupId}
                                onChange={(event) => setPreviewStartupId(event.target.value)}
                                placeholder="UUID of startup to inspect"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Stage Override</Label>
                              <Select
                                value={previewStage}
                                onValueChange={(value) => setPreviewStage(value as "auto" | StageOption)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Auto" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="auto">Auto</SelectItem>
                                  {STAGES.map((stage) => (
                                    <SelectItem key={stage} value={stage}>
                                      {formatStage(stage)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-end">
                              <Button
                                onClick={handlePipelineContextPreview}
                                disabled={pipelineContextPreviewMutation.isPending}
                              >
                                {pipelineContextPreviewMutation.isPending
                                  ? "Generating..."
                                  : "Generate Context Preview"}
                              </Button>
                            </div>
                          </div>

                          {!pipelineContextPreviewResult ? (
                            <p className="text-sm text-muted-foreground">
                              Generate a preview to inspect context passed to each research and evaluation agent.
                            </p>
                          ) : (
                            <div className="space-y-4">
                              <div className="rounded-md border p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge>{pipelineContextPreviewResult.startupId}</Badge>
                                  {pipelineContextPreviewResult.effectiveStage ? (
                                    <Badge variant="secondary">
                                      {formatStage(pipelineContextPreviewResult.effectiveStage)}
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">Global</Badge>
                                  )}
                                  <Badge variant="outline">
                                    Agents: {pipelineContextPreviewResult.agents.length}
                                  </Badge>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Generated: {new Date(pipelineContextPreviewResult.generatedAt).toLocaleString()}
                                </p>
                              </div>

                              <div className="space-y-3">
                                {pipelineContextPreviewResult.agents.map((agent) => (
                                  <div key={`${agent.promptKey}-${agent.agentKey}`} className="rounded-md border p-3">
                                    {(() => {
                                      const namedVariables = extractNamedRuntimeVariables(
                                        (agent.resolvedVariables ?? {}) as Record<string, unknown>,
                                      );
                                      return (
                                        <>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge>{agent.phase}</Badge>
                                      <Badge variant="outline">{agent.agentKey}</Badge>
                                      <Badge variant="outline">{agent.promptKey}</Badge>
                                      <Badge
                                        variant={agent.promptSource === "db" ? "default" : "secondary"}
                                      >
                                        prompt: {agent.promptSource}
                                      </Badge>
                                      {agent.promptRevisionId ? (
                                        <Badge variant="outline">{agent.promptRevisionId.slice(0, 8)}</Badge>
                                      ) : (
                                        <Badge variant="secondary">code fallback</Badge>
                                      )}
                                    </div>

                                    <div className="mt-3 space-y-1">
                                      <Label className="text-xs">Named Runtime Variables</Label>
                                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs">
                                        {namedVariables.length > 0
                                          ? formatPreviewValue(
                                              Object.fromEntries(namedVariables),
                                            )
                                          : "No named variables resolved."}
                                      </pre>
                                    </div>

                                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                                      <div className="space-y-1">
                                        <Label className="text-xs">Parsed Context JSON</Label>
                                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs">
                                          {formatPreviewValue(agent.parsedContextJson)}
                                        </pre>
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Parsed Context Sections</Label>
                                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs">
                                          {formatPreviewValue(agent.parsedContextSections)}
                                        </pre>
                                      </div>
                                    </div>

                                    <div className="mt-3 space-y-1">
                                      <Label className="text-xs">Resolved Variables</Label>
                                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs">
                                        {formatPreviewValue(agent.resolvedVariables)}
                                      </pre>
                                    </div>

                                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                                      <div className="space-y-1">
                                        <Label className="text-xs">Rendered System Prompt</Label>
                                        <Textarea
                                          readOnly
                                          value={agent.renderedSystemPrompt}
                                          className="min-h-[160px] font-mono text-xs"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs">Rendered User Prompt</Label>
                                        <Textarea
                                          readOnly
                                          value={agent.renderedUserPrompt}
                                          className="min-h-[160px] font-mono text-xs"
                                        />
                                      </div>
                                    </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="context">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Graph Context (Static)</CardTitle>
                          <CardDescription>
                            Inputs, outputs, and graph neighbors for this agent node.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <GraphContextPanel
                            activeFlow={activeFlow}
                            selectedNode={selectedNode}
                            nodeById={nodeById}
                            onSelectNode={setSelectedNodeId}
                          />
                        </CardContent>
                      </Card>
                    </TabsContent>
                    </Tabs>
                  </div>
                )}
              </div>

              <SheetFooter className="mt-4 border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  Extend prompts by updating backend prompt catalog + runtime context mapping.
                </p>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
