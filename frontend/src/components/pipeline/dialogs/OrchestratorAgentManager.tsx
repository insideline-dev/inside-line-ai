import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getAdminControllerGetAiAgentsAliasQueryKey,
  getAdminControllerGetAiAgentsByOrchestratorAliasQueryKey,
  getAdminControllerGetAiPromptFlowQueryKey,
  useAdminControllerDeleteAiAgentAlias,
  useAdminControllerGetAiAgentsByOrchestratorAlias,
  useAdminControllerToggleAiAgentAlias,
  useAdminControllerUpdateAiAgentAlias,
} from "@/api/generated/admin/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AgentConfigItem = {
  agentKey: string;
  label: string;
  description: string | null;
  enabled: boolean;
  isCustom: boolean;
  executionPhase: number;
  dependsOn: string[];
};

interface OrchestratorAgentManagerProps {
  orchestratorId: string;
}

export function OrchestratorAgentManager({ orchestratorId }: OrchestratorAgentManagerProps) {
  const queryClient = useQueryClient();
  const [editingAgent, setEditingAgent] = useState<AgentConfigItem | null>(null);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");

  const { data, isLoading } = useAdminControllerGetAiAgentsByOrchestratorAlias(orchestratorId);

  const agents = useMemo(() => {
    const payload = data as
      | {
          data?: { items?: AgentConfigItem[] };
          items?: AgentConfigItem[];
        }
      | undefined;
    return payload?.data?.items ?? payload?.items ?? [];
  }, [data]);

  const refreshQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: getAdminControllerGetAiPromptFlowQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getAdminControllerGetAiAgentsAliasQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getAdminControllerGetAiAgentsByOrchestratorAliasQueryKey(orchestratorId),
    });
  };

  const toggleMutation = useAdminControllerToggleAiAgentAlias({
    mutation: {
      onSuccess: () => {
        toast.success("Agent status updated");
        refreshQueries();
      },
      onError: (error) => toast.error((error as Error).message || "Failed to update status"),
    },
  });

  const updateMutation = useAdminControllerUpdateAiAgentAlias({
    mutation: {
      onSuccess: () => {
        toast.success("Agent updated");
        refreshQueries();
        setEditingAgent(null);
      },
      onError: (error) => toast.error((error as Error).message || "Failed to update agent"),
    },
  });

  const deleteMutation = useAdminControllerDeleteAiAgentAlias({
    mutation: {
      onSuccess: () => {
        toast.success("Custom agent removed");
        refreshQueries();
      },
      onError: (error) => toast.error((error as Error).message || "Failed to delete agent"),
    },
  });

  const openEditDialog = (agent: AgentConfigItem) => {
    setEditingAgent(agent);
    setLabel(agent.label);
    setDescription(agent.description ?? "");
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Agents In Orchestrator</Label>
        <Badge variant="secondary" className="text-xs">
          {agents.length} total
        </Badge>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading agents...</p>
      ) : agents.length === 0 ? (
        <p className="text-xs text-muted-foreground">No agents configured yet.</p>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <div
              key={agent.agentKey}
              className="flex items-center justify-between gap-2 rounded border p-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium">{agent.label}</span>
                  <Badge variant={agent.isCustom ? "default" : "outline"} className="text-[10px]">
                    {agent.isCustom ? "custom" : "built-in"}
                  </Badge>
                </div>
                <p className="truncate font-mono text-[10px] text-muted-foreground">{agent.agentKey}</p>
              </div>

              <div className="flex items-center gap-1.5">
                <Switch
                  checked={agent.enabled}
                  onCheckedChange={() =>
                    toggleMutation.mutate({ orchestratorId, agentKey: agent.agentKey })
                  }
                  aria-label={`Toggle ${agent.agentKey}`}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => openEditDialog(agent)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  disabled={!agent.isCustom}
                  onClick={() =>
                    deleteMutation.mutate({ orchestratorId, agentKey: agent.agentKey })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(editingAgent)} onOpenChange={(open) => !open && setEditingAgent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
            <DialogDescription className="font-mono">
              {editingAgent?.agentKey}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-agent-label">Label</Label>
              <Input
                id="edit-agent-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-agent-description">Description</Label>
              <Input
                id="edit-agent-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                if (!editingAgent) return;
                updateMutation.mutate({
                  orchestratorId,
                  agentKey: editingAgent.agentKey,
                  data: {
                    label: label.trim() || editingAgent.label,
                    description: description.trim() || undefined,
                  },
                });
              }}
              disabled={!editingAgent || updateMutation.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
