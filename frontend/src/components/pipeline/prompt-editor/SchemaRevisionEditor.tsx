import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminControllerGetAiSchemaRevisionsAliasQueryKey,
  useAdminControllerCreateAiSchemaRevisionAlias,
  useAdminControllerGetAiPromptOutputSchema,
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

type DescriptorField = {
  type?: string;
  description?: string;
  items?: DescriptorField;
  fields?: Record<string, DescriptorField>;
};

type DescriptorRoot = {
  type?: string;
  fields?: Record<string, DescriptorField>;
};

function isSchemaJsonPayload(value: unknown): value is { type: "object"; fields: Record<string, unknown> } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; fields?: unknown };
  return candidate.type === "object" && Boolean(candidate.fields) && typeof candidate.fields === "object";
}

type JsonSchemaNode = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
};

function normalizeType(type: string | string[] | undefined): string | undefined {
  if (Array.isArray(type)) {
    return type.find((item) => item !== "null") ?? type[0];
  }
  return type;
}

function jsonSchemaToDescriptor(node: JsonSchemaNode | undefined): { type: "object"; fields: Record<string, unknown> } {
  if (!node || typeof node !== "object") {
    return { type: "object", fields: {} };
  }

  const convertNode = (value: JsonSchemaNode): Record<string, unknown> => {
    const type = normalizeType(value.type);

    if (type === "object" || value.properties) {
      const fields = Object.fromEntries(
        Object.entries(value.properties ?? {}).map(([key, child]) => [key, convertNode(child)]),
      );
      return { type: "object", fields };
    }

    if (type === "array" || value.items) {
      return {
        type: "array",
        items: convertNode(value.items ?? {}),
      };
    }

    if (type === "integer") {
      return { type: "number" };
    }

    if (type === "string" || type === "number" || type === "boolean") {
      return { type };
    }

    return { type: "string" };
  };

  const converted = convertNode(node);
  if (converted.type === "object" && converted.fields && typeof converted.fields === "object") {
    return converted as { type: "object"; fields: Record<string, unknown> };
  }

  return { type: "object", fields: {} };
}

function collectMissingDescriptions(
  fields: Record<string, DescriptorField> | undefined,
  prefix = "",
): string[] {
  if (!fields) return [];

  const missing: string[] = [];
  for (const [key, field] of Object.entries(fields)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!field.description || field.description.trim().length === 0) {
      missing.push(path);
    }

    if (field.type === "object") {
      missing.push(...collectMissingDescriptions(field.fields, path));
      continue;
    }

    if (field.type === "array" && field.items) {
      if (!field.items.description || field.items.description.trim().length === 0) {
        missing.push(`${path}[]`);
      }
      if (field.items.type === "object") {
        missing.push(...collectMissingDescriptions(field.items.fields, `${path}[]`));
      }
    }
  }

  return missing;
}

function withDescriptionScaffold(root: DescriptorRoot): DescriptorRoot {
  const patchField = (field: DescriptorField): DescriptorField => {
    const next: DescriptorField = {
      ...field,
      description: field.description && field.description.trim().length > 0
        ? field.description
        : "",
    };

    if (next.type === "object" && next.fields) {
      next.fields = Object.fromEntries(
        Object.entries(next.fields).map(([key, child]) => [key, patchField(child)]),
      );
    }

    if (next.type === "array" && next.items) {
      next.items = patchField(next.items);
    }

    return next;
  };

  return {
    ...root,
    fields: Object.fromEntries(
      Object.entries(root.fields ?? {}).map(([key, field]) => [key, patchField(field)]),
    ),
  };
}

export function SchemaRevisionEditor({ promptKey }: SchemaRevisionEditorProps) {
  const queryClient = useQueryClient();
  const [schemaText, setSchemaText] = useState("");
  const [notes, setNotes] = useState("");
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);

  const { data, isLoading } = useAdminControllerGetAiSchemaRevisionsAlias(promptKey);
  const { data: runtimeSchemaData, isLoading: isRuntimeSchemaLoading } =
    useAdminControllerGetAiPromptOutputSchema(promptKey);

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

  const runtimeMirror = useMemo(() => {
    const payload = runtimeSchemaData as
      | {
          data?: {
            schemaJson?: unknown;
            jsonSchema?: unknown;
            source?: string;
            note?: string;
          };
          schemaJson?: unknown;
          jsonSchema?: unknown;
          source?: string;
          note?: string;
        }
      | undefined;

    const schemaJson = payload?.data?.schemaJson ?? payload?.schemaJson;
    const jsonSchema = payload?.data?.jsonSchema ?? payload?.jsonSchema;
    const source = payload?.data?.source ?? payload?.source;
    const note = payload?.data?.note ?? payload?.note;

    if (isSchemaJsonPayload(schemaJson)) {
      return {
        descriptor: schemaJson,
        source: source ?? "published",
        note,
      };
    }

    return {
      descriptor: jsonSchemaToDescriptor(jsonSchema as JsonSchemaNode | undefined),
      source: source ?? "code",
      note,
    };
  }, [runtimeSchemaData]);

  const missingDescriptionPaths = useMemo(() => {
    try {
      const parsed = JSON.parse(schemaText) as DescriptorRoot;
      if (parsed?.type !== "object") {
        return [];
      }

      return collectMissingDescriptions(parsed.fields);
    } catch {
      return [];
    }
  }, [schemaText]);

  useEffect(() => {
    if (schemaText.length > 0) return;

    const base = draft ?? published;
    if (!base) return;
    setSchemaText(JSON.stringify(base.schemaJson, null, 2));
    setNotes(base.notes ?? "");
    setLoadedDraftId(draft?.id ?? null);
  }, [schemaText, draft, published]);

  useEffect(() => {
    if (schemaText.length > 0) return;
    if (draft || published) return;
    setSchemaText(JSON.stringify(runtimeMirror.descriptor, null, 2));
  }, [schemaText, draft, published, runtimeMirror]);

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

  const insertDescriptionScaffold = () => {
    try {
      const parsed = JSON.parse(schemaText) as DescriptorRoot;
      if (!parsed || parsed.type !== "object") {
        toast.error("Schema JSON must be an object schema before scaffolding descriptions");
        return;
      }

      const scaffolded = withDescriptionScaffold(parsed);
      setSchemaText(JSON.stringify(scaffolded, null, 2));
      toast.success("Inserted description scaffold for missing fields");
    } catch {
      toast.error("Fix JSON syntax before scaffolding descriptions");
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Runtime Mirror (Read-Only)
        </Label>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {runtimeMirror.source === "published" ? "runtime: published" : "runtime: code fallback"}
          </Badge>
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
            value={JSON.stringify(runtimeMirror.descriptor, null, 2)}
            readOnly
            className="min-h-[120px] resize-y font-mono text-xs bg-muted/30"
          />
          {runtimeMirror.note ? (
            <p className="text-[11px] text-muted-foreground">{runtimeMirror.note}</p>
          ) : null}

          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-1 block">
            Editable Draft Schema
          </Label>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Descriptions are recommended to give the model clear output intent.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={insertDescriptionScaffold}
            >
              Insert Description Scaffold
            </Button>
          </div>
          {missingDescriptionPaths.length > 0 ? (
            <p className="text-[11px] text-amber-600">
              Recommended: add descriptions for {missingDescriptionPaths.length} field
              {missingDescriptionPaths.length === 1 ? "" : "s"}.
            </p>
          ) : null}
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
              disabled={createMutation.isPending || updateMutation.isPending || isRuntimeSchemaLoading}
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
