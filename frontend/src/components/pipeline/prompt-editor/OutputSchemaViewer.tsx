import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useAdminControllerGetAiPromptOutputSchema } from "@/api/generated/admin/admin";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  description?: string;
  anyOf?: JsonSchema[];
  enum?: unknown[];
};

function typeLabel(schema: JsonSchema): string {
  if (schema.enum) return "enum";
  if (Array.isArray(schema.type)) {
    return schema.type.filter((value) => value !== "null").join(" | ") || schema.type.join(" | ");
  }
  if (schema.type) return schema.type;
  if (schema.properties) return "object";
  if (schema.items) return "array";
  return "any";
}

function SchemaFieldNode({
  name,
  schema,
  depth = 0,
}: {
  name: string;
  schema: JsonSchema;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth < 1);
  const type = typeLabel(schema);
  const hasChildren = Boolean(schema.properties || schema.items || schema.anyOf);

  if (!hasChildren) {
    return (
      <div
        className="flex items-start gap-1.5 rounded px-2 py-1 text-xs"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="font-mono text-foreground">{name}</span>
        <Badge variant="outline" className="h-4 px-1 text-[9px]">
          {type}
        </Badge>
        {schema.description ? (
          <span className="ml-1 truncate text-[10px] text-muted-foreground">{schema.description}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-muted/50"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono text-foreground">{name}</span>
        <Badge variant="outline" className="h-4 px-1 text-[9px]">
          {type}
        </Badge>
        {schema.description ? (
          <span className="ml-1 truncate text-[10px] text-muted-foreground">{schema.description}</span>
        ) : null}
      </button>

      {open ? (
        <div>
          {schema.properties
            ? Object.entries(schema.properties).map(([fieldName, fieldSchema]) => (
                <SchemaFieldNode
                  key={fieldName}
                  name={fieldName}
                  schema={fieldSchema}
                  depth={depth + 1}
                />
              ))
            : null}
          {schema.items ? (
            <SchemaFieldNode name="[item]" schema={schema.items} depth={depth + 1} />
          ) : null}
          {schema.anyOf?.map((variantSchema, index) => (
            <SchemaFieldNode
              key={`variant-${index}`}
              name={`variant ${index + 1}`}
              schema={variantSchema}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OutputSchemaViewer({ promptKey }: { promptKey: string }) {
  const { data, isLoading, isError } = useAdminControllerGetAiPromptOutputSchema(promptKey);

  const schema =
    (data as { data?: { jsonSchema?: JsonSchema }; jsonSchema?: JsonSchema } | undefined)?.data
      ?.jsonSchema ??
    (data as { data?: { jsonSchema?: JsonSchema }; jsonSchema?: JsonSchema } | undefined)
      ?.jsonSchema;

  const topLevelFields = schema?.properties ? Object.entries(schema.properties) : [];

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Output Structure
        </Label>
        <Badge variant="outline" className="text-[10px]">
          Source: code
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading output schema...
        </div>
      ) : null}

      {isError ? (
        <p className="text-xs text-muted-foreground">Unable to load output schema.</p>
      ) : null}

      {!isLoading && !isError ? (
        <div className="rounded border bg-card text-xs">
          {topLevelFields.length > 0 ? (
            topLevelFields.map(([fieldName, fieldSchema]) => (
              <SchemaFieldNode
                key={fieldName}
                name={fieldName}
                schema={fieldSchema as JsonSchema}
                depth={0}
              />
            ))
          ) : (
            <p className="px-2 py-2 text-muted-foreground">No fields defined.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
