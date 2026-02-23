import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PipelineCanvasNodeData } from "./types";

type AiAgentNodeType = Node<PipelineCanvasNodeData, "aiAgent">;

function AiAgentNodeComponent({ data, selected }: NodeProps<AiAgentNodeType>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-primary/50 bg-primary/5 px-4 py-3 shadow-sm min-w-[260px] max-w-[300px] cursor-pointer transition-all",
        data.enabled === false && "opacity-50 border-dashed",
        selected && "ring-2 ring-primary border-primary shadow-lg shadow-primary/25",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3.5 !h-3.5 !bg-primary !border-2 !border-background"
      />
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-medium truncate">{data.label}</span>
        </div>
        <Badge variant="default" className="text-[9px] h-4 px-1">Editable</Badge>
      </div>
      <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">
        {data.description}
      </p>
      <div className="flex flex-wrap gap-1 mt-2">
        {data.modelName ? (
          <Badge variant="secondary" className="text-[9px] h-4 px-1">
            {data.modelName}
          </Badge>
        ) : null}
        <Badge variant="outline" className="text-[9px] h-4 px-1">
          {data.schemaFieldCount ?? 0} fields
        </Badge>
        {data.enabled === false ? (
          <Badge variant="outline" className="text-[9px] h-4 px-1">Disabled</Badge>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3.5 !h-3.5 !bg-primary !border-2 !border-background"
      />
    </div>
  );
}

export const AiAgentNode = memo(AiAgentNodeComponent);
