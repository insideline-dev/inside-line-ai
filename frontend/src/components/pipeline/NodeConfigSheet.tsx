import { useEffect, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Bot, Cog, ArrowRight } from "lucide-react";
import type { AiPromptFlowResponseDtoFlowsItemNodesItem } from "@/api/generated/model";
import {
  adminControllerGetAiPromptOutputSchema,
  getAdminControllerGetAiModelConfigQueryKey,
  getAdminControllerGetAiPromptFlowQueryKey,
  useAdminControllerCreateAiModelConfigDraft,
  useAdminControllerGetAiAgentUpstreamFields,
  useAdminControllerGetAiModelConfig,
  useAdminControllerPublishAiModelConfigDraft,
  useAdminControllerUpdateAiModelConfigDraft,
} from "@/api/generated/admin/admin";
import { NodePromptEditor } from "./NodePromptEditor";
import { AddAgentDialog } from "./dialogs/AddAgentDialog";
import { OrchestratorAgentManager } from "./dialogs/OrchestratorAgentManager";

interface PhaseConfigData {
  timeoutMs: number;
  maxRetries: number;
  required: boolean;
  dependsOn: string[];
}

interface NodeConfigSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: AiPromptFlowResponseDtoFlowsItemNodesItem | null;
  phaseConfig?: PhaseConfigData;
  onPhaseConfigChange?: (config: Partial<PhaseConfigData>) => void;
}

type JsonSchemaNode = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
};

function normalizeType(type: string | string[] | undefined): string | undefined {
  if (Array.isArray(type)) {
    return type.find((item) => item !== "null") ?? type[0];
  }
  return type;
}

function extractJsonSchemaPaths(node: JsonSchemaNode | undefined, prefix = ""): string[] {
  if (!node || typeof node !== "object") return [];

  const type = normalizeType(node.type);

  if (type === "object" || node.properties) {
    const entries = Object.entries(node.properties ?? {});
    if (entries.length === 0) {
      return prefix ? [prefix] : [];
    }

    return entries.flatMap(([key, child]) => {
      const childPath = prefix ? `${prefix}.${key}` : key;
      const nested = extractJsonSchemaPaths(child, childPath);
      return nested.length > 0 ? nested : [childPath];
    });
  }

  if (type === "array" || node.items) {
    const arrayPath = prefix ? `${prefix}[]` : "[]";
    const nested = extractJsonSchemaPaths(node.items, arrayPath);
    return nested.length > 0 ? nested : [arrayPath];
  }

  return prefix ? [prefix] : [];
}

export function NodeConfigSheet({
  open,
  onOpenChange,
  node,
  phaseConfig,
  onPhaseConfigChange,
}: NodeConfigSheetProps) {
  const normalizeModelName = (value: string): string =>
    value === "gemini-3.0-flash-preview" ? "gemini-3-flash-preview" : value;
  const GLOBAL_STAGE = "global" as const;
  const MODEL_STAGES = [
    "pre_seed",
    "seed",
    "series_a",
    "series_b",
    "series_c",
    "series_d",
    "series_e",
    "series_f_plus",
  ] as const;
  type ModelStage = (typeof MODEL_STAGES)[number];
  const [activePromptKey, setActivePromptKey] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [modelName, setModelName] = useState<string>("gemini-3-flash-preview");
  const [modelSearchMode, setModelSearchMode] = useState<
    | "off"
    | "provider_grounded_search"
    | "brave_tool_search"
    | "provider_and_brave_search"
  >("provider_grounded_search");
  const [modelNotes, setModelNotes] = useState("");
  const [modelStage, setModelStage] = useState<typeof GLOBAL_STAGE | ModelStage>(
    GLOBAL_STAGE,
  );
  const [modelFormDirty, setModelFormDirty] = useState(false);
  const nodeId = node?.id ?? "";

  const { data: upstreamData, isLoading: isUpstreamLoading } =
    useAdminControllerGetAiAgentUpstreamFields(nodeId, {
      query: { enabled: open && nodeId.length > 0 },
    });

  const upstreamItems = useMemo(() => {
    const payload = upstreamData as
      | {
          data?: {
            items?: Array<{ nodeId: string; label: string; fields: string[] }>;
          };
          items?: Array<{ nodeId: string; label: string; fields: string[] }>;
        }
      | undefined;
    return payload?.data?.items ?? payload?.items ?? [];
  }, [upstreamData]);

  const upstreamPaths = useMemo(
    () => Array.from(new Set(upstreamItems.flatMap((item) => item.fields))).sort(),
    [upstreamItems],
  );

  const schemaRevisionQueries = useQueries({
    queries: (node?.promptKeys ?? []).map((promptKey) => ({
      queryKey: ["ai-prompt-output-schema", promptKey],
      queryFn: () => adminControllerGetAiPromptOutputSchema(promptKey),
      enabled: open && Boolean(promptKey),
    })),
  });

  const declaredOutputFields = useMemo(() => {
    const merged = new Set<string>();

    for (const query of schemaRevisionQueries) {
      const payload = query.data as
        | {
            data?: {
              jsonSchema?: JsonSchemaNode;
              schemaJson?: JsonSchemaNode;
              note?: string;
            };
            jsonSchema?: JsonSchemaNode;
            schemaJson?: JsonSchemaNode;
            note?: string;
          }
        | undefined;

      const schemaJson = payload?.data?.schemaJson ?? payload?.schemaJson;
      const jsonSchema = payload?.data?.jsonSchema ?? payload?.jsonSchema;
      const paths = schemaJson
        ? extractJsonSchemaPaths(schemaJson)
        : extractJsonSchemaPaths(jsonSchema);
      for (const path of paths) {
        merged.add(path);
      }
    }

    return Array.from(merged).sort();
  }, [schemaRevisionQueries]);

  const declaredOutputTokens = useMemo(() => {
    if (!node) return [];

    const tokenSet = new Set<string>();
    tokenSet.add(node.id);
    tokenSet.add(`${node.id}|pretty`);

    for (const field of declaredOutputFields) {
      tokenSet.add(`${node.id}.${field}`);
      tokenSet.add(`${node.id}.${field}|pretty`);
    }

    return Array.from(tokenSet).sort();
  }, [declaredOutputFields, node]);

  const isSystem = node?.kind === "system";
  const selectedKey = activePromptKey ?? node?.promptKeys[0] ?? null;
  const modelConfigStageQuery =
    modelStage === GLOBAL_STAGE ? undefined : { stage: modelStage };

  const { data: modelConfigData } = useAdminControllerGetAiModelConfig(
    selectedKey ?? "",
    modelConfigStageQuery,
    {
      query: {
        enabled: open && Boolean(selectedKey),
      },
    },
  );

  const modelConfigPayload = useMemo(() => {
    const payload = modelConfigData as
      | {
          data?: {
            resolved?: {
              source: string;
              revisionId?: string | null;
              modelName: string;
              provider: string;
              stage?: string | null;
              searchMode:
                | "off"
                | "provider_grounded_search"
                | "brave_tool_search"
                | "provider_and_brave_search";
              supportedSearchModes: Array<
                | "off"
                | "provider_grounded_search"
                | "brave_tool_search"
                | "provider_and_brave_search"
              >;
            };
            revisions?: Array<{
              id: string;
              status: "draft" | "published" | "archived";
              stage: string | null;
              modelName: string;
              searchMode:
                | "off"
                | "provider_grounded_search"
                | "brave_tool_search"
                | "provider_and_brave_search";
              notes: string | null;
            }>;
            allowedModels?: string[];
            runtimeConfigEnabled?: boolean;
          };
          resolved?: {
            source: string;
            revisionId?: string | null;
            modelName: string;
            provider: string;
            stage?: string | null;
            searchMode:
              | "off"
              | "provider_grounded_search"
              | "brave_tool_search"
              | "provider_and_brave_search";
            supportedSearchModes: Array<
              | "off"
              | "provider_grounded_search"
              | "brave_tool_search"
              | "provider_and_brave_search"
            >;
          };
          revisions?: Array<{
            id: string;
            status: "draft" | "published" | "archived";
            stage: string | null;
            modelName: string;
            searchMode:
              | "off"
              | "provider_grounded_search"
              | "brave_tool_search"
              | "provider_and_brave_search";
            notes: string | null;
          }>;
          allowedModels?: string[];
          runtimeConfigEnabled?: boolean;
        }
      | undefined;

    return {
      resolved: payload?.data?.resolved ?? payload?.resolved,
      revisions: payload?.data?.revisions ?? payload?.revisions ?? [],
      allowedModels: payload?.data?.allowedModels ?? payload?.allowedModels ?? [],
      runtimeConfigEnabled:
        payload?.data?.runtimeConfigEnabled ?? payload?.runtimeConfigEnabled ?? false,
    };
  }, [modelConfigData]);

  const activeModelDraft = useMemo(
    () => {
      const stageFilter = modelStage === GLOBAL_STAGE ? null : modelStage;
      return (
        modelConfigPayload.revisions.find(
          (revision) =>
            revision.status === "draft" && revision.stage === stageFilter,
        ) ?? null
      );
    },
    [GLOBAL_STAGE, modelConfigPayload.revisions, modelStage],
  );

  const createModelConfigMutation = useAdminControllerCreateAiModelConfigDraft();
  const updateModelConfigMutation = useAdminControllerUpdateAiModelConfigDraft();
  const publishModelConfigMutation = useAdminControllerPublishAiModelConfigDraft();

  useEffect(() => {
    if (!node || node.promptKeys.length === 0) {
      setActivePromptKey(null);
      return;
    }
    setActivePromptKey((current) =>
      current && node.promptKeys.includes(current as never)
        ? current
        : node.promptKeys[0] ?? null,
    );
    setModelStage(GLOBAL_STAGE);
    setModelNotes("");
    setModelFormDirty(false);
  }, [GLOBAL_STAGE, node?.id, node?.promptKeys]);

  useEffect(() => {
    if (modelFormDirty) {
      return;
    }

    const draftSeed = activeModelDraft
      ? {
          modelName: activeModelDraft.modelName,
          searchMode: activeModelDraft.searchMode,
          notes: activeModelDraft.notes ?? "",
        }
      : null;
    const resolvedSeed = modelConfigPayload.resolved
      ? {
          modelName: modelConfigPayload.resolved.modelName,
          searchMode: modelConfigPayload.resolved.searchMode,
          notes: "",
        }
      : null;
    const seed = draftSeed ?? resolvedSeed;
    if (!seed) {
      return;
    }

    setModelName(normalizeModelName(seed.modelName));
    setModelSearchMode(seed.searchMode);
    setModelNotes(seed.notes);
  }, [activeModelDraft, modelConfigPayload.resolved, modelFormDirty]);

  const effectiveModelRevision = useMemo(
    () =>
      modelConfigPayload.resolved?.revisionId
        ? modelConfigPayload.revisions.find(
            (revision) => revision.id === modelConfigPayload.resolved?.revisionId,
          ) ?? null
        : null,
    [modelConfigPayload.resolved?.revisionId, modelConfigPayload.revisions],
  );

  const stageLabel = (stage: string | null) => {
    if (!stage) return "Global";
    return stage
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const isResearchNode = selectedKey?.startsWith("research.") ?? false;
  const selectedModelProvider = modelName.startsWith("gemini")
    ? "google"
    : modelName.startsWith("gpt") || modelName.startsWith("o")
      ? "openai"
      : "unknown";
  const supportsProviderSearch =
    isResearchNode &&
    (selectedModelProvider === "google" || selectedModelProvider === "openai");
  const supportsBraveSearch = isResearchNode;

  const refreshModelConfigState = async () => {
    if (!selectedKey) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: getAdminControllerGetAiModelConfigQueryKey(selectedKey),
      }),
      queryClient.invalidateQueries({
        queryKey: getAdminControllerGetAiPromptFlowQueryKey(),
      }),
    ]);
  };

  const saveModelConfig = async () => {
    if (!selectedKey || !modelName) {
      return;
    }

    const normalizedSearchMode =
      isResearchNode &&
      ((modelSearchMode === "provider_grounded_search" && supportsProviderSearch) ||
        (modelSearchMode === "brave_tool_search" && supportsBraveSearch) ||
        (modelSearchMode === "provider_and_brave_search" &&
          supportsProviderSearch &&
          supportsBraveSearch) ||
        modelSearchMode === "off")
        ? modelSearchMode
        : "off";

    if (activeModelDraft) {
      await updateModelConfigMutation.mutateAsync({
        key: selectedKey,
        revisionId: activeModelDraft.id,
        data: {
          modelName: modelName as never,
          searchMode: normalizedSearchMode as never,
          notes: modelNotes || undefined,
        },
      });
      setModelFormDirty(false);
      await refreshModelConfigState();
      return;
    }

    await createModelConfigMutation.mutateAsync({
      key: selectedKey,
      data: {
        modelName: modelName as never,
        searchMode: normalizedSearchMode as never,
        stage: modelStage === GLOBAL_STAGE ? null : (modelStage as never),
        notes: modelNotes || undefined,
      },
    });
    setModelFormDirty(false);
    await refreshModelConfigState();
  };

  const publishModelConfig = async () => {
    if (!selectedKey || !activeModelDraft) {
      return;
    }

    await publishModelConfigMutation.mutateAsync({
      key: selectedKey,
      revisionId: activeModelDraft.id,
    });
    setModelFormDirty(false);
    await refreshModelConfigState();
  };

  if (!node) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            {isSystem ? (
              <Cog className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Bot className="h-5 w-5 text-primary" />
            )}
            <SheetTitle className="text-lg">{node.label}</SheetTitle>
            {node.id.includes("orchestrator") ? (
              <AddAgentDialog orchestratorId={node.id} />
            ) : null}
          </div>
          <SheetDescription>{node.description}</SheetDescription>
          <div className="flex gap-1.5 pt-1">
            <Badge variant={isSystem ? "outline" : "default"} className="text-xs">
              {node.kind}
            </Badge>
            {node.promptKeys.map((k) => (
              <Badge key={k} variant="secondary" className="text-xs">
                {k}
              </Badge>
            ))}
          </div>
        </SheetHeader>

        <Tabs defaultValue={isSystem ? "io" : "prompts"} className="mt-6">
          <TabsList className={`grid w-full ${isSystem ? "grid-cols-2" : "grid-cols-3"}`}>
            {!isSystem ? <TabsTrigger value="prompts">Prompts</TabsTrigger> : null}
            <TabsTrigger value="io">Input / Output</TabsTrigger>
            <TabsTrigger value="queue">Queue Config</TabsTrigger>
          </TabsList>

          {/* ── Queue Config ── */}
          <TabsContent value="queue" className="space-y-4 mt-4">
            {node.id.includes("orchestrator") ? (
              <OrchestratorAgentManager orchestratorId={node.id} />
            ) : null}

            {phaseConfig ? (
              <>
                <div className="space-y-2">
                  <Label>Timeout (minutes)</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[phaseConfig.timeoutMs / 60000]}
                      onValueChange={([v]) =>
                        onPhaseConfigChange?.({ timeoutMs: v * 60000 })
                      }
                      min={1}
                      max={30}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono w-12 text-right">
                      {Math.round(phaseConfig.timeoutMs / 60000)}m
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Max Retries</Label>
                  <Select
                    value={String(phaseConfig.maxRetries)}
                    onValueChange={(v) =>
                      onPhaseConfigChange?.({ maxRetries: Number(v) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Required Phase</Label>
                    <p className="text-xs text-muted-foreground">
                      Pipeline fails if this phase fails
                    </p>
                  </div>
                  <Switch
                    checked={phaseConfig.required}
                    onCheckedChange={(v) =>
                      onPhaseConfigChange?.({ required: v })
                    }
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Dependencies</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {phaseConfig.dependsOn.length > 0 ? (
                      phaseConfig.dependsOn.map((dep) => (
                        <Badge key={dep} variant="outline">
                          {dep}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No dependencies (runs first)
                      </span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Queue config is only available for phase-level nodes.
              </p>
            )}
          </TabsContent>

          {/* ── Input / Output ── */}
          <TabsContent value="io" className="space-y-5 mt-4">
            {/* Declared outputs */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Declared Outputs</Label>
              {declaredOutputTokens.length > 0 ? (
                <div className="rounded-md border p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {declaredOutputTokens.map((token) => (
                      <Badge key={token} variant="outline" className="text-[10px] font-mono">
                        {`{{${token}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border p-3 text-xs text-muted-foreground">
                  No structured schema fields known yet. You can still pass the whole output object.
                </div>
              )}

              {node.outputs.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Routes</Label>
                  {node.outputs.map((port, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-md border p-2 text-xs"
                    >
                      <Badge variant="outline" className="text-[10px]">{port.type}</Badge>
                      <span>{port.label}</span>
                      {port.toNodeIds && port.toNodeIds.length > 0 && (
                        <>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground font-mono">
                            {port.toNodeIds.join(", ")}
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <Separator />

            {/* Upstream agent schemas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Incoming From Connected Agents</Label>
                {upstreamItems.length === 0 && !isUpstreamLoading && (
                  <span className="text-xs text-muted-foreground">
                    Connect agents in the canvas to see their outputs here
                  </span>
                )}
              </div>

              {isUpstreamLoading ? (
                <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Loading upstream fields...
                </div>
              ) : upstreamItems.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Drag from another node's handle to this node to link them.
                  <br />
                  Their output schema will appear here.
                </div>
              ) : (
                <div className="space-y-4">
                  {upstreamItems.map((upstream) => (
                    <div key={upstream.nodeId} className="space-y-2 rounded-md border p-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        {upstream.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {upstream.fields.map((field) => (
                          <Badge
                            key={field}
                            variant="outline"
                            className="text-[10px] font-mono"
                          >
                            {`{{${field}}}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {upstreamPaths.length > 0 && (
                <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-700">
                  Open the Prompts tab and use Insert Variable to include upstream fields.
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Prompts ── */}
          {!isSystem ? (
            <TabsContent value="prompts" className="space-y-4 mt-4">
              {node.promptKeys.length > 0 ? (
                <div className="space-y-4">
                  {node.promptKeys.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {node.promptKeys.map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setActivePromptKey(k)}
                          className={`rounded px-2 py-0.5 text-xs font-mono border transition-colors ${
                            selectedKey === k
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedKey && (
                    <div className="space-y-4">
                      <NodePromptEditor
                        promptKey={selectedKey}
                        upstreamPaths={upstreamPaths}
                      />

                      <div className="space-y-3 rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Model Selection</p>
                            <p className="text-xs text-muted-foreground">
                              Applies to this prompt key at runtime.
                            </p>
                          </div>
                          {node.runtimeModel ? (
                            <Badge variant="outline" className="text-[10px]">
                              {node.runtimeModel.modelName}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge
                            variant={
                              modelConfigPayload.runtimeConfigEnabled
                                ? "secondary"
                                : "destructive"
                            }
                            className="text-[10px]"
                          >
                            {modelConfigPayload.runtimeConfigEnabled
                              ? "runtime enabled"
                              : "runtime disabled"}
                          </Badge>
                          {modelConfigPayload.resolved ? (
                            <Badge variant="outline" className="text-[10px]">
                              effective {modelConfigPayload.resolved.source}
                              {effectiveModelRevision
                                ? ` • ${stageLabel(effectiveModelRevision.stage)}`
                                : ""}
                            </Badge>
                          ) : null}
                          {activeModelDraft ? (
                            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700">
                              draft pending publish
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Runtime uses published model config only. Draft changes apply
                          after you publish.
                        </p>
                        {!modelConfigPayload.runtimeConfigEnabled ? (
                          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700">
                            `AI_PROMPT_RUNTIME_CONFIG_ENABLED` is off, so runtime still
                            follows default model settings.
                          </p>
                        ) : null}

                        <div className="space-y-1.5">
                          <Label className="text-xs">Stage Scope</Label>
                          <Select
                            value={modelStage}
                            onValueChange={(value) => {
                              setModelStage(value as typeof GLOBAL_STAGE | ModelStage);
                              setModelFormDirty(false);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={GLOBAL_STAGE} className="text-xs">
                                Global
                              </SelectItem>
                              {MODEL_STAGES.map((stage) => (
                                <SelectItem key={stage} value={stage} className="text-xs">
                                  {stageLabel(stage)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Model</Label>
                          <Select
                            value={modelName}
                            onValueChange={(value) => {
                              setModelName(value);
                              setModelFormDirty(true);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent>
                              {(modelConfigPayload.allowedModels.length > 0
                                ? modelConfigPayload.allowedModels
                                : ["gpt-5.2", "gemini-3-flash-preview"]
                              ).map((model) => (
                                <SelectItem key={model} value={model} className="text-xs">
                                  {model === "gemini-3-flash-preview"
                                    ? "gemini-3-flash-preview"
                                    : model}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {isResearchNode ? (
                          <div className="space-y-1.5">
                            <Label className="text-xs">Web Search</Label>
                            <Select
                              value={modelSearchMode}
                              onValueChange={(value) =>
                                {
                                  setModelSearchMode(
                                    value as
                                      | "off"
                                      | "provider_grounded_search"
                                      | "brave_tool_search"
                                      | "provider_and_brave_search",
                                  );
                                  setModelFormDirty(true);
                                }
                              }
                              disabled={
                                !supportsProviderSearch &&
                                !supportsBraveSearch
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="off" className="text-xs">
                                  Off
                                </SelectItem>
                                {supportsProviderSearch ? (
                                  <SelectItem
                                    value="provider_grounded_search"
                                    className="text-xs"
                                  >
                                    Provider Search (Required)
                                  </SelectItem>
                                ) : null}
                                {supportsBraveSearch ? (
                                  <SelectItem value="brave_tool_search" className="text-xs">
                                    Brave Tool Search (Required)
                                  </SelectItem>
                                ) : null}
                                {supportsProviderSearch && supportsBraveSearch ? (
                                  <SelectItem
                                    value="provider_and_brave_search"
                                    className="text-xs"
                                  >
                                    Provider + Brave (Required Both)
                                  </SelectItem>
                                ) : null}
                              </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground">
                              Search modes are required for research and can enforce
                              provider search, Brave tool search, or both.
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
                            Evaluation and non-research nodes always run with web search off.
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <Label className="text-xs">Notes (optional)</Label>
                          <Textarea
                            value={modelNotes}
                            onChange={(event) => {
                              setModelNotes(event.target.value);
                              setModelFormDirty(true);
                            }}
                            className="min-h-16 text-xs"
                            placeholder="Why this model config?"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => void saveModelConfig()}
                            disabled={
                              !selectedKey ||
                              !modelName ||
                              createModelConfigMutation.isPending ||
                              updateModelConfigMutation.isPending
                            }
                          >
                            {activeModelDraft ? "Update Draft" : "Create Draft"}
                          </Button>
                          {activeModelDraft ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void publishModelConfig()}
                              disabled={publishModelConfigMutation.isPending}
                            >
                              Publish Draft
                            </Button>
                          ) : null}
                          {activeModelDraft?.stage !== undefined ? (
                            <Badge variant="outline" className="ml-auto text-[10px]">
                              {stageLabel(activeModelDraft.stage)}
                            </Badge>
                          ) : null}
                        </div>

                        {modelConfigPayload.revisions.length > 0 ? (
                          <div className="space-y-2 rounded-md border border-dashed p-2">
                            <p className="text-[11px] font-medium text-muted-foreground">
                              Revisions ({modelConfigPayload.revisions.length})
                            </p>
                            <div className="max-h-28 space-y-1 overflow-y-auto">
                              {modelConfigPayload.revisions
                                .filter((revision) =>
                                  modelStage === GLOBAL_STAGE
                                    ? revision.stage === null
                                    : revision.stage === modelStage,
                                )
                                .slice(0, 8)
                                .map((revision) => (
                                  <div
                                    key={revision.id}
                                    className="flex items-center justify-between rounded border px-2 py-1 text-[11px]"
                                  >
                                    <span className="truncate">
                                      {revision.modelName} - {revision.searchMode}
                                    </span>
                                    <Badge variant="secondary" className="text-[10px]">
                                      {revision.status}
                                    </Badge>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No prompt templates attached.
                </p>
              )}
            </TabsContent>
          ) : null}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
