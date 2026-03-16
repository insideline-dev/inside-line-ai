import { memo, useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ChevronRight, ChevronDown } from "lucide-react";
import { outputSchemaMap, type SchemaField } from "./output-schema-data";

const TYPE_COLORS: Record<SchemaField["type"], string> = {
  string: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  number: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  boolean: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  object: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
  array: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  enum: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
};

function TypeBadge({ type }: { type: SchemaField["type"] }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${TYPE_COLORS[type]}`}>
      {type}
    </span>
  );
}

function FieldRow({
  name,
  field,
  depth,
}: {
  name: string;
  field: SchemaField;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const isExpandable =
    (field.type === "object" && field.fields) ||
    (field.type === "array" && field.items);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const arrayItemType = field.type === "array" && field.items ? field.items.type : null;
  const nestedFields =
    field.type === "object"
      ? field.fields
      : field.type === "array" && field.items?.type === "object"
        ? field.items.fields
        : null;

  return (
    <div>
      <button
        type="button"
        onClick={isExpandable ? toggle : undefined}
        className={`flex w-full items-center gap-1.5 py-0.5 text-left ${isExpandable ? "cursor-pointer hover:bg-muted/50" : "cursor-default"}`}
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {isExpandable ? (
          open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="inline-block w-3 shrink-0" />
        )}
        <span className="font-mono text-xs">{name}</span>
        <TypeBadge type={field.type} />
        {arrayItemType && <TypeBadge type={arrayItemType} />}
        {field.nullable && (
          <span className="text-[10px] text-muted-foreground">(nullable)</span>
        )}
        {field.description && (
          <span className="text-[10px] text-muted-foreground">{field.description}</span>
        )}
        {field.type === "enum" && field.enumValues && (
          <span className="truncate text-[10px] text-muted-foreground">
            {field.enumValues.join(" | ")}
          </span>
        )}
        {field.type === "array" && field.items?.type === "enum" && field.items.enumValues && (
          <span className="truncate text-[10px] text-muted-foreground">
            {field.items.enumValues.join(" | ")}
          </span>
        )}
      </button>
      {open && nestedFields && (
        <FieldTree fields={nestedFields} depth={depth + 1} />
      )}
    </div>
  );
}

const FieldTree = memo(function FieldTree({
  fields,
  depth,
}: {
  fields: Record<string, SchemaField>;
  depth: number;
}) {
  return (
    <div>
      {Object.entries(fields).map(([name, field]) => (
        <FieldRow key={name} name={name} field={field} depth={depth} />
      ))}
    </div>
  );
});

export function OutputSchemaViewer({ nodeId }: { nodeId: string }) {
  const schema = outputSchemaMap[nodeId];

  if (!schema) {
    return (
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        No output schema defined for this node.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Output Schema
        </Label>
        <Badge variant="outline" className="text-[10px]">
          {Object.keys(schema.fields).length} fields
        </Badge>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <FieldTree fields={schema.fields} depth={0} />
      </div>
    </div>
  );
}
