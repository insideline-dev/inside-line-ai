import { useState } from "react";
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
import type { Edge } from "@xyflow/react";
import { NodePromptEditor } from "./NodePromptEditor";
import { SchemaTreeView } from "./SchemaTreeView";

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
  allNodes: AiPromptFlowResponseDtoFlowsItemNodesItem[];
  edges: Edge[];
  phaseConfig?: PhaseConfigData;
  onPhaseConfigChange?: (config: Partial<PhaseConfigData>) => void;
}

export function NodeConfigSheet({
  open,
  onOpenChange,
  node,
  allNodes,
  edges,
  phaseConfig,
  onPhaseConfigChange,
}: NodeConfigSheetProps) {
  const [activePromptKey, setActivePromptKey] = useState<string | null>(null);
  const [pickedPaths, setPickedPaths] = useState<string[]>([]);

  if (!node) return null;

  const isSystem = node.kind === "system";
  const selectedKey = activePromptKey ?? node.promptKeys[0] ?? null;

  // Find all nodes that feed INTO this node via edges
  const upstreamNodeIds = edges
    .filter((e) => e.target === node.id)
    .map((e) => e.source);
  const upstreamNodes = allNodes.filter((n) => upstreamNodeIds.includes(n.id));

  const handleFieldPick = (path: string) => {
    setPickedPaths((prev) => (prev.includes(path) ? prev : [...prev, path]));
  };

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
                {upstreamNodes.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Connect agents in the canvas to see their outputs here
                  </span>
                )}
              </div>

              {upstreamNodes.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Drag from another node's handle to this node to link them.
                  <br />
                  Their output schema will appear here.
                </div>
              ) : (
                <div className="space-y-4">
                  {upstreamNodes.map((upstream) => (
                    upstream.promptKeys.length > 0 ? (
                      <SchemaTreeView
                        key={upstream.id}
                        nodeLabel={upstream.label}
                        promptKeys={upstream.promptKeys}
                        onPick={handleFieldPick}
                      />
                    ) : (
                      <div key={upstream.id} className="text-xs text-muted-foreground">
                        {upstream.label} — no prompt schema
                      </div>
                    )
                  ))}
                </div>
              )}

              {pickedPaths.length > 0 && (
                <div className="space-y-1.5 rounded-md bg-blue-500/5 border border-blue-500/20 p-3">
                  <p className="text-xs font-medium text-blue-600">
                    Picked fields — go to Prompts tab to insert
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {pickedPaths.map((p) => (
                      <Badge
                        key={p}
                        variant="outline"
                        className="text-[10px] font-mono border-blue-400/50 text-blue-500 cursor-pointer"
                        onClick={() => setPickedPaths((prev) => prev.filter((x) => x !== p))}
                      >
                        {`{{${p}}}`} ✕
                      </Badge>
                    ))}
                  </div>
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
                    upstreamPaths={pickedPaths}
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
