import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useAdminControllerGetAiPromptFlow,
  useAdminControllerListPipelineFlowConfigs,
  useAdminControllerCreatePipelineFlowConfig,
  useAdminControllerUpdatePipelineFlowConfig,
  useAdminControllerPublishPipelineFlowConfig,
  getAdminControllerListPipelineFlowConfigsQueryKey,
} from "@/api/generated/admin/admin";
import { PipelineCanvas } from "@/components/pipeline/PipelineCanvas";
import type { PhaseConfig, PipelineConfig } from "@/components/pipeline/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_protected/admin/flow")({
  component: AdminFlowPage,
});

// Default pipeline config matching backend DEFAULT_PIPELINE_CONFIG
const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  maxPipelineTimeoutMs: 45 * 60 * 1000,
  minimumEvaluationAgents: 8,
  defaultRetryPolicy: {
    maxRetries: 3,
    backoff: "exponential",
    initialDelayMs: 1000,
  },
  phases: [
    { phase: "enrichment", dependsOn: [], canRunParallelWith: [], timeoutMs: 5 * 60 * 1000, maxRetries: 2, required: false, queue: "ai-enrichment" },
    { phase: "extraction", dependsOn: ["enrichment"], canRunParallelWith: [], timeoutMs: 8 * 60 * 1000, maxRetries: 2, required: false, queue: "ai-extraction" },
    { phase: "scraping", dependsOn: ["enrichment"], canRunParallelWith: [], timeoutMs: 10 * 60 * 1000, maxRetries: 2, required: false, queue: "ai-scraping" },
    { phase: "research", dependsOn: ["extraction", "scraping"], canRunParallelWith: [], timeoutMs: 10 * 60 * 1000, maxRetries: 2, required: false, queue: "ai-research" },
    { phase: "evaluation", dependsOn: ["research"], canRunParallelWith: [], timeoutMs: 12 * 60 * 1000, maxRetries: 2, required: true, queue: "ai-evaluation" },
    { phase: "synthesis", dependsOn: ["evaluation"], canRunParallelWith: [], timeoutMs: 8 * 60 * 1000, maxRetries: 2, required: true, queue: "ai-synthesis" },
  ],
};

function extractResponseData<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function AdminFlowPage() {
  const queryClient = useQueryClient();
  const [selectedFlowId, setSelectedFlowId] = useState<string>("pipeline");
  const [draftId, setDraftId] = useState<string | null>(null);
  const history = useUndoRedo<PhaseConfig[]>(DEFAULT_PIPELINE_CONFIG.phases);
  const [isDirty, setIsDirty] = useState(false);

  const { data: flowData, isLoading: flowLoading } =
    useAdminControllerGetAiPromptFlow();

  const { data: configsData } =
    useAdminControllerListPipelineFlowConfigs();

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
      onSuccess: () => {
        setDraftId(null);
        toast.success("Config published!");
        queryClient.invalidateQueries({
          queryKey: getAdminControllerListPipelineFlowConfigsQueryKey(),
        });
      },
      onError: (err) => toast.error((err as Error).message || "Failed to publish"),
    },
  });

  const flows = extractResponseData<{ flows: AiPromptFlowResponseDtoFlowsItem[] }>(
    flowData,
  )?.flows;
  const selectedFlow = flows?.find((f) => f.id === selectedFlowId);

  const configs = extractResponseData<{
    data: Array<{ id: string; name: string; status: string; version: number; updatedAt: string }>;
  }>(configsData);

  const handlePipelineConfigChange = useCallback(
    (updated: PhaseConfig[]) => {
      history.push(updated);
      setIsDirty(true);
    },
    [history],
  );

  const handleSaveDraft = () => {
    if (!selectedFlow) return;
    const payload = {
      name: `Pipeline Config ${new Date().toLocaleDateString()}`,
      flowDefinition: {
        flowId: selectedFlow.id,
        nodes: selectedFlow.nodes.map((n) => n.id),
        edges: selectedFlow.edges,
      } as Record<string, unknown>,
      pipelineConfig: {
        ...DEFAULT_PIPELINE_CONFIG,
        phases: history.present,
      } as unknown as Record<string, unknown>,
    };

    if (draftId) {
      updateDraftMutation.mutate({ id: draftId, data: payload });
    } else {
      createDraftMutation.mutate({ data: payload });
    }
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
    setDraftId(null);
    setIsDirty(false);
    toast.info("Reset to defaults");
  };

  const handleLoadConfig = (configId: string) => {
    const config = configs?.data?.find((c: { id: string }) => c.id === configId) as
      | ({ pipelineConfig?: PipelineConfig } & { id: string; name: string })
      | undefined;
    if (!config) return;

    setDraftId(config.id);

    const loadedPhases = config.pipelineConfig?.phases;
    if (loadedPhases) {
      history.push(loadedPhases as PhaseConfig[]);
    }

    toast.info(`Loaded: ${config.name}`);
  };

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

        {flows?.map((f) => (
          <TabsContent key={f.id} value={f.id} className="flex-1 min-h-0 mt-0">
            <div className="h-full rounded-lg border bg-background">
              <PipelineCanvas
                flow={f}
                pipelineConfig={
                  f.id === "pipeline" ? history.present : undefined
                }
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
              />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
