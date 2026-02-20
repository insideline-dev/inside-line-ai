import { useState } from "react";
import { ChevronRight, ChevronDown, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useAdminControllerGetAiPromptOutputSchema } from "@/api/generated/admin/admin";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  description?: string;
  anyOf?: JsonSchema[];
  enum?: unknown[];
  required?: string[];
};

function typeLabel(schema: JsonSchema): string {
  if (schema.enum) return "enum";
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  return schema.type ?? "any";
}

function SchemaNode({
  name,
  schema,
  path,
  onPick,
  depth = 0,
}: {
  name: string;
  schema: JsonSchema;
  path: string;
  onPick: (path: string) => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = !!(schema.properties || schema.items || schema.anyOf);
  const type = typeLabel(schema);

  if (!hasChildren) {
    return (
      <button
        type="button"
        onClick={() => onPick(path)}
        className="flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-xs hover:bg-primary/10 group"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="font-mono text-foreground">{name}</span>
        <Badge variant="outline" className="text-[9px] px-1 h-4">{type}</Badge>
        {schema.description && (
          <span className="text-muted-foreground truncate hidden group-hover:inline">
            {schema.description}
          </span>
        )}
        <span className="ml-auto text-[9px] text-primary opacity-0 group-hover:opacity-100">
          insert ↗
        </span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-xs hover:bg-muted/50"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span className="font-mono text-foreground">{name}</span>
        <Badge variant="outline" className="text-[9px] px-1 h-4">{type}</Badge>
        {schema.description && (
          <span className="text-muted-foreground truncate ml-1 text-[10px]">
            {schema.description}
          </span>
        )}
      </button>

      {open && (
        <div>
          {schema.properties &&
            Object.entries(schema.properties).map(([k, v]) => (
              <SchemaNode
                key={k}
                name={k}
                schema={v}
                path={`${path}.${k}`}
                onPick={onPick}
                depth={depth + 1}
              />
            ))}
          {schema.items && (
            <SchemaNode
              name="[item]"
              schema={schema.items}
              path={`${path}[]`}
              onPick={onPick}
              depth={depth + 1}
            />
          )}
          {schema.anyOf?.map((s, i) => (
            <SchemaNode
              key={i}
              name={`variant ${i}`}
              schema={s}
              path={`${path}`}
              onPick={onPick}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SchemaTreeViewProps {
  nodeLabel: string;
  promptKeys: string[];
  onPick: (path: string) => void;
}

function SingleKeySchema({
  promptKey,
  onPick,
  view,
}: {
  promptKey: string;
  onPick: (path: string) => void;
  view: "tree" | "json";
}) {
  const { data, isLoading, isError } = useAdminControllerGetAiPromptOutputSchema(promptKey);
  const schema = (data as unknown as { data: { jsonSchema: JsonSchema } })?.data?.jsonSchema ??
    (data as unknown as { jsonSchema: JsonSchema })?.jsonSchema;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading schema...
      </div>
    );
  }

  if (isError || !schema) {
    return (
      <p className="text-xs text-muted-foreground py-2">No output schema for {promptKey}</p>
    );
  }

  if (view === "json") {
    return (
      <pre className="rounded bg-muted p-2 text-[10px] font-mono overflow-auto max-h-[300px] leading-relaxed">
        {JSON.stringify(schema, null, 2)}
      </pre>
    );
  }

  const topLevel = schema.properties
    ? Object.entries(schema.properties)
    : [];

  return (
    <div className="rounded border bg-card text-xs">
      {topLevel.length > 0 ? (
        topLevel.map(([k, v]) => (
          <SchemaNode
            key={k}
            name={k}
            schema={v as JsonSchema}
            path={k}
            onPick={onPick}
            depth={0}
          />
        ))
      ) : (
        <p className="px-2 py-2 text-muted-foreground">No fields defined.</p>
      )}
    </div>
  );
}

export function SchemaTreeView({ nodeLabel, promptKeys, onPick }: SchemaTreeViewProps) {
  const [view, setView] = useState<"tree" | "json">("tree");
  const [copied, setCopied] = useState<string | null>(null);

  const handlePick = (path: string) => {
    const tag = `{{${path}}}`;
    navigator.clipboard.writeText(tag).then(() => {
      setCopied(path);
      setTimeout(() => setCopied(null), 1500);
      toast.success(`Copied ${tag} — or click to insert in prompt`);
      onPick(path);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">{nodeLabel}</p>
        <div className="flex items-center gap-1 rounded border p-0.5">
          <button
            type="button"
            onClick={() => setView("tree")}
            className={cn(
              "rounded px-2 py-0.5 text-xs transition-colors",
              view === "tree" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Tree
          </button>
          <button
            type="button"
            onClick={() => setView("json")}
            className={cn(
              "rounded px-2 py-0.5 text-xs transition-colors",
              view === "json" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            JSON
          </button>
        </div>
      </div>

      {copied && (
        <div className="flex items-center gap-1.5 rounded bg-primary/10 px-2 py-1 text-xs text-primary">
          <Check className="h-3 w-3" />
          Copied <code className="font-mono">{`{{${copied}}}`}</code>
        </div>
      )}

      {promptKeys.map((key) => (
        <div key={key} className="space-y-1">
          <Badge variant="secondary" className="text-[10px]">{key}</Badge>
          <SingleKeySchema promptKey={key} onPick={handlePick} view={view} />
        </div>
      ))}
    </div>
  );
}
