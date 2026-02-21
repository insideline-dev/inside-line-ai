import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminControllerGetAiAgentsAliasQueryKey,
  getAdminControllerGetAiAgentsByOrchestratorAliasQueryKey,
  getAdminControllerGetAiPromptFlowQueryKey,
  useAdminControllerCreateAiAgentAlias,
  useAdminControllerGetAiAgentsByOrchestratorAlias,
} from "@/api/generated/admin/admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface AddAgentDialogProps {
  orchestratorId: string;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function AddAgentDialog({ orchestratorId }: AddAgentDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [agentKey, setAgentKey] = useState("");
  const [description, setDescription] = useState("");
  const [executionPhase, setExecutionPhase] = useState<number>(1);
  const [dependsOn, setDependsOn] = useState<string[]>([]);

  const { data: orchestratorAgentsData } = useAdminControllerGetAiAgentsByOrchestratorAlias(
    orchestratorId,
    { query: { enabled: open } },
  );

  const existingAgents = useMemo(() => {
    const payload = orchestratorAgentsData as
      | {
          data?: {
            items?: Array<{ agentKey: string; label: string }>;
          };
          items?: Array<{ agentKey: string; label: string }>;
        }
      | undefined;
    return payload?.data?.items ?? payload?.items ?? [];
  }, [orchestratorAgentsData]);

  const mutation = useAdminControllerCreateAiAgentAlias({
    mutation: {
      onSuccess: () => {
        toast.success("Custom agent created");
        void queryClient.invalidateQueries({
          queryKey: getAdminControllerGetAiPromptFlowQueryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: getAdminControllerGetAiAgentsAliasQueryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: getAdminControllerGetAiAgentsByOrchestratorAliasQueryKey(orchestratorId),
        });
        setOpen(false);
        setLabel("");
        setAgentKey("");
        setDescription("");
        setExecutionPhase(1);
        setDependsOn([]);
      },
      onError: (error) => {
        toast.error((error as Error).message || "Failed to create agent");
      },
    },
  });

  const canSubmit = label.trim().length > 0 && (agentKey.trim().length >= 2 || slugify(label).length >= 2);

  const toggleDependency = (value: string) => {
    setDependsOn((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          + Add Agent
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Custom Agent</DialogTitle>
          <DialogDescription>
            Create a new agent under <span className="font-mono">{orchestratorId}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="agent-label">Label</Label>
            <Input
              id="agent-label"
              value={label}
              onChange={(event) => {
                const nextLabel = event.target.value;
                setLabel(nextLabel);
                if (agentKey.trim().length === 0) {
                  setAgentKey(slugify(nextLabel));
                }
              }}
              placeholder="Partner Reference Check"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-key">Agent Key</Label>
            <Input
              id="agent-key"
              value={agentKey}
              onChange={(event) => setAgentKey(slugify(event.target.value))}
              placeholder="partner-reference-check"
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-description">Description</Label>
            <Input
              id="agent-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this agent evaluates"
            />
          </div>

          {orchestratorId === "research_orchestrator" ? (
            <div className="space-y-1.5">
              <Label>Execution Phase</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={executionPhase === 1 ? "default" : "outline"}
                  onClick={() => setExecutionPhase(1)}
                >
                  Phase 1
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={executionPhase === 2 ? "default" : "outline"}
                  onClick={() => setExecutionPhase(2)}
                >
                  Phase 2
                </Button>
              </div>
            </div>
          ) : null}

          {existingAgents.length > 0 ? (
            <div className="space-y-2">
              <Label>Dependencies</Label>
              <div className="max-h-32 space-y-2 overflow-y-auto rounded-md border p-2">
                {existingAgents.map((agent) => (
                  <label
                    key={agent.agentKey}
                    className="flex cursor-pointer items-center gap-2 text-xs"
                  >
                    <Checkbox
                      checked={dependsOn.includes(agent.agentKey)}
                      onCheckedChange={() => toggleDependency(agent.agentKey)}
                    />
                    <span>{agent.label}</span>
                    <span className="font-mono text-muted-foreground">{agent.agentKey}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              const fallbackKey = slugify(label);
              const finalKey = agentKey.trim().length >= 2 ? agentKey : fallbackKey;
              mutation.mutate({
                orchestratorId,
                data: {
                  agentKey: finalKey,
                  label: label.trim(),
                  description: description.trim() || undefined,
                  executionPhase: orchestratorId === "research_orchestrator" ? executionPhase : undefined,
                  dependsOn,
                },
              });
            }}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending ? "Creating..." : "Create Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
