import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Cog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PipelineCanvasNodeData } from "./types";

type FixedDataNodeType = Node<PipelineCanvasNodeData, "fixedData">;

function FixedDataNodeComponent({ data, selected }: NodeProps<FixedDataNodeType>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-muted-foreground/40 bg-muted/30 px-4 py-3 shadow-sm min-w-[250px] max-w-[290px] cursor-pointer transition-all",
        selected && "ring-2 ring-primary border-primary shadow-lg shadow-primary/20",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3.5 !h-3.5 !bg-slate-500 !border-2 !border-background"
      />
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <Cog className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium truncate">{data.label}</span>
        </div>
        <Badge variant="outline" className="text-[9px] h-4 px-1">Read-only</Badge>
      </div>
      <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">
        {data.description}
      </p>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3.5 !h-3.5 !bg-slate-500 !border-2 !border-background"
      />
    </div>
  );
}

export const FixedDataNode = memo(FixedDataNodeComponent);
