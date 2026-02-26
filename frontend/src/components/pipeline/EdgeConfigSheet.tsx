import type { Edge } from "@xyflow/react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { FlowEdgeMapping } from "./flow-edges";

interface EdgeConfigSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edge: Edge | null;
  sourceLabel?: string;
  targetLabel?: string;
  canEdit: boolean;
  onChange: (updater: (edge: Edge) => Edge) => void;
  onDelete: () => void;
}

function asDataRecord(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  return data as Record<string, unknown>;
}

function readMapping(data: Record<string, unknown>): FlowEdgeMapping | undefined {
  const mapping = data.mapping;
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return undefined;
  }
  return mapping as FlowEdgeMapping;
}

function readEdgeEnabled(edge: Edge | null): boolean {
  if (!edge) return true;
  const data = asDataRecord(edge.data);
  if (typeof data.enabled === "boolean") {
    return data.enabled;
  }
  return true;
}

export function EdgeConfigSheet({
  open,
  onOpenChange,
  edge,
  sourceLabel,
  targetLabel,
  canEdit,
  onChange,
  onDelete,
}: EdgeConfigSheetProps) {
  const data = asDataRecord(edge?.data);
  const mapping = readMapping(data);
  const mappingMode = mapping?.mode ?? "full_output";
  const mergeStrategy = mapping?.mergeStrategy ?? "object";
  const fieldMap = mapping?.fieldMap ?? [];
  const enabled = readEdgeEnabled(edge);

  const updateEdge = (updater: (edge: Edge) => Edge) => {
    if (!edge || !canEdit) return;
    onChange(updater);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[560px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-lg">Edge Mapping</SheetTitle>
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={onDelete}
                disabled={!edge}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete Edge
              </Button>
            ) : null}
          </div>
          <SheetDescription>
            Configure how source output fields flow into the target node.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Connection</div>
              <Badge variant="outline" className="text-xs">
                {edge?.id ?? "No edge selected"}
              </Badge>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              <div>From: {sourceLabel ?? edge?.source ?? "—"}</div>
              <div>To: {targetLabel ?? edge?.target ?? "—"}</div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edge-label">Edge Label</Label>
              <Input
                id="edge-label"
                value={typeof edge?.label === "string" ? edge.label : ""}
                placeholder="Optional label"
                onChange={(event) =>
                  updateEdge((current) => ({
                    ...current,
                    label: event.target.value.trim().length
                      ? event.target.value
                      : undefined,
                  }))
                }
                disabled={!canEdit || !edge}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="edge-enabled">Enable Edge</Label>
                <p className="text-xs text-muted-foreground">
                  Disabled edges are ignored at runtime.
                </p>
              </div>
              <Switch
                id="edge-enabled"
                checked={enabled}
                onCheckedChange={(checked) =>
                  updateEdge((current) => {
                    const currentData = asDataRecord(current.data);
                    return {
                      ...current,
                      data: {
                        ...currentData,
                        enabled: checked,
                      },
                    };
                  })
                }
                disabled={!canEdit || !edge}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-md border p-3">
            <div className="space-y-1">
              <Label>Mapping Mode</Label>
              <p className="text-xs text-muted-foreground">
                `full_output` passes full source payload. `field_map` maps selected fields.
              </p>
            </div>
            <Select
              value={mappingMode}
              onValueChange={(value) =>
                updateEdge((current) => {
                  const currentData = asDataRecord(current.data);
                  const currentMapping = readMapping(currentData) ?? {};
                  return {
                    ...current,
                    data: {
                      ...currentData,
                      mapping: {
                        ...currentMapping,
                        mode: value as "full_output" | "field_map",
                      },
                    },
                  };
                })
              }
              disabled={!canEdit || !edge}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full_output">full_output</SelectItem>
                <SelectItem value="field_map">field_map</SelectItem>
              </SelectContent>
            </Select>

            <div className="space-y-1">
              <Label>Merge Strategy</Label>
              <Select
                value={mergeStrategy}
                onValueChange={(value) =>
                  updateEdge((current) => {
                    const currentData = asDataRecord(current.data);
                    const currentMapping = readMapping(currentData) ?? {};
                    return {
                      ...current,
                      data: {
                        ...currentData,
                        mapping: {
                          ...currentMapping,
                          mergeStrategy: value as "object" | "array",
                        },
                      },
                    };
                  })
                }
                disabled={!canEdit || !edge}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select merge strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="object">object</SelectItem>
                  <SelectItem value="array">array</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mappingMode === "field_map" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Field Mappings</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateEdge((current) => {
                        const currentData = asDataRecord(current.data);
                        const currentMapping = readMapping(currentData) ?? {};
                        const nextFieldMap = [
                          ...(currentMapping.fieldMap ?? []),
                          { fromPath: "", toKey: "", required: false },
                        ];
                        return {
                          ...current,
                          data: {
                            ...currentData,
                            mapping: {
                              ...currentMapping,
                              mode: "field_map",
                              fieldMap: nextFieldMap,
                            },
                          },
                        };
                      })
                    }
                    disabled={!canEdit || !edge}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>

                {fieldMap.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No fields mapped yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {fieldMap.map((entry, index) => (
                      <div key={`${entry.fromPath}-${entry.toKey}-${index}`} className="rounded-md border p-3">
                        <div className="grid gap-3">
                          <div className="grid gap-1.5">
                            <Label htmlFor={`from-path-${index}`}>From Path</Label>
                            <Input
                              id={`from-path-${index}`}
                              value={entry.fromPath}
                              placeholder="marketSize.tam"
                              onChange={(event) =>
                                updateEdge((current) => {
                                  const currentData = asDataRecord(current.data);
                                  const currentMapping = readMapping(currentData) ?? {};
                                  const nextFieldMap = [...(currentMapping.fieldMap ?? [])];
                                  if (!nextFieldMap[index]) return current;
                                  nextFieldMap[index] = {
                                    ...nextFieldMap[index],
                                    fromPath: event.target.value,
                                  };
                                  return {
                                    ...current,
                                    data: {
                                      ...currentData,
                                      mapping: {
                                        ...currentMapping,
                                        mode: "field_map",
                                        fieldMap: nextFieldMap,
                                      },
                                    },
                                  };
                                })
                              }
                              disabled={!canEdit || !edge}
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor={`to-key-${index}`}>To Key</Label>
                            <Input
                              id={`to-key-${index}`}
                              value={entry.toKey}
                              placeholder="marketSizing.tam"
                              onChange={(event) =>
                                updateEdge((current) => {
                                  const currentData = asDataRecord(current.data);
                                  const currentMapping = readMapping(currentData) ?? {};
                                  const nextFieldMap = [...(currentMapping.fieldMap ?? [])];
                                  if (!nextFieldMap[index]) return current;
                                  nextFieldMap[index] = {
                                    ...nextFieldMap[index],
                                    toKey: event.target.value,
                                  };
                                  return {
                                    ...current,
                                    data: {
                                      ...currentData,
                                      mapping: {
                                        ...currentMapping,
                                        mode: "field_map",
                                        fieldMap: nextFieldMap,
                                      },
                                    },
                                  };
                                })
                              }
                              disabled={!canEdit || !edge}
                            />
                          </div>
                          <div className="flex items-center justify-between rounded-md border px-3 py-2">
                            <Label htmlFor={`required-${index}`}>Required</Label>
                            <Switch
                              id={`required-${index}`}
                              checked={entry.required === true}
                              onCheckedChange={(checked) =>
                                updateEdge((current) => {
                                  const currentData = asDataRecord(current.data);
                                  const currentMapping = readMapping(currentData) ?? {};
                                  const nextFieldMap = [...(currentMapping.fieldMap ?? [])];
                                  if (!nextFieldMap[index]) return current;
                                  nextFieldMap[index] = {
                                    ...nextFieldMap[index],
                                    required: checked,
                                  };
                                  return {
                                    ...current,
                                    data: {
                                      ...currentData,
                                      mapping: {
                                        ...currentMapping,
                                        mode: "field_map",
                                        fieldMap: nextFieldMap,
                                      },
                                    },
                                  };
                                })
                              }
                              disabled={!canEdit || !edge}
                            />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="justify-start"
                            onClick={() =>
                              updateEdge((current) => {
                                const currentData = asDataRecord(current.data);
                                const currentMapping = readMapping(currentData) ?? {};
                                const nextFieldMap = [...(currentMapping.fieldMap ?? [])];
                                nextFieldMap.splice(index, 1);
                                return {
                                  ...current,
                                  data: {
                                    ...currentData,
                                    mapping: {
                                      ...currentMapping,
                                      mode: "field_map",
                                      fieldMap: nextFieldMap,
                                    },
                                  },
                                };
                              })
                            }
                            disabled={!canEdit || !edge}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Remove mapping
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
