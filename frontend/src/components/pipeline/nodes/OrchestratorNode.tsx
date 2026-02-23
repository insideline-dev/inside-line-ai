import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PipelineCanvasNodeData } from "./types";

type OrchestratorNodeType = Node<PipelineCanvasNodeData, "orchestrator">;

function OrchestratorNodeComponent({ data, selected }: NodeProps<OrchestratorNodeType>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-violet-500 bg-violet-50 px-4 py-3 shadow-sm min-w-[260px] max-w-[300px] cursor-pointer transition-all",
        selected && "ring-2 ring-violet-500 border-violet-600 shadow-lg shadow-violet-500/20",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3.5 !h-3.5 !bg-violet-500 !border-2 !border-background"
      />
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <Workflow className="h-3.5 w-3.5 text-violet-700 shrink-0" />
          <span className="text-xs font-medium truncate">{data.label}</span>
        </div>
        <Badge variant="outline" className="text-[9px] h-4 px-1">
          {data.childCount ?? 0} agents
        </Badge>
      </div>
      <p className="text-[10px] text-violet-900/70 line-clamp-2 leading-tight">
        {data.description}
      </p>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3.5 !h-3.5 !bg-violet-500 !border-2 !border-background"
      />
    </div>
  );
}

export const OrchestratorNode = memo(OrchestratorNodeComponent);
