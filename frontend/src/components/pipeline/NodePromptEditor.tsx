import { useState, useRef, useEffect, useMemo } from "react";
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
import {
  VariablePicker,
  type VariablePickerOption,
} from "./prompt-editor/VariablePicker";
import { SchemaRevisionEditor } from "./prompt-editor/SchemaRevisionEditor";

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
  const [variablePickerOpen, setVariablePickerOpen] = useState(false);

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

  const extractTokens = (value: string | null) => {
    if (!value) return [];
    const tokens = Array.from(value.matchAll(/{{\s*([^{}\s]+)\s*}}/g)).map((match) => match[1]);
    return Array.from(new Set(tokens));
  };

  const variableOptions = useMemo<VariablePickerOption[]>(() => {
    const promptOptions = allowedVars.map((variableName) => ({
      value: variableName,
      label: `{{${variableName}}}`,
      group: "Prompt Variables",
      description: variableDefs[variableName]?.description,
    }));

    const upstreamOptions = upstreamPaths.map((path) => {
      const nodeId = path.split(".")[0] ?? "Upstream";
      return {
        value: path,
        label: `{{${path}}}`,
        group: `Upstream: ${nodeId}`,
      };
    });

    return [...promptOptions, ...upstreamOptions];
  }, [allowedVars, upstreamPaths, variableDefs]);

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

  const maybeOpenPickerFromTyping = (
    nextValue: string,
    cursorPosition: number | null,
  ) => {
    if (cursorPosition === null) return;
    if (cursorPosition < 2) return;
    if (nextValue.slice(cursorPosition - 2, cursorPosition) === "{{") {
      setVariablePickerOpen(true);
    }
  };

  const insertVariable = (token: string) => {
    const tag = `{{${token}}}`;
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
  const systemTokens = extractTokens(systemPrompt);
  const userTokens = extractTokens(userPrompt);

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
          onChange={(e) => {
            setSystemPrompt(e.target.value);
            setIsDirty(true);
            maybeOpenPickerFromTyping(e.target.value, e.target.selectionStart);
          }}
          onFocus={() => setActiveField("system")}
          className="min-h-[180px] font-mono text-xs resize-y"
          placeholder="System prompt..."
        />
        {systemTokens.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 rounded-md border border-border/60 bg-muted/30 p-2">
            {systemTokens.map((token) => (
              <Badge key={`system-${token}`} variant="outline" className="font-mono text-[10px]">
                {`{{${token}}}`}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      {/* User Prompt */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          User Prompt
        </Label>
        <Textarea
          ref={userRef}
          value={userPrompt ?? ""}
          onChange={(e) => {
            setUserPrompt(e.target.value);
            setIsDirty(true);
            maybeOpenPickerFromTyping(e.target.value, e.target.selectionStart);
          }}
          onFocus={() => setActiveField("user")}
          className="min-h-[100px] font-mono text-xs resize-y"
          placeholder="User prompt..."
        />
        {userTokens.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 rounded-md border border-border/60 bg-muted/30 p-2">
            {userTokens.map((token) => (
              <Badge key={`user-${token}`} variant="outline" className="font-mono text-[10px]">
                {`{{${token}}}`}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      {/* Variable Picker */}
      {variableOptions.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Variables
            </Label>
            <VariablePicker
              open={variablePickerOpen}
              onOpenChange={setVariablePickerOpen}
              options={variableOptions}
              onSelect={insertVariable}
            />
          </div>
          <div className="text-[11px] text-muted-foreground">
            Type <span className="font-mono">{"{{"}</span> in either prompt to open picker.
          </div>
        </div>
      )}

      <Separator />

      <SchemaRevisionEditor promptKey={promptKey} />

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
