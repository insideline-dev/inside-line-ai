import { useCallback, useEffect, useState } from "react";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AiPromptFlowResponseDtoFlowsItemNodesItem } from "@/api/generated/model";
import { customFetch } from "@/api/client";
import { NodePromptEditor } from "./NodePromptEditor";
import { OutputSchemaViewer } from "./prompt-editor/OutputSchemaViewer";
import { AddAgentDialog } from "./dialogs/AddAgentDialog";
import { OrchestratorAgentManager } from "./dialogs/OrchestratorAgentManager";

interface AiModelOverridesResponse {
  data: Array<{ purpose: string; modelName: string; updatedBy: string | null; updatedAt: string }>;
  allowedModels: readonly string[];
}

function inferPurposeFromPromptKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  if (key === "enrichment.gapFill") return "enrichment";
  if (key === "extraction.fields") return "extraction";
  if (key.startsWith("research.")) return "research";
  if (key.startsWith("evaluation.")) return "evaluation";
  if (key === "synthesis.final") return "synthesis";
  if (key === "matching.thesis") return "thesis_alignment";
  if (key.startsWith("clara.")) return "clara";
  return "extraction";
}

function useAiModelOverrides() {
  return useQuery({
    queryKey: ["admin", "ai-model-overrides"],
    queryFn: () => customFetch<AiModelOverridesResponse>("/admin/ai-model-overrides"),
    staleTime: 30_000,
  });
}

function useSetModelOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ purpose, modelName, searchMode }: { purpose: string; modelName: string; searchMode?: string }) =>
      customFetch(`/admin/ai-model-overrides/${purpose}`, {
        method: "PUT",
        body: JSON.stringify({ modelName, searchMode }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "ai-model-overrides"] });
      void queryClient.invalidateQueries({ queryKey: ["/admin/ai-prompts/flow"] });
    },
  });
}

function useRemoveModelOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (purpose: string) =>
      customFetch(`/admin/ai-model-overrides/${purpose}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "ai-model-overrides"] });
      void queryClient.invalidateQueries({ queryKey: ["/admin/ai-prompts/flow"] });
    },
  });
}

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
  nodeConfig?: unknown;
  onNodeConfigChange?: (config: unknown | undefined) => void;
}

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

function parseScrapeNodeConfig(value: unknown): {
  discoveryEnabled: boolean;
  manualPaths: string[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { discoveryEnabled: false, manualPaths: [] };
  }
  const nodeRecord = value as Record<string, unknown>;
  const scrapingRaw = nodeRecord.scraping;
  if (!scrapingRaw || typeof scrapingRaw !== "object" || Array.isArray(scrapingRaw)) {
    return { discoveryEnabled: false, manualPaths: [] };
  }

  const scrapingRecord = scrapingRaw as Record<string, unknown>;
  const discoveryEnabled = scrapingRecord.discoveryEnabled === true;
  const deduped = new Set<string>();
  if (Array.isArray(scrapingRecord.manualPaths)) {
    for (const path of scrapingRecord.manualPaths) {
      if (typeof path !== "string") {
        continue;
      }
      const normalized = normalizeManualScrapePath(path);
      if (!normalized || normalized === "/") {
        continue;
      }
      deduped.add(normalized);
    }
  }

  return {
    discoveryEnabled,
    manualPaths: Array.from(deduped),
  };
}

export function NodeConfigSheet({
  open,
  onOpenChange,
  node,
  phaseConfig,
  onPhaseConfigChange,
  nodeConfig,
  onNodeConfigChange,
}: NodeConfigSheetProps) {
  const [activePromptKey, setActivePromptKey] = useState<string | null>(null);
  const [scrapeDiscoveryEnabled, setScrapeDiscoveryEnabled] = useState(false);
  const [scrapeManualPathsInput, setScrapeManualPathsInput] = useState("");
  const [evalWebSearchEnabled, setEvalWebSearchEnabled] = useState(false);
  const [evalBraveSearchEnabled, setEvalBraveSearchEnabled] = useState(false);

  const { data: overridesData } = useAiModelOverrides();
  const setOverride = useSetModelOverride();
  const removeOverride = useRemoveModelOverride();

  const isSystem = node?.kind === "system";
  const isScrapeWebsiteNode = node?.id === "scrape_website";
  const isEvalAgentNode = node?.id?.startsWith("evaluation_") ?? false;
  const isResearchAgentNode = node?.id?.startsWith("research_") && node?.kind === "prompt";
  const hasSearchToggles = isEvalAgentNode || isResearchAgentNode;
  const selectedKey = activePromptKey ?? node?.promptKeys[0] ?? null;

  const allowedModels = overridesData?.allowedModels ?? [
    "gpt-5.2", "gpt-5.4", "gemini-3-flash-preview", "o4-mini-deep-research",
  ];
  const runtimePurpose =
    ((node?.runtimeModel as Record<string, unknown> | undefined)?.purpose as string | undefined)
    ?? inferPurposeFromPromptKey(node?.promptKeys[0]);

  const handleModelChange = useCallback(
    (modelName: string | null) => {
      if (!runtimePurpose) return;
      if (modelName === null) {
        removeOverride.mutate(runtimePurpose);
      } else {
        const currentSearchMode = (node?.runtimeModel as Record<string, unknown> | undefined)?.searchMode as string | undefined;
        setOverride.mutate({ purpose: runtimePurpose, modelName, searchMode: currentSearchMode });
      }
    },
    [runtimePurpose, node?.runtimeModel, setOverride, removeOverride],
  );

  const handleSearchModeChange = useCallback(
    (searchMode: string) => {
      if (!runtimePurpose || !node?.runtimeModel) return;
      setOverride.mutate({
        purpose: runtimePurpose,
        modelName: node.runtimeModel.modelName,
        searchMode,
      });
    },
    [runtimePurpose, node?.runtimeModel, setOverride],
  );

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
  }, [node?.id, node?.promptKeys]);

  useEffect(() => {
    if (!isScrapeWebsiteNode) {
      setScrapeDiscoveryEnabled(false);
      setScrapeManualPathsInput("");
      return;
    }

    const parsed = parseScrapeNodeConfig(nodeConfig);
    setScrapeDiscoveryEnabled(parsed.discoveryEnabled);
    setScrapeManualPathsInput(parsed.manualPaths.join("\n"));
  }, [isScrapeWebsiteNode, node?.id, nodeConfig]);

  useEffect(() => {
    if (!hasSearchToggles) {
      setEvalWebSearchEnabled(false);
      setEvalBraveSearchEnabled(false);
      return;
    }
    const config = nodeConfig as { webSearchEnabled?: boolean; braveSearchEnabled?: boolean } | undefined;
    setEvalWebSearchEnabled(config?.webSearchEnabled === true);
    setEvalBraveSearchEnabled(config?.braveSearchEnabled === true);
  }, [hasSearchToggles, node?.id, nodeConfig]);

  const handleEvalSearchToggle = (field: "webSearchEnabled" | "braveSearchEnabled", enabled: boolean) => {
    const updated = {
      webSearchEnabled: field === "webSearchEnabled" ? enabled : evalWebSearchEnabled,
      braveSearchEnabled: field === "braveSearchEnabled" ? enabled : evalBraveSearchEnabled,
    };
    if (field === "webSearchEnabled") setEvalWebSearchEnabled(enabled);
    if (field === "braveSearchEnabled") setEvalBraveSearchEnabled(enabled);
    onNodeConfigChange?.(updated);
  };

  const applyScrapeConfig = () => {
    if (!isScrapeWebsiteNode) {
      return;
    }

    const manualPaths = Array.from(
      new Set(
        scrapeManualPathsInput
          .split(/\r?\n/)
          .map((line) => normalizeManualScrapePath(line))
          .filter((line): line is string => Boolean(line && line !== "/")),
      ),
    );

    if (!scrapeDiscoveryEnabled && manualPaths.length === 0) {
      onNodeConfigChange?.(undefined);
      return;
    }

    onNodeConfigChange?.({
      scraping: {
        ...(manualPaths.length > 0 ? { manualPaths } : {}),
        discoveryEnabled: scrapeDiscoveryEnabled,
      },
    });
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
                {isScrapeWebsiteNode ? (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Enable Discovery</Label>
                        <p className="text-xs text-muted-foreground">
                          When off, scraping only uses homepage + manual paths.
                        </p>
                      </div>
                      <Switch
                        checked={scrapeDiscoveryEnabled}
                        onCheckedChange={setScrapeDiscoveryEnabled}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Manual Relative Paths</Label>
                      <Textarea
                        value={scrapeManualPathsInput}
                        onChange={(event) =>
                          setScrapeManualPathsInput(event.target.value)
                        }
                        className="min-h-24 text-xs font-mono"
                        placeholder={"/about\n/team\n/pricing"}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        One path per line. Use relative paths only (for example
                        `/about` or `team`).
                      </p>
                    </div>

                    <div className="flex justify-end">
                      <Button size="sm" onClick={applyScrapeConfig}>
                        Apply Scrape Settings (Auto-publish)
                      </Button>
                    </div>
                  </div>
                ) : null}

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
            {node.outputs.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Routes</Label>
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

            <OutputSchemaViewer nodeId={node.id} />
          </TabsContent>

          {/* ── Prompts ── */}
          {!isSystem ? (
            <TabsContent value="prompts" className="space-y-4 mt-4">
              {node.id.includes("orchestrator") && (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  Prompt templates are file-backed. Edit files in
                  `backend/src/modules/ai/prompts/library`.
                </div>
              )}
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
                    <NodePromptEditor
                      promptKey={selectedKey}
                      upstreamPaths={[]}
                    />
                  )}

                  {node.runtimeModel ? (
                    <div className="space-y-3 rounded-md border border-border/70 p-3">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Model
                      </Label>
                      <div className="flex items-center gap-2">
                        <Select
                          value={node.runtimeModel.modelName}
                          onValueChange={(value) => handleModelChange(value)}
                          disabled={!runtimePurpose || setOverride.isPending || removeOverride.isPending}
                        >
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {allowedModels.map((model) => (
                              <SelectItem key={model} value={model} className="text-xs">
                                {model}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {node.runtimeModel.provider}
                        </Badge>
                      </div>
                      {(() => {
                        const supportedSearchModes: string[] =
                          ((node.runtimeModel as Record<string, unknown>)?.supportedSearchModes as string[] | undefined)
                          ?? ["off"];
                        return supportedSearchModes.length > 1 ? (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Search Mode
                            </Label>
                            <Select
                              value={node.runtimeModel.searchMode}
                              onValueChange={handleSearchModeChange}
                              disabled={!runtimePurpose || setOverride.isPending}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {supportedSearchModes.map((mode) => (
                                  <SelectItem key={mode} value={mode} className="text-xs">
                                    {mode === "off" ? "Off"
                                      : mode === "provider_grounded_search" ? "Provider Search"
                                      : mode === "brave_tool_search" ? "Brave Search"
                                      : "Provider + Brave"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : node.runtimeModel.searchMode !== "off" ? (
                          <Badge variant="outline" className="text-[10px]">
                            search: {node.runtimeModel.searchMode}
                          </Badge>
                        ) : null;
                      })()}
                      {(node.runtimeModel.source as string) === "override" ? (
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-amber-600 dark:text-amber-400">
                            Custom override active.
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] text-muted-foreground"
                            onClick={() => handleModelChange(null)}
                            disabled={removeOverride.isPending}
                          >
                            Revert to default
                          </Button>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          Using default from environment config.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                      No model configuration available for this node.
                    </div>
                  )}

                  {hasSearchToggles && (
                    <div className="space-y-3 rounded-md border border-border/70 p-3">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Search Tools
                      </Label>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-xs font-medium">Provider Web Search</Label>
                          <p className="text-[11px] text-muted-foreground">
                            Use the model provider's native web search.
                          </p>
                        </div>
                        <Switch
                          checked={evalWebSearchEnabled}
                          onCheckedChange={(v) => handleEvalSearchToggle("webSearchEnabled", v)}
                        />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-xs font-medium">Brave Deep Search</Label>
                          <p className="text-[11px] text-muted-foreground">
                            Additional search via Brave for deeper evidence.
                          </p>
                        </div>
                        <Switch
                          checked={evalBraveSearchEnabled}
                          onCheckedChange={(v) => handleEvalSearchToggle("braveSearchEnabled", v)}
                        />
                      </div>
                      {(evalWebSearchEnabled || evalBraveSearchEnabled) && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          Adds latency and cost to this agent's execution.
                        </p>
                      )}
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
