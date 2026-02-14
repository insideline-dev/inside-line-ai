import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminControllerGetAiPromptFlowQueryKey,
  getAdminControllerGetAiPromptRevisionsQueryKey,
  getAdminControllerGetAiPromptsQueryKey,
  useAdminControllerCreateAiPromptRevision,
  useAdminControllerGetAiPromptContextSchema,
  useAdminControllerGetAiPromptFlow,
  useAdminControllerGetAiPromptRevisions,
  useAdminControllerGetAiPrompts,
  useAdminControllerPublishAiPromptRevision,
  useAdminControllerPreviewAiPrompt,
  useAdminControllerSeedAiPrompts,
  useAdminControllerUpdateAiPromptRevision,
} from "@/api/generated/admin/admin";
import type {
  AiPromptContextSchemaResponseDto,
  AiPromptDefinitionsResponseDto,
  AiPromptDefinitionsResponseDtoItem,
  AiPromptFlowResponseDto,
  AiPromptFlowResponseDtoFlowsItem,
  AiPromptFlowResponseDtoFlowsItemNodesItem,
  AiPromptPreviewResponseDto,
  AiPromptFlowResponseDtoFlowsItemNodesItemPromptKeysItem,
  AiPromptRevisionsResponseDto,
  AiPromptSeedResultDto,
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
  CheckCircle2,
  Clock,
  FileSearch,
  Globe,
  Handshake,
  Layers,
  Linkedin,
  Newspaper,
  RefreshCw,
  Rocket,
  Save,
  Target,
  Workflow,
} from "lucide-react";

export const Route = createFileRoute("/_protected/admin/agents")({
  component: AdminAgentsPage,
});

type PromptKey = AiPromptFlowResponseDtoFlowsItemNodesItemPromptKeysItem;
type FlowDefinition = AiPromptFlowResponseDtoFlowsItem;
type FlowNode = AiPromptFlowResponseDtoFlowsItemNodesItem;
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

function pickNodeIcon(nodeId: string) {
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
  const [previewStartupId, setPreviewStartupId] = useState("");
  const [previewStage, setPreviewStage] = useState<"auto" | StageOption>("auto");
  const [previewResult, setPreviewResult] = useState<AiPromptPreviewResponseDto | null>(null);

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

  const revisionsPayload = useMemo(() => {
    const data = extractResponseData<AiPromptRevisionsResponseDto>(revisionsQuery.data);
    return data;
  }, [revisionsQuery.data]);
  const contextSchema = useMemo(() => {
    const data = extractResponseData<AiPromptContextSchemaResponseDto>(contextSchemaQuery.data);
    return data;
  }, [contextSchemaQuery.data]);

  const revisions = revisionsPayload?.revisions ?? [];
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
      setNotes("");
      return;
    }

    setSystemPrompt("");
    setUserPrompt("");
    setNotes("");
  }, [currentPromptKey, activeDraft, activePublished]);

  useEffect(() => {
    setPreviewResult(null);
  }, [currentPromptKey]);

  const seedMutation = useAdminControllerSeedAiPrompts({
    mutation: {
      onSuccess: (result) => {
        const payload = extractResponseData<AiPromptSeedResultDto>(result);
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAiPromptsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAiPromptFlowQueryKey() });
        if (currentPromptKey) {
          queryClient.invalidateQueries({
            queryKey: getAdminControllerGetAiPromptRevisionsQueryKey(currentPromptKey),
          });
        }

        if (!payload) {
          toast.success("Seed completed");
          return;
        }

        const stageInsertCount = Object.values(payload.insertedByStage ?? {}).reduce(
          (acc, count) => acc + Number(count),
          0,
        );

        toast.success(
          `Seeded ${payload.insertedTotal} revisions (${payload.insertedGlobal} global + ${stageInsertCount} stage-specific, ${payload.skippedExisting} skipped)`,
        );
      },
      onError: (error) => {
        const message = (error as Error).message || "Failed to seed prompts";
        toast.error(message);
      },
    },
  });

  const createDraftMutation = useAdminControllerCreateAiPromptRevision({
    mutation: {
      onSuccess: () => {
        if (currentPromptKey) {
          queryClient.invalidateQueries({ queryKey: getAdminControllerGetAiPromptRevisionsQueryKey(currentPromptKey) });
        }
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAiPromptsQueryKey() });
        toast.success("Draft created");
      },
      onError: (error) => toast.error((error as Error).message || "Failed to create draft"),
    },
  });

  const updateDraftMutation = useAdminControllerUpdateAiPromptRevision({
    mutation: {
      onSuccess: () => {
        if (currentPromptKey) {
          queryClient.invalidateQueries({ queryKey: getAdminControllerGetAiPromptRevisionsQueryKey(currentPromptKey) });
        }
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAiPromptsQueryKey() });
        toast.success("Draft updated");
      },
      onError: (error) => toast.error((error as Error).message || "Failed to update draft"),
    },
  });

  const publishMutation = useAdminControllerPublishAiPromptRevision({
    mutation: {
      onSuccess: () => {
        if (currentPromptKey) {
          queryClient.invalidateQueries({ queryKey: getAdminControllerGetAiPromptRevisionsQueryKey(currentPromptKey) });
        }
        queryClient.invalidateQueries({ queryKey: getAdminControllerGetAiPromptsQueryKey() });
        toast.success("Prompt revision published");
      },
      onError: (error) => toast.error((error as Error).message || "Failed to publish revision"),
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

  const isSaving =
    createDraftMutation.isPending || updateDraftMutation.isPending || publishMutation.isPending;

  const handleSaveDraft = () => {
    if (!currentPromptKey) return;

    if (!systemPrompt.trim() && !userPrompt.trim()) {
      toast.error("System and user prompts cannot both be empty");
      return;
    }

    const payload = {
      stage: stageValue,
      systemPrompt,
      userPrompt,
      notes: notes || undefined,
    };

    if (activeDraft) {
      updateDraftMutation.mutate({
        key: currentPromptKey,
        revisionId: activeDraft.id,
        data: payload,
      });
      return;
    }

    createDraftMutation.mutate({
      key: currentPromptKey,
      data: payload,
    });
  };

  const handlePublish = (revisionId: string) => {
    if (!currentPromptKey) return;
    publishMutation.mutate({ key: currentPromptKey, revisionId });
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

  const incomingNodeLabels = useMemo(() => {
    if (!activeFlow || !selectedNode) return [];
    return activeFlow.edges
      .filter((edge) => edge.to === selectedNode.id)
      .map((edge) => nodeById.get(edge.from)?.label ?? edge.from);
  }, [activeFlow, selectedNode, nodeById]);

  const outgoingNodeLabels = useMemo(() => {
    if (!activeFlow || !selectedNode) return [];
    return activeFlow.edges
      .filter((edge) => edge.from === selectedNode.id)
      .map((edge) => nodeById.get(edge.to)?.label ?? edge.to);
  }, [activeFlow, selectedNode, nodeById]);

  const isLoading = definitionsQuery.isLoading || flowQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">AI Agent Prompt Console</h1>
          <p className="text-muted-foreground">
            Visualize the data flow, click any agent, and manage stage-aware prompt revisions.
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
              }
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            <Rocket className="mr-2 h-4 w-4" />
            {seedMutation.isPending ? "Seeding..." : "Seed From Code"}
          </Button>
        </div>
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
        <SheetContent side="right" className="w-full overflow-hidden sm:max-w-[780px]">
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

              {selectedNode.promptKeys.length === 0 ? (
                <div className="mt-4 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Graph Context (Static)</CardTitle>
                      <CardDescription>This node is runtime logic, not prompt-configured.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="mb-2 text-sm font-medium">Inputs</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedNode.inputs.map((input) => (
                            <Badge key={input} variant="outline">
                              {input}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-medium">Outputs</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedNode.outputs.map((output) => (
                            <Badge key={output}>{output}</Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-medium">Incoming Nodes</p>
                        <p className="text-sm text-muted-foreground">
                          {incomingNodeLabels.length > 0 ? incomingNodeLabels.join(", ") : "None"}
                        </p>
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-medium">Outgoing Nodes</p>
                        <p className="text-sm text-muted-foreground">
                          {outgoingNodeLabels.length > 0 ? outgoingNodeLabels.join(", ") : "None"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="mt-4 space-y-4 overflow-y-auto pb-24">
                  <Tabs defaultValue="prompts" className="space-y-4">
                    <TabsList>
                      <TabsTrigger value="prompts">Prompts</TabsTrigger>
                      <TabsTrigger value="variables">Variables</TabsTrigger>
                      <TabsTrigger value="revisions">Revisions</TabsTrigger>
                      <TabsTrigger value="runtime-preview">Runtime Preview</TabsTrigger>
                      <TabsTrigger value="context">Graph Context (Static)</TabsTrigger>
                    </TabsList>

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
                          <CardTitle className="text-base">Prompt Editor</CardTitle>
                          <CardDescription>
                            {selectedDefinition?.description ?? "Create, update, and publish stage-aware prompt revisions."}
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
                              <Label>Notes (optional)</Label>
                              <Input
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                                placeholder="What changed in this draft?"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>System Prompt</Label>
                            <Textarea
                              value={systemPrompt}
                              onChange={(event) => setSystemPrompt(event.target.value)}
                              className="min-h-[160px] font-mono text-xs"
                              placeholder="System prompt"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>User Prompt</Label>
                            <Textarea
                              value={userPrompt}
                              onChange={(event) => setUserPrompt(event.target.value)}
                              className="min-h-[240px] font-mono text-xs"
                              placeholder="User prompt template"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={handleSaveDraft} disabled={!currentPromptKey || isSaving}>
                              <Save className="mr-2 h-4 w-4" />
                              {activeDraft ? "Update Draft" : "Create Draft"}
                            </Button>
                            {activeDraft ? (
                              <Button
                                variant="secondary"
                                onClick={() => handlePublish(activeDraft.id)}
                                disabled={publishMutation.isPending}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Publish Draft
                              </Button>
                            ) : null}
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
                          <CardTitle className="text-base">Revision History</CardTitle>
                          <CardDescription>
                            Draft, published, and archived revisions for this prompt key.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {revisionsQuery.isLoading ? (
                            Array.from({ length: 3 }).map((_, index) => (
                              <Skeleton key={index} className="h-16 w-full" />
                            ))
                          ) : revisions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No revisions found for this prompt key.</p>
                          ) : (
                            revisions.map((revision: PromptRevision) => (
                              <div key={revision.id} className="rounded-md border p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={revision.status === "published" ? "default" : "outline"}>
                                    {revision.status}
                                  </Badge>
                                  <Badge variant="secondary">{formatStage(revision.stage)}</Badge>
                                  <span className="text-xs text-muted-foreground">v{revision.version}</span>
                                  <span className="text-xs text-muted-foreground">{revision.id}</span>
                                  {revision.status === "draft" ? (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="ml-auto"
                                      onClick={() => handlePublish(revision.id)}
                                    >
                                      Publish
                                    </Button>
                                  ) : null}
                                </div>
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
                        <CardContent className="space-y-4">
                          <div>
                            <p className="mb-2 text-sm font-medium">Inputs</p>
                            <div className="flex flex-wrap gap-2">
                              {selectedNode.inputs.map((input) => (
                                <Badge key={input} variant="outline">
                                  {input}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="mb-2 text-sm font-medium">Outputs</p>
                            <div className="flex flex-wrap gap-2">
                              {selectedNode.outputs.map((output) => (
                                <Badge key={output}>{output}</Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="mb-2 text-sm font-medium">Incoming Nodes</p>
                            <p className="text-sm text-muted-foreground">
                              {incomingNodeLabels.length > 0 ? incomingNodeLabels.join(", ") : "None"}
                            </p>
                          </div>
                          <div>
                            <p className="mb-2 text-sm font-medium">Outgoing Nodes</p>
                            <p className="text-sm text-muted-foreground">
                              {outgoingNodeLabels.length > 0 ? outgoingNodeLabels.join(", ") : "None"}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
              )}

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
