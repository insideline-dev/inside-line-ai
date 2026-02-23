import { useMemo, useState } from "react";
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
import { useAdminControllerGetAiAgentUpstreamFields } from "@/api/generated/admin/admin";
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

export function NodeConfigSheet({
  open,
  onOpenChange,
  node,
  phaseConfig,
  onPhaseConfigChange,
}: NodeConfigSheetProps) {
  const [activePromptKey, setActivePromptKey] = useState<string | null>(null);
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

  if (!node) return null;

  const isSystem = node.kind === "system";
  const selectedKey = activePromptKey ?? node.promptKeys[0] ?? null;

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

        <Tabs defaultValue="queue" className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="queue">Queue Config</TabsTrigger>
            <TabsTrigger value="io">Input / Output</TabsTrigger>
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
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
            {/* This node's outputs */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">This node outputs</Label>
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
              {node.outputs.length === 0 && (
                <p className="text-xs text-muted-foreground">No outputs defined.</p>
              )}
            </div>

            <Separator />

            {/* Upstream agent schemas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Data from connected agents</Label>
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
                  <NodePromptEditor
                    promptKey={selectedKey}
                    upstreamPaths={upstreamPaths}
                  />
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                System node — no prompt templates attached.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
