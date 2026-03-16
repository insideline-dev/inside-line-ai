import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminControllerGetAiPromptRevisions } from "@/api/generated/admin/admin";
import {
  CreateAiPromptRevisionDtoStage,
} from "@/api/generated/model";
import { OutputSchemaViewer } from "./prompt-editor/OutputSchemaViewer";

type Stage = NonNullable<typeof CreateAiPromptRevisionDtoStage[keyof typeof CreateAiPromptRevisionDtoStage]>;

interface NodePromptEditorProps {
  promptKey: string;
  upstreamPaths?: string[];
}

function stageLabel(stage: Stage): string {
  return stage
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolvePublishedForStage(
  revisions:
    | Array<{
        status: string;
        stage: Stage | null;
        systemPrompt: string;
        userPrompt: string;
      }>
    | undefined,
  stage: Stage,
) {
  if (!revisions) return null;

  const stageSpecific = revisions.find(
    (revision) => revision.status === "published" && revision.stage === stage,
  );
  const globalFallback = revisions.find(
    (revision) => revision.status === "published" && revision.stage === null,
  );

  return stageSpecific ?? globalFallback ?? null;
}

export function NodePromptEditor({ promptKey }: NodePromptEditorProps) {
  const STAGE_OPTIONS = Object.values(CreateAiPromptRevisionDtoStage);

  const [selectedStage, setSelectedStage] = useState<Stage>(STAGE_OPTIONS[0]);
  const [promptMode, setPromptMode] = useState<"system" | "user">("system");
  const { data, isLoading } = useAdminControllerGetAiPromptRevisions(promptKey);

  const payload = (data as unknown as {
    revisions: Array<{
      id: string;
      status: string;
      stage: Stage | null;
      systemPrompt: string;
      userPrompt: string;
      version: number;
      notes?: string;
      createdAt: string;
      publishedAt?: string;
    }>;
    allowedVariables: string[];
    requiredVariables: string[];
  }) ?? {
    revisions: [],
    allowedVariables: [],
    requiredVariables: [],
  };

  const published = useMemo(
    () => resolvePublishedForStage(payload.revisions, selectedStage),
    [payload.revisions, selectedStage],
  );
  const activePromptValue =
    promptMode === "system" ? (published?.systemPrompt ?? "") : (published?.userPrompt ?? "");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Prompt Source:</span>
        <Badge variant="secondary" className="text-xs">
          local files
        </Badge>
        <Badge variant="outline" className="text-xs">
          selected: {stageLabel(selectedStage)}
        </Badge>
        {published?.stage !== selectedStage ? (
          <Badge variant="outline" className="text-xs">
            effective: {published?.stage ? stageLabel(published.stage) : "Global fallback"}
          </Badge>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Stage Preview
        </Label>
        <Select
          value={selectedStage}
          onValueChange={(value) =>
            setSelectedStage(value as Stage)
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAGE_OPTIONS.map((stageOption) => (
              <SelectItem key={stageOption} value={stageOption} className="text-xs">
                {stageLabel(stageOption)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Prompt Preview
          </Label>
          <Tabs
            value={promptMode}
            onValueChange={(value) => setPromptMode(value as "system" | "user")}
            className="w-auto"
          >
            <TabsList className="h-8">
              <TabsTrigger value="system" className="text-xs">
                System Prompt
              </TabsTrigger>
              <TabsTrigger value="user" className="text-xs">
                User Prompt
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Textarea
          value={activePromptValue}
          readOnly
          className="min-h-[220px] font-mono text-xs resize-y bg-muted/20"
        />
      </div>

      <div className="space-y-2 rounded-md border border-border/70 p-3">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Variables
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {payload.requiredVariables.map((variable) => (
            <Badge key={`required-${variable}`} className="text-[10px] font-mono">
              {`{{${variable}}}`}
            </Badge>
          ))}
          {payload.allowedVariables
            .filter((variable) => !payload.requiredVariables.includes(variable))
            .map((variable) => (
              <Badge key={`allowed-${variable}`} variant="outline" className="text-[10px] font-mono">
                {`{{${variable}}}`}
              </Badge>
            ))}
          {payload.allowedVariables.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">No template variables configured.</span>
          ) : null}
        </div>
      </div>

      <Separator />

      <OutputSchemaViewer nodeId={promptKey.replace(/\./g, "_")} />
    </div>
  );
}
