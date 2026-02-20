import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ChevronDown, ChevronUp, Clock, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  useAdminControllerGetAiPromptRevisions,
  useAdminControllerCreateAiPromptRevision,
  useAdminControllerPublishAiPromptRevision,
  getAdminControllerGetAiPromptRevisionsQueryKey,
} from "@/api/generated/admin/admin";

interface NodePromptEditorProps {
  promptKey: string;
  upstreamPaths?: string[];
}

export function NodePromptEditor({ promptKey, upstreamPaths = [] }: NodePromptEditorProps) {
  const queryClient = useQueryClient();
  const systemRef = useRef<HTMLTextAreaElement>(null);
  const userRef = useRef<HTMLTextAreaElement>(null);
  const [activeField, setActiveField] = useState<"system" | "user">("system");
  const [showHistory, setShowHistory] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const { data, isLoading } = useAdminControllerGetAiPromptRevisions(promptKey);

  useEffect(() => {
    if (!data || systemPrompt !== null) return;
    const d = (data as unknown as { data: typeof revisions }).data ?? data as unknown as typeof revisions;
    const published = d?.revisions?.find((r) => r.status === "published");
    setSystemPrompt(published?.systemPrompt ?? "");
    setUserPrompt(published?.userPrompt ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const revisions = (data as unknown as {
    revisions: Array<{ id: string; status: string; systemPrompt: string; userPrompt: string; version: number; notes?: string; createdAt: string; publishedAt?: string }>;
    definition: { key: string; displayName: string; description: string };
    allowedVariables: string[];
    requiredVariables: string[];
    variableDefinitions: Record<string, { description: string; source: string }>;
  }) ?? null;

  const published = revisions?.revisions?.find((r) => r.status === "published");
  const allowedVars = revisions?.allowedVariables ?? [];
  const variableDefs = revisions?.variableDefinitions ?? {};

  const createMutation = useAdminControllerCreateAiPromptRevision({
    mutation: { onError: (e) => toast.error((e as Error).message || "Failed to create draft") },
  });

  const publishMutation = useAdminControllerPublishAiPromptRevision({
    mutation: {
      onSuccess: () => {
        setIsDirty(false);
        toast.success("Prompt saved & published");
        queryClient.invalidateQueries({
          queryKey: getAdminControllerGetAiPromptRevisionsQueryKey(promptKey),
        });
      },
      onError: (e) => toast.error((e as Error).message || "Failed to publish"),
    },
  });

  const handleSaveAndPublish = async () => {
    if (!systemPrompt || !userPrompt) return;
    try {
      const draft = await createMutation.mutateAsync({
        key: promptKey,
        data: { systemPrompt, userPrompt },
      });
      const draftData = (draft as unknown as { data: { id: string } }).data ?? (draft as unknown as { id: string });
      await publishMutation.mutateAsync({ key: promptKey, revisionId: draftData.id });
    } catch {
      // errors handled in mutation callbacks
    }
  };

  const insertVariable = (varName: string) => {
    const tag = `{{${varName}}}`;
    const ref = activeField === "system" ? systemRef : userRef;
    const setter = activeField === "system" ? setSystemPrompt : setUserPrompt;
    const current = activeField === "system" ? systemPrompt : userPrompt;

    if (ref.current) {
      const { selectionStart, selectionEnd } = ref.current;
      const val = current ?? "";
      const next = val.slice(0, selectionStart) + tag + val.slice(selectionEnd);
      setter(next);
      setIsDirty(true);
      setTimeout(() => {
        if (ref.current) {
          const pos = (selectionStart ?? 0) + tag.length;
          ref.current.setSelectionRange(pos, pos);
          ref.current.focus();
        }
      }, 0);
    }
  };

  const isSaving = createMutation.isPending || publishMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Source badge */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Source:</span>
        {published ? (
          <Badge variant="secondary" className="text-xs">
            database · v{published.version}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
            code fallback
          </Badge>
        )}
        {isDirty && (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
            unsaved changes
          </Badge>
        )}
      </div>

      {/* System Prompt */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          System Prompt
        </Label>
        <Textarea
          ref={systemRef}
          value={systemPrompt ?? ""}
          onChange={(e) => { setSystemPrompt(e.target.value); setIsDirty(true); }}
          onFocus={() => setActiveField("system")}
          className="min-h-[180px] font-mono text-xs resize-y"
          placeholder="System prompt..."
        />
      </div>

      {/* User Prompt */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          User Prompt
        </Label>
        <Textarea
          ref={userRef}
          value={userPrompt ?? ""}
          onChange={(e) => { setUserPrompt(e.target.value); setIsDirty(true); }}
          onFocus={() => setActiveField("user")}
          className="min-h-[100px] font-mono text-xs resize-y"
          placeholder="User prompt..."
        />
      </div>

      {/* Variables */}
      {allowedVars.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Variables — click to insert into focused field
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {allowedVars.map((v) => (
              <button
                key={v}
                type="button"
                title={variableDefs[v]?.description}
                onClick={() => insertVariable(v)}
                className="inline-flex items-center rounded border border-dashed border-border px-2 py-0.5 text-xs font-mono text-primary hover:bg-primary/10 transition-colors"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Upstream agent fields */}
      {upstreamPaths.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            From connected agents — click to insert
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {upstreamPaths.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => insertVariable(p)}
                className="inline-flex items-center rounded border border-dashed border-blue-400/60 px-2 py-0.5 text-xs font-mono text-blue-500 hover:bg-blue-500/10 transition-colors"
              >
                {`{{${p}}}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {isDirty && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setSystemPrompt(published?.systemPrompt ?? "");
              setUserPrompt(published?.userPrompt ?? "");
              setIsDirty(false);
            }}
          >
            Discard
          </Button>
        )}
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={handleSaveAndPublish}
          disabled={isSaving || !isDirty}
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          )}
          Save & Publish
        </Button>
      </div>

      {/* Revision History */}
      {revisions?.revisions && revisions.revisions.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowHistory((h) => !h)}
          >
            <Clock className="h-3.5 w-3.5" />
            Revision history ({revisions.revisions.length})
            {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showHistory && (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
              {revisions.revisions.map((rev) => (
                <div
                  key={rev.id}
                  className="flex items-center justify-between rounded border p-2 text-xs gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge
                      variant={rev.status === "published" ? "default" : rev.status === "archived" ? "outline" : "secondary"}
                      className="text-[10px] shrink-0"
                    >
                      {rev.status}
                    </Badge>
                    <span className="font-mono text-muted-foreground">v{rev.version}</span>
                    <span className="text-muted-foreground truncate">
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {rev.status === "archived" && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline shrink-0"
                      onClick={() => {
                        setSystemPrompt(rev.systemPrompt);
                        setUserPrompt(rev.userPrompt);
                        setIsDirty(true);
                      }}
                    >
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
