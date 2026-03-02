import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getAdminControllerGetAiPromptFlowQueryKey,
  useAdminControllerBulkAppendPromptSection,
} from "@/api/generated/admin/admin";
import type { BulkAppendPromptSectionDtoScope } from "@/api/generated/model";

function resolveScope(
  orchestratorId: string,
): BulkAppendPromptSectionDtoScope | null {
  if (orchestratorId.startsWith("research")) return "research_agents";
  if (orchestratorId.startsWith("evaluation")) return "evaluation_agents";
  return null;
}

function scopeLabel(scope: BulkAppendPromptSectionDtoScope): string {
  return scope === "research_agents" ? "research" : "evaluation";
}

function extractResponseData<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

interface BulkPromptAppendSectionProps {
  orchestratorId: string;
}

export function BulkPromptAppendSection({
  orchestratorId,
}: BulkPromptAppendSectionProps) {
  const scope = resolveScope(orchestratorId);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useAdminControllerBulkAppendPromptSection({
    mutation: {
      onSuccess: async (response) => {
        const result = extractResponseData<{
          appliedKeys: string[];
          affectedRevisionCount: number;
        }>(response);

        toast.success(
          `Appended section to ${result.affectedRevisionCount} prompt revisions across ${result.appliedKeys.length} agents.`,
        );

        setSection("");
        setConfirmOpen(false);

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
        toast.error(
          (err as Error).message || "Failed to bulk append prompt section",
        ),
    },
  });

  if (!scope) return null;

  const handleApply = () => {
    mutation.mutate({ data: { scope, section } });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span>Append Section to All Agents</span>
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {scopeLabel(scope)}
          </Badge>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3 space-y-3">
        <Textarea
          value={section}
          onChange={(e) => setSection(e.target.value)}
          placeholder={`Write a prompt section to append to all ${scopeLabel(scope)} agents' system prompts...\n\nExample:\n## Additional Instructions\nAlways consider ESG factors in your analysis.`}
          className="min-h-[120px] text-sm font-mono"
        />

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            This will append to all {scopeLabel(scope)} agents across every
            stage.
          </p>
          <Button
            size="sm"
            disabled={!section.trim() || mutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {mutation.isPending ? "Applying..." : "Append to All"}
          </Button>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Append to all {scopeLabel(scope)} agents?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    This will append the following section to the system prompts
                    of all {scopeLabel(scope)} agents, across every stage. New
                    revisions will be published immediately.
                  </p>
                  <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">
                    {section}
                  </pre>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleApply}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Applying..." : "Confirm & Append"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CollapsibleContent>
    </Collapsible>
  );
}
