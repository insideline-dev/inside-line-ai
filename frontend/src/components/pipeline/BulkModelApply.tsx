import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Cpu, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AiModelOverridesResponse {
  data: Array<{ purpose: string; modelName: string; updatedBy: string | null; updatedAt: string }>;
  allowedModels: readonly string[];
}

const MODEL_GROUPS: Record<string, { label: string; purposes: string[] }> = {
  all_pipeline: { label: "All Pipeline", purposes: ["extraction", "enrichment", "research", "evaluation", "synthesis"] },
  evaluation: { label: "Evaluation Agents", purposes: ["evaluation"] },
  research: { label: "Research Agents", purposes: ["research"] },
  extraction: { label: "Extraction", purposes: ["extraction"] },
  enrichment: { label: "Enrichment", purposes: ["enrichment"] },
  synthesis: { label: "Synthesis", purposes: ["synthesis"] },
  clara: { label: "Clara", purposes: ["clara"] },
};

const FALLBACK_MODELS = ["gpt-5.2", "gpt-5.4", "gemini-3-flash-preview", "o4-mini-deep-research"];

const INVALIDATION_KEYS = [["admin", "ai-model-overrides"], ["/admin/ai-prompts/flow"]] as const;

export function BulkModelApplyDialog() {
  const [open, setOpen] = useState(false);
  const [groupKey, setGroupKey] = useState("all_pipeline");
  const [selectedModel, setSelectedModel] = useState("");
  const queryClient = useQueryClient();

  const { data: overridesData } = useQuery({
    queryKey: ["admin", "ai-model-overrides"],
    queryFn: () => customFetch<AiModelOverridesResponse>("/admin/ai-model-overrides"),
    staleTime: 30_000,
  });

  const allowedModels = overridesData?.allowedModels?.length
    ? overridesData.allowedModels
    : FALLBACK_MODELS;

  const group = MODEL_GROUPS[groupKey];
  const overrideMap = new Map(overridesData?.data.map((o) => [o.purpose, o.modelName]));
  const allOverrides = overridesData?.data ?? [];

  const activeOverrides = group.purposes
    .map((p) => ({ purpose: p, model: overrideMap.get(p) }))
    .filter((o): o is { purpose: string; model: string } => Boolean(o.model));

  const invalidateAll = () => {
    for (const key of INVALIDATION_KEYS) {
      void queryClient.invalidateQueries({ queryKey: [...key] });
    }
  };

  const applyMutation = useMutation({
    mutationFn: async (params: { purposes: string[]; modelName: string }) => {
      await Promise.all(
        params.purposes.map((purpose) =>
          customFetch(`/admin/ai-model-overrides/${purpose}`, {
            method: "PUT",
            body: JSON.stringify({ modelName: params.modelName }),
          }),
        ),
      );
    },
    onSuccess: () => {
      invalidateAll();
      toast.success(`Applied ${selectedModel} to ${group.label}`);
    },
    onError: () => toast.error("Failed to apply model overrides"),
  });

  const resetMutation = useMutation({
    mutationFn: async (purposes: string[]) => {
      await Promise.all(
        purposes.map((purpose) =>
          customFetch(`/admin/ai-model-overrides/${purpose}`, { method: "DELETE" }),
        ),
      );
    },
    onSuccess: () => {
      invalidateAll();
      toast.success(`Reset overrides for ${group.label}`);
    },
    onError: () => toast.error("Failed to reset model overrides"),
  });

  const isLoading = applyMutation.isPending || resetMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Cpu className="h-3.5 w-3.5 mr-1" />
          Models
          {allOverrides.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 h-4">
              {allOverrides.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Bulk Model Apply</DialogTitle>
          <DialogDescription>
            Set the AI model for a group of agents at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Agent Group</Label>
            <Select value={groupKey} onValueChange={setGroupKey}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MODEL_GROUPS).map(([key, { label }]) => (
                  <SelectItem key={key} value={key} className="text-sm">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Model</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select model..." />
              </SelectTrigger>
              <SelectContent>
                {allowedModels.map((model) => (
                  <SelectItem key={model} value={model} className="text-sm">
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              className="flex-1"
              disabled={!selectedModel || isLoading}
              onClick={() => applyMutation.mutate({ purposes: group.purposes, modelName: selectedModel })}
            >
              {applyMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Apply to {group.label}
            </Button>
            <Button
              variant="outline"
              disabled={activeOverrides.length === 0 || isLoading}
              onClick={() => resetMutation.mutate(group.purposes)}
            >
              {resetMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Reset
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Active Overrides</Label>
            {allOverrides.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {allOverrides.map((o) => (
                  <Badge key={o.purpose} variant="secondary" className="text-xs">
                    {o.purpose}: {o.modelName}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No overrides. All agents using environment defaults.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
