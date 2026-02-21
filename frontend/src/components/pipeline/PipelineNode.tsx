import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Bot, Cog } from "lucide-react";

export type PipelineNodeData = {
  label: string;
  description: string;
  kind: "prompt" | "system";
  stage?: string;
  promptKeys?: string[];
};

type PipelineNodeType = Node<PipelineNodeData, "pipeline">;

function PipelineNodeComponent({ data, selected }: NodeProps<PipelineNodeType>) {
  const isSystem = data.kind === "system";
  const Icon = isSystem ? Cog : Bot;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card px-3 py-2 shadow-sm min-w-[200px] max-w-[220px] cursor-pointer transition-all",
        isSystem ? "border-dashed border-muted-foreground/40" : "border-border",
        selected && "ring-2 ring-primary border-primary",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-2 !h-2" />
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium truncate">{data.label}</span>
      </div>
      <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">
        {data.description}
      </p>
      {data.stage && (
        <Badge variant="outline" className="mt-1 text-[9px] h-4 px-1">
          {data.stage}
        </Badge>
      )}
      {data.promptKeys && data.promptKeys.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {data.promptKeys.map((k) => (
            <Badge key={k} variant="secondary" className="text-[9px] h-4 px-1">
              {k.split(".").pop()}
            </Badge>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !w-2 !h-2" />
    </div>
  );
}

export const PipelineNode = memo(PipelineNodeComponent);
