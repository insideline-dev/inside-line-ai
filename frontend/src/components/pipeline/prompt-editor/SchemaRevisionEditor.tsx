import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminControllerGetAiSchemaRevisionsAliasQueryKey,
  useAdminControllerCreateAiSchemaRevisionAlias,
  useAdminControllerGetAiSchemaRevisionsAlias,
  useAdminControllerPublishAiSchemaRevisionAlias,
  useAdminControllerUpdateAiSchemaRevisionAlias,
} from "@/api/generated/admin/admin";
import type {
  CreateAiSchemaRevisionDto,
  UpdateAiSchemaRevisionDto,
} from "@/api/generated/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SchemaRevisionItem = {
  id: string;
  status: "draft" | "published" | "archived";
  version: number;
  schemaJson: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
};

interface SchemaRevisionEditorProps {
  promptKey: string;
}

function isSchemaJsonPayload(value: unknown): value is { type: "object"; fields: Record<string, unknown> } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; fields?: unknown };
  return candidate.type === "object" && Boolean(candidate.fields) && typeof candidate.fields === "object";
}

export function SchemaRevisionEditor({ promptKey }: SchemaRevisionEditorProps) {
  const queryClient = useQueryClient();
  const [schemaText, setSchemaText] = useState("");
  const [notes, setNotes] = useState("");
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);

  const { data, isLoading } = useAdminControllerGetAiSchemaRevisionsAlias(promptKey);

  const revisions = useMemo(() => {
    const payload = data as
      | {
          data?: { revisions?: SchemaRevisionItem[] };
          revisions?: SchemaRevisionItem[];
        }
      | undefined;
    return payload?.data?.revisions ?? payload?.revisions ?? [];
  }, [data]);

  const published = useMemo(
    () => revisions.find((revision) => revision.status === "published") ?? null,
    [revisions],
  );

  const draft = useMemo(
    () => revisions.find((revision) => revision.status === "draft") ?? null,
    [revisions],
  );

  useEffect(() => {
    if (schemaText.length > 0) return;

    const base = draft ?? published;
    if (!base) return;
    setSchemaText(JSON.stringify(base.schemaJson, null, 2));
    setNotes(base.notes ?? "");
    setLoadedDraftId(draft?.id ?? null);
  }, [schemaText, draft, published]);

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: getAdminControllerGetAiSchemaRevisionsAliasQueryKey(promptKey),
    });
  };

  const createMutation = useAdminControllerCreateAiSchemaRevisionAlias({
    mutation: {
      onSuccess: (result) => {
        const payload = result as { data?: { id?: string }; id?: string };
        setLoadedDraftId(payload?.data?.id ?? payload?.id ?? null);
        toast.success("Schema draft saved");
        refresh();
      },
      onError: (error) => toast.error((error as Error).message || "Failed to save schema"),
    },
  });

  const updateMutation = useAdminControllerUpdateAiSchemaRevisionAlias({
    mutation: {
      onSuccess: () => {
        toast.success("Schema draft updated");
        refresh();
      },
      onError: (error) => toast.error((error as Error).message || "Failed to update schema"),
    },
  });

  const publishMutation = useAdminControllerPublishAiSchemaRevisionAlias({
    mutation: {
      onSuccess: () => {
        toast.success("Schema published");
        refresh();
      },
      onError: (error) => toast.error((error as Error).message || "Failed to publish schema"),
    },
  });

  const saveDraft = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(schemaText) as unknown;
    } catch {
      toast.error("Schema JSON is invalid");
      return;
    }

    if (!isSchemaJsonPayload(parsed)) {
      toast.error("Schema JSON must be an object with { type: 'object', fields: {...} }");
      return;
    }

    const currentDraftId = loadedDraftId ?? draft?.id ?? null;
    const payload: Pick<CreateAiSchemaRevisionDto, "schemaJson" | "notes"> &
      Pick<UpdateAiSchemaRevisionDto, "schemaJson" | "notes"> = {
      schemaJson: parsed as CreateAiSchemaRevisionDto["schemaJson"],
      notes: notes.trim() || undefined,
    };

    if (currentDraftId) {
      updateMutation.mutate({
        promptKey,
        revisionId: currentDraftId,
        data: payload,
      });
      return;
    }

    createMutation.mutate({ promptKey, data: payload });
  };

  const publishDraft = () => {
    const currentDraftId = loadedDraftId ?? draft?.id ?? null;
    if (!currentDraftId) {
      toast.error("Create a draft before publishing");
      return;
    }

    publishMutation.mutate({ promptKey, revisionId: currentDraftId });
  };

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Output Schema
        </Label>
        <div className="flex items-center gap-1.5">
          {published ? (
            <Badge variant="secondary" className="text-[10px]">
              published v{published.version}
            </Badge>
          ) : null}
          {draft ? (
            <Badge variant="outline" className="text-[10px]">
              draft v{draft.version}
            </Badge>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading schema revisions...</p>
      ) : (
        <>
          <Textarea
            value={schemaText}
            onChange={(event) => setSchemaText(event.target.value)}
            className="min-h-[170px] resize-y font-mono text-xs"
            placeholder='{"type":"object","fields":{}}'
          />
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="min-h-[56px] resize-y text-xs"
            placeholder="Schema change notes"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={saveDraft}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              Save Schema Draft
            </Button>
            <Button
              size="sm"
              onClick={publishDraft}
              disabled={publishMutation.isPending}
            >
              Publish Schema
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
