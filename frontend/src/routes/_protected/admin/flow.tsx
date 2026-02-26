import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminControllerGetAiPromptFlowQueryKey,
  useAdminControllerGetAiPromptFlow,
  useAdminControllerGetAiModelConfig,
  useAdminControllerGetActivePipelineFlowConfig,
  getAdminControllerGetActivePipelineFlowConfigQueryKey,
  useAdminControllerListPipelineFlowConfigs,
  useAdminControllerBulkApplyAiModelConfig,
  useAdminControllerCreatePipelineFlowConfig,
  useAdminControllerUpdatePipelineFlowConfig,
  useAdminControllerPublishPipelineFlowConfig,
  getAdminControllerListPipelineFlowConfigsQueryKey,
} from "@/api/generated/admin/admin";
import { PipelineCanvas } from "@/components/pipeline/PipelineCanvas";
import type { PhaseConfig } from "@/components/pipeline/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RotateCcw,
  Loader2,
} from "lucide-react";
import type { AiPromptFlowResponseDtoFlowsItem } from "@/api/generated/model";
import { useUndoRedo } from "@/components/pipeline/hooks/use-undo-redo";
import type { FlowEdgeDefinition } from "@/components/pipeline/flow-edges";
import { DEFAULT_PIPELINE_CONFIG } from "./-flow.defaults";
import {
  parseFlowConfigRecord,
  selectInitialFlowConfigCandidate,
  type FlowConfigRecord,
} from "./-flow-config-helpers";

export const Route = createFileRoute("/_protected/admin/flow")({
  component: AdminFlowPage,
});


function extractResponseData<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function normalizeFlowEdges(value: unknown): FlowEdgeDefinition[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const edges: FlowEdgeDefinition[] = [];
  for (const edge of value) {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      return null;
    }
    const edgeRecord = edge as Record<string, unknown>;
    if (typeof edgeRecord.from !== "string" || typeof edgeRecord.to !== "string") {
      return null;
    }
    const mapping =
      edgeRecord.mapping &&
      typeof edgeRecord.mapping === "object" &&
      !Array.isArray(edgeRecord.mapping)
        ? (edgeRecord.mapping as FlowEdgeDefinition["mapping"])
        : undefined;
    edges.push({
      from: edgeRecord.from,
      to: edgeRecord.to,
      ...(typeof edgeRecord.label === "string" ? { label: edgeRecord.label } : {}),
      ...(typeof edgeRecord.sourceHandle === "string"
        ? { sourceHandle: edgeRecord.sourceHandle }
        : {}),
      ...(typeof edgeRecord.targetHandle === "string"
        ? { targetHandle: edgeRecord.targetHandle }
        : {}),
      ...(typeof edgeRecord.enabled === "boolean"
        ? { enabled: edgeRecord.enabled }
        : {}),
      ...(mapping ? { mapping } : {}),
    });
  }
  return edges;
}

interface ScrapeWebsiteNodeConfig {
  scraping?: {
    manualPaths?: string[];
    discoveryEnabled?: boolean;
  };
}

type FlowNodeConfigs = Record<string, unknown> & {
  scrape_website?: ScrapeWebsiteNodeConfig;
};

function normalizeManualScrapePath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
    return null;
  }

  const slashNormalized = trimmed.replace(/\\/g, "/");
  const [withoutHash] = slashNormalized.split("#", 1);
  const [pathname] = withoutHash.split("?", 1);
  const prefixed = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const collapsed = prefixed.replace(/\/{2,}/g, "/");
  const segments = collapsed.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  if (collapsed === "/") {
    return "/";
  }
  return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

function normalizeFlowNodeConfigs(value: unknown): FlowNodeConfigs {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const normalized: FlowNodeConfigs = {};

  for (const [nodeId, rawConfig] of Object.entries(record)) {
    if (nodeId !== "scrape_website") {
      normalized[nodeId] = rawConfig;
      continue;
    }

    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
      continue;
    }

    const scrapeRecord = rawConfig as Record<string, unknown>;
    const scrapingRaw = scrapeRecord.scraping;
    if (!scrapingRaw || typeof scrapingRaw !== "object" || Array.isArray(scrapingRaw)) {
      continue;
    }

    const scrapingRecord = scrapingRaw as Record<string, unknown>;
    const discoveryEnabled = scrapingRecord.discoveryEnabled === true;
    const dedupedPaths = new Set<string>();
    if (Array.isArray(scrapingRecord.manualPaths)) {
      for (const path of scrapingRecord.manualPaths) {
        if (typeof path !== "string") {
          continue;
        }
        const normalizedPath = normalizeManualScrapePath(path);
        if (!normalizedPath || normalizedPath === "/") {
          continue;
        }
        dedupedPaths.add(normalizedPath);
      }
    }

    if (!discoveryEnabled && dedupedPaths.size === 0) {
      continue;
    }

    normalized.scrape_website = {
      scraping: {
        ...(dedupedPaths.size > 0 ? { manualPaths: Array.from(dedupedPaths) } : {}),
        discoveryEnabled,
      },
    };
  }

  return normalized;
}

function AdminFlowPage() {
  const resolveProvider = (modelName: string): string => {
    if (modelName.startsWith("gemini")) {
      return "google";
    }
    if (modelName.startsWith("gpt") || modelName.startsWith("o")) {
      return "openai";
    }
    return "unknown";
  };
  const queryClient = useQueryClient();
  const [selectedFlowId, setSelectedFlowId] = useState<string>("pipeline");
  const [draftId, setDraftId] = useState<string | null>(null);
  const history = useUndoRedo<PhaseConfig[]>(DEFAULT_PIPELINE_CONFIG.phases);
  const [draftEdgesByFlowId, setDraftEdgesByFlowId] = useState<
    Record<string, FlowEdgeDefinition[]>
  >({});
  const [draftNodeConfigsByFlowId, setDraftNodeConfigsByFlowId] = useState<
    Record<string, FlowNodeConfigs>
  >({});
  const [isDirty, setIsDirty] = useState(false);
  const hasHydratedInitialConfigRef = useRef(false);

  const { data: flowData, isLoading: flowLoading } =
    useAdminControllerGetAiPromptFlow();
  const { data: modelConfigData } = useAdminControllerGetAiModelConfig(
    "research.market",
    undefined,
  );

  const { data: configsData } =
    useAdminControllerListPipelineFlowConfigs();
  const {
    data: activeConfigData,
    isFetched: hasFetchedActiveConfig,
    isError: hasActiveConfigError,
  } = useAdminControllerGetActivePipelineFlowConfig();

  const modelConfigPayload = extractResponseData<{
    allowedModels?: string[];
  }>(modelConfigData);
  const allowedModels = useMemo(
    () =>
      modelConfigPayload?.allowedModels && modelConfigPayload.allowedModels.length > 0
        ? modelConfigPayload.allowedModels
        : [
            "gpt-5.2",
            "gemini-3-flash-preview",
            "o4-mini-deep-research",
          ],
    [modelConfigPayload?.allowedModels],
  );
  const researchModelOptions = useMemo(() => allowedModels, [allowedModels]);
  const nonResearchModelOptions = useMemo(
    () => allowedModels.filter((model) => !model.toLowerCase().includes("deep-research")),
    [allowedModels],
  );

  const [allAiModelName, setAllAiModelName] = useState<string>("gpt-5.2");
  const [researchModelName, setResearchModelName] = useState<string>("o4-mini-deep-research");
  const [evaluationModelName, setEvaluationModelName] = useState<string>("gpt-5.2");
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  useEffect(() => {
    if (allowedModels.length === 0) {
      return;
    }

    const nonResearchFallback = nonResearchModelOptions[0] ?? allowedModels[0];
    const researchFallback = researchModelOptions[0] ?? allowedModels[0];
    if (!nonResearchModelOptions.includes(allAiModelName)) {
      setAllAiModelName(nonResearchFallback);
    }
    if (!researchModelOptions.includes(researchModelName)) {
      setResearchModelName(researchFallback);
    }
    if (!nonResearchModelOptions.includes(evaluationModelName)) {
      setEvaluationModelName(nonResearchFallback);
    }
  }, [
    allAiModelName,
    allowedModels,
    evaluationModelName,
    nonResearchModelOptions,
    researchModelName,
    researchModelOptions,
  ]);

  const createDraftMutation = useAdminControllerCreatePipelineFlowConfig({
    mutation: {
      onSuccess: (data) => {
        const result = extractResponseData<{ id: string }>(data);
        setDraftId(result.id);
        setIsDirty(false);
        toast.success("Draft saved");
        queryClient.invalidateQueries({
          queryKey: getAdminControllerListPipelineFlowConfigsQueryKey(),
        });
      },
      onError: (err) => toast.error((err as Error).message || "Failed to save draft"),
    },
  });

  const updateDraftMutation = useAdminControllerUpdatePipelineFlowConfig({
    mutation: {
      onSuccess: () => {
        setIsDirty(false);
        toast.success("Draft updated");
        queryClient.invalidateQueries({
          queryKey: getAdminControllerListPipelineFlowConfigsQueryKey(),
        });
      },
      onError: (err) => toast.error((err as Error).message || "Failed to update"),
    },
  });

  const publishMutation = useAdminControllerPublishPipelineFlowConfig({
    mutation: {
      onSuccess: async () => {
        setDraftId(null);
        toast.success("Config published!");
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getAdminControllerListPipelineFlowConfigsQueryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: getAdminControllerGetActivePipelineFlowConfigQueryKey(),
          }),
        ]);
      },
      onError: (err) => toast.error((err as Error).message || "Failed to publish"),
    },
  });

  const bulkApplyMutation = useAdminControllerBulkApplyAiModelConfig({
    mutation: {
      onSuccess: async (response) => {
        const result = extractResponseData<{
          scope: string;
          appliedKeys: string[];
        }>(response);

        toast.success(
          `Applied model to ${result.appliedKeys.length} prompt keys (${result.scope}).`,
        );

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getAdminControllerGetAiPromptFlowQueryKey(),
          }),
          queryClient.invalidateQueries({
            predicate: (query) =>
              Array.isArray(query.queryKey) &&
              typeof query.queryKey[0] === "string" &&
              query.queryKey[0].startsWith("/admin/ai-prompts/"),
          }),
        ]);
      },
      onError: (err) =>
        toast.error((err as Error).message || "Failed to bulk apply model config"),
    },
  });

  const flows = extractResponseData<{ flows: AiPromptFlowResponseDtoFlowsItem[] }>(
    flowData,
  )?.flows;
  const selectedFlow = flows?.find((f) => f.id === selectedFlowId);

  const configs = extractResponseData<{ data: FlowConfigRecord[] }>(configsData);
  const activeConfig = useMemo(
    () => parseFlowConfigRecord(extractResponseData<unknown>(activeConfigData)),
    [activeConfigData],
  );

  const handlePipelineConfigChange = useCallback(
    (updated: PhaseConfig[]) => {
      history.push(updated);
      setIsDirty(true);
    },
    [history],
  );

  const buildDraftPayloadForFlow = useCallback(
    (
      flowId: string,
      overrides?: {
        edges?: FlowEdgeDefinition[];
        nodeConfigs?: FlowNodeConfigs;
      },
    ): Record<string, unknown> | null => {
      const flow = flows?.find((entry) => entry.id === flowId);
      if (!flow) {
        return null;
      }

      const selectedEdges =
        overrides?.edges ??
        draftEdgesByFlowId[flow.id] ??
        (flow.edges as FlowEdgeDefinition[]);
      const selectedNodeConfigs =
        overrides?.nodeConfigs ?? draftNodeConfigsByFlowId[flow.id] ?? {};

      return {
        name: `Pipeline Config ${new Date().toLocaleDateString()}`,
        flowDefinition: {
          flowId: flow.id,
          nodes: flow.nodes.map((node) => node.id),
          edges: selectedEdges,
          nodeConfigs: selectedNodeConfigs,
        } as Record<string, unknown>,
        pipelineConfig: {
          ...DEFAULT_PIPELINE_CONFIG,
          phases: history.present,
        } as unknown as Record<string, unknown>,
      } as Record<string, unknown>;
    },
    [draftEdgesByFlowId, draftNodeConfigsByFlowId, flows, history.present],
  );

  const persistDraftForFlow = useCallback(
    async (
      flowId: string,
      overrides?: {
        edges?: FlowEdgeDefinition[];
        nodeConfigs?: FlowNodeConfigs;
      },
    ) => {
      const payload = buildDraftPayloadForFlow(flowId, overrides);
      if (!payload) {
        return null;
      }

      if (draftId) {
        const updated = await updateDraftMutation.mutateAsync({
          id: draftId,
          data: payload as never,
        });
        const updatedDraft = extractResponseData<{ id: string }>(updated);
        return updatedDraft.id;
      }

      const created = await createDraftMutation.mutateAsync({
        data: payload as never,
      });
      const createdDraft = extractResponseData<{ id: string }>(created);
      return createdDraft.id;
    },
    [buildDraftPayloadForFlow, createDraftMutation, draftId, updateDraftMutation],
  );

  const handleSaveDraft = async () => {
    if (!selectedFlow) return;
    await persistDraftForFlow(selectedFlow.id);
  };

  const handlePublish = () => {
    if (!draftId) {
      toast.error("Save a draft first before publishing");
      return;
    }
    publishMutation.mutate({ id: draftId });
  };

  const handleReset = () => {
    history.replace(DEFAULT_PIPELINE_CONFIG.phases);
    setDraftEdgesByFlowId({});
    setDraftNodeConfigsByFlowId({});
    setDraftId(null);
    setIsDirty(false);
    toast.info("Reset to defaults");
  };

  const applyLoadedConfig = useCallback(
    (
      config: FlowConfigRecord,
      options?: { showToast?: boolean; historyMode?: "push" | "replace" },
    ) => {
      const historyMode = options?.historyMode ?? "push";
      const showToast = options?.showToast ?? true;
      setDraftId(config.status === "draft" ? config.id : null);
      const loadedPhases = config.pipelineConfig?.phases;
      if (loadedPhases) {
        if (historyMode === "replace") {
          history.replace(loadedPhases as PhaseConfig[]);
        } else {
          history.push(loadedPhases as PhaseConfig[]);
        }
      }
      const loadedFlowId =
        config.flowDefinition?.flowId && typeof config.flowDefinition.flowId === "string"
          ? config.flowDefinition.flowId
          : null;
      const loadedEdges = normalizeFlowEdges(config.flowDefinition?.edges);
      if (loadedFlowId && loadedEdges) {
        setDraftEdgesByFlowId((current) => ({
          ...current,
          [loadedFlowId]: loadedEdges,
        }));
        const loadedNodeConfigs = normalizeFlowNodeConfigs(
          config.flowDefinition?.nodeConfigs,
        );
        setDraftNodeConfigsByFlowId((current) => ({
          ...current,
          [loadedFlowId]: loadedNodeConfigs,
        }));
        setSelectedFlowId(loadedFlowId);
      }
      setIsDirty(false);

      if (showToast) {
        toast.info(`Loaded: ${config.name}`);
      }
    },
    [history],
  );

  const handleLoadConfig = (configId: string) => {
    const config = configs?.data?.find((c) => c.id === configId);
    if (!config) return;
    applyLoadedConfig(config);
  };

  useEffect(() => {
    if (hasHydratedInitialConfigRef.current) {
      return;
    }
    if (!hasFetchedActiveConfig && !hasActiveConfigError) {
      return;
    }
    if (!activeConfig && !configs?.data) {
      return;
    }

    const preferredConfig = selectInitialFlowConfigCandidate({
      flowId: "pipeline",
      activeConfig,
      configList: configs?.data,
    });

    hasHydratedInitialConfigRef.current = true;
    if (preferredConfig) {
      applyLoadedConfig(preferredConfig, { showToast: false, historyMode: "replace" });
    }
  }, [
    activeConfig,
    applyLoadedConfig,
    configs?.data,
    hasActiveConfigError,
    hasFetchedActiveConfig,
  ]);

  const handleFlowEdgesChange = useCallback(
    (flowId: string, edges: FlowEdgeDefinition[]) => {
      setDraftEdgesByFlowId((current) => ({
        ...current,
        [flowId]: edges,
      }));
      setIsDirty(true);
    },
    [],
  );

  const handleFlowNodeConfigChange = useCallback(
    async (flowId: string, nodeId: string, nodeConfig: unknown | undefined) => {
      const currentForFlow = { ...(draftNodeConfigsByFlowId[flowId] ?? {}) };
      const nextNodeConfigsForFlow: FlowNodeConfigs = currentForFlow;

      if (nodeId === "scrape_website") {
        const normalized = normalizeFlowNodeConfigs({
          scrape_website: nodeConfig,
        });
        if (normalized.scrape_website) {
          nextNodeConfigsForFlow.scrape_website = normalized.scrape_website;
        } else {
          delete nextNodeConfigsForFlow.scrape_website;
        }
      } else if (nodeConfig === undefined) {
        delete nextNodeConfigsForFlow[nodeId];
      } else {
        nextNodeConfigsForFlow[nodeId] = nodeConfig;
      }

      setDraftNodeConfigsByFlowId((current) => ({
        ...current,
        [flowId]: nextNodeConfigsForFlow,
      }));
      setIsDirty(true);
      const persistedDraftId = await persistDraftForFlow(flowId, {
        nodeConfigs: nextNodeConfigsForFlow,
      });
      if (nodeId === "scrape_website" && persistedDraftId) {
        await publishMutation.mutateAsync({ id: persistedDraftId });
      }
    },
    [
      draftNodeConfigsByFlowId,
      persistDraftForFlow,
      publishMutation,
    ],
  );

  const handleBulkApply = useCallback(
    (scope: "all_ai_nodes" | "research_agents" | "evaluation_agents", modelName: string) => {
      bulkApplyMutation.mutate({
        data: {
          scope,
          modelName: modelName as never,
        },
      });
    },
    [bulkApplyMutation],
  );

  const isSaving = createDraftMutation.isPending || updateDraftMutation.isPending;

  if (flowLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Pipeline Flow</h1>
          {isDirty && (
            <Badge variant="outline" className="text-amber-600 border-amber-600">
              Unsaved changes
            </Badge>
          )}
          {draftId && (
            <Badge variant="secondary" className="text-xs">
              Draft
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {configs?.data && configs.data.length > 0 && (
            <Select onValueChange={handleLoadConfig}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Load config..." />
              </SelectTrigger>
              <SelectContent>
                {configs.data.map((c: { id: string; name: string; status: string; version: number }) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {c.name} (v{c.version}) — {c.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="h-8"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>

          <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                Bulk Apply Models
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[760px]">
              <DialogHeader>
                <DialogTitle>Bulk Apply Models</DialogTitle>
                <DialogDescription>
                  Apply and publish model config across grouped AI agents.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-medium">All AI Nodes</p>
                      <p className="text-xs text-muted-foreground">
                        Applies to all prompt-backed AI nodes in pipeline flow.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={bulkApplyMutation.isPending}
                      onClick={() => handleBulkApply("all_ai_nodes", allAiModelName)}
                    >
                      Apply
                    </Button>
                  </div>
                  <Select value={allAiModelName} onValueChange={setAllAiModelName}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {(nonResearchModelOptions.length > 0
                        ? nonResearchModelOptions
                        : allowedModels
                      ).map((model) => (
                        <SelectItem key={model} value={model} className="text-xs">
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-medium">Research Agents</p>
                      <p className="text-xs text-muted-foreground">
                        Applies model + inferred provider to all research agents.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={bulkApplyMutation.isPending}
                      onClick={() => handleBulkApply("research_agents", researchModelName)}
                    >
                      Apply
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Select value={researchModelName} onValueChange={setResearchModelName}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        {researchModelOptions.map((model) => (
                          <SelectItem key={model} value={model} className="text-xs">
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Badge variant="outline" className="text-[10px]">
                      provider: {resolveProvider(researchModelName)}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-medium">Evaluation Agents</p>
                      <p className="text-xs text-muted-foreground">
                        Applies model to all evaluation agents (search remains off).
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={bulkApplyMutation.isPending}
                      onClick={() =>
                        handleBulkApply("evaluation_agents", evaluationModelName)
                      }
                    >
                      Apply
                    </Button>
                  </div>
                  <Select
                    value={evaluationModelName}
                    onValueChange={setEvaluationModelName}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {(nonResearchModelOptions.length > 0
                        ? nonResearchModelOptions
                        : allowedModels
                      ).map((model) => (
                        <SelectItem key={model} value={model} className="text-xs">
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Flow tabs */}
      <Tabs value={selectedFlowId} onValueChange={setSelectedFlowId} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit">
          {flows?.map((f) => (
            <TabsTrigger key={f.id} value={f.id}>
              {f.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {flows?.map((f) => {
          const flowWithDraftEdges =
            draftEdgesByFlowId[f.id] !== undefined
              ? {
                  ...f,
                  edges: draftEdgesByFlowId[f.id],
                }
              : f;
          return (
            <TabsContent key={f.id} value={f.id} className="flex-1 min-h-0 mt-0">
              <div className="h-full rounded-lg border bg-background">
                <PipelineCanvas
                  flow={flowWithDraftEdges}
                  pipelineConfig={
                    f.id === "pipeline" ? history.present : undefined
                  }
                  flowNodeConfigs={draftNodeConfigsByFlowId[f.id] ?? {}}
                  onPipelineConfigChange={
                    f.id === "pipeline" ? handlePipelineConfigChange : undefined
                  }
                  canUndo={history.canUndo}
                  canRedo={history.canRedo}
                  onUndo={history.undo}
                  onRedo={history.redo}
                  isDirty={isDirty}
                  onSaveDraft={handleSaveDraft}
                  onPublish={handlePublish}
                  saveDisabled={isSaving}
                  publishDisabled={!draftId || publishMutation.isPending}
                  onFlowEdgesChange={
                    f.id === "pipeline"
                      ? (edges) => handleFlowEdgesChange(f.id, edges)
                      : undefined
                  }
                  onFlowNodeConfigChange={
                    f.id === "pipeline"
                      ? (nodeId, nodeConfig) =>
                          handleFlowNodeConfigChange(f.id, nodeId, nodeConfig)
                      : undefined
                  }
                />
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
