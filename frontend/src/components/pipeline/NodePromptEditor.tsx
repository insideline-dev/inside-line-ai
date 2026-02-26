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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAdminControllerGetAiPromptRevisions,
  useAdminControllerCreateAiPromptRevision,
  useAdminControllerPublishAiPromptRevision,
  getAdminControllerGetAiPromptRevisionsQueryKey,
} from "@/api/generated/admin/admin";
import {
  CreateAiPromptRevisionDtoStage,
  type CreateAiPromptRevisionDtoStage as PromptStage,
} from "@/api/generated/model";
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
  const GLOBAL_STAGE = "global" as const;
  const STAGE_OPTIONS = [
    GLOBAL_STAGE,
    ...Object.values(CreateAiPromptRevisionDtoStage),
  ] as const;

  const stageLabel = (stage: PromptStage | null) => {
    if (!stage) return "Global";
    return stage
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const queryClient = useQueryClient();
  const systemRef = useRef<HTMLTextAreaElement>(null);
  const userRef = useRef<HTMLTextAreaElement>(null);
  const [activeField, setActiveField] = useState<"system" | "user">("system");
  const [showHistory, setShowHistory] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [variablePickerOpen, setVariablePickerOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<PromptStage | null>(null);
  const [showAllStages, setShowAllStages] = useState(false);

  const { data, isLoading } = useAdminControllerGetAiPromptRevisions(promptKey);

  const revisions = (data as unknown as {
    revisions: Array<{ id: string; status: string; stage: PromptStage | null; systemPrompt: string; userPrompt: string; version: number; notes?: string; createdAt: string; publishedAt?: string }>;
    definition: { key: string; displayName: string; description: string };
    allowedVariables: string[];
    requiredVariables: string[];
    variableDefinitions: Record<string, { description: string; source: string }>;
  }) ?? null;

  const resolvePublishedForStage = (
    revisionList: Array<{ status: string; stage: PromptStage | null; systemPrompt: string; userPrompt: string; version: number }> | undefined,
    stage: PromptStage | null,
  ) => {
    if (!revisionList) return null;

    const stageSpecific =
      stage === null
        ? null
        : revisionList.find(
            (revision) => revision.status === "published" && revision.stage === stage,
          );
    const globalPublished = revisionList.find(
      (revision) => revision.status === "published" && revision.stage === null,
    );

    return stageSpecific ?? globalPublished ?? null;
  };

  const publishedForStage = useMemo(() => {
    return resolvePublishedForStage(revisions?.revisions, selectedStage);
  }, [revisions?.revisions, selectedStage]);

  const stageScopedRevisions = useMemo(() => {
    if (!revisions?.revisions) return [];

    if (selectedStage === null) {
      return revisions.revisions.filter((revision) => revision.stage === null);
    }

    return revisions.revisions.filter(
      (revision) => revision.stage === selectedStage || revision.stage === null,
    );
  }, [revisions?.revisions, selectedStage]);

  const visibleRevisions = showAllStages
    ? (revisions?.revisions ?? [])
    : stageScopedRevisions;

  useEffect(() => {
    setSystemPrompt(null);
    setUserPrompt(null);
    setIsDirty(false);
    setSelectedStage(null);
    setShowAllStages(false);
  }, [promptKey]);

  useEffect(() => {
    if (!data || systemPrompt !== null) return;
    setSystemPrompt(publishedForStage?.systemPrompt ?? "");
    setUserPrompt(publishedForStage?.userPrompt ?? "");
  }, [data, publishedForStage, systemPrompt]);
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

    const upstreamOptions = upstreamPaths.flatMap((path) => {
      const nodeId = path.split(".")[0] ?? "Upstream";
      const isWholeObject = !path.includes(".");
      const baseOption: VariablePickerOption = {
        value: path,
        label: `{{${path}}}`,
        group: `Upstream: ${nodeId}`,
        description: isWholeObject
          ? "Whole object (compact JSON)"
          : undefined,
      };

      const prettyOption: VariablePickerOption = {
        value: `${path}|pretty`,
        label: `{{${path}|pretty}}`,
        group: `Upstream: ${nodeId}`,
        description: isWholeObject
          ? "Whole object (pretty JSON)"
          : "Pretty JSON",
      };

      return [baseOption, prettyOption];
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
        data: { systemPrompt, userPrompt, stage: selectedStage },
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
        {publishedForStage ? (
          <Badge variant="secondary" className="text-xs">
            database · v{publishedForStage.version}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
            code fallback
          </Badge>
        )}
        <Badge variant="outline" className="text-xs">
          stage: {stageLabel(selectedStage)}
        </Badge>
        {isDirty && (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
            unsaved changes
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Prompt Stage
        </Label>
        <Select
          value={selectedStage ?? GLOBAL_STAGE}
          onValueChange={(value) => {
            const nextStage = value === GLOBAL_STAGE ? null : (value as PromptStage);
            setSelectedStage(nextStage);
            const nextPublished = resolvePublishedForStage(revisions?.revisions, nextStage);
            setSystemPrompt(nextPublished?.systemPrompt ?? "");
            setUserPrompt(nextPublished?.userPrompt ?? "");
            setIsDirty(false);
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAGE_OPTIONS.map((stageOption) => (
              <SelectItem key={stageOption} value={stageOption} className="text-xs">
                {stageOption === GLOBAL_STAGE ? "Global" : stageLabel(stageOption)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              setSystemPrompt(publishedForStage?.systemPrompt ?? "");
              setUserPrompt(publishedForStage?.userPrompt ?? "");
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
            Revision history ({visibleRevisions.length})
            {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showHistory && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  Viewing {showAllStages ? "all stages" : `${stageLabel(selectedStage)} + Global fallback`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setShowAllStages((value) => !value)}
                >
                  {showAllStages ? "Show stage scope" : "Show all stages"}
                </Button>
              </div>
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
              {visibleRevisions.map((rev) => (
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
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {stageLabel(rev.stage)}
                    </Badge>
                    <span className="text-muted-foreground truncate">
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline shrink-0"
                    onClick={() => {
                      setSystemPrompt(rev.systemPrompt);
                      setUserPrompt(rev.userPrompt);
                      setIsDirty(true);
                    }}
                  >
                    Load
                  </button>
                </div>
              ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
