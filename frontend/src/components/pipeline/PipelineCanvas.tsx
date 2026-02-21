import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeMouseHandler,
  type Connection,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PipelineNode, type PipelineNodeData } from "./PipelineNode";
import { NodeConfigSheet } from "./NodeConfigSheet";
import { getLayoutedElements } from "./layout";
import type {
  AiPromptFlowResponseDtoFlowsItem,
  AiPromptFlowResponseDtoFlowsItemNodesItem,
} from "@/api/generated/model";
import type { PhaseConfig } from "./types";

const nodeTypes: NodeTypes = {
  pipeline: PipelineNode,
};

function flowToReactFlow(flow: AiPromptFlowResponseDtoFlowsItem) {
  const nodes: Node<PipelineNodeData>[] = flow.nodes.map((node) => {
    const stage = flow.stages.find((s) => s.nodeIds.includes(node.id));
    return {
      id: node.id,
      type: "pipeline" as const,
      position: { x: 0, y: 0 },
      data: {
        label: node.label,
        description: node.description,
        kind: node.kind as "prompt" | "system",
        stage: stage?.title,
        promptKeys: node.promptKeys,
      },
    };
  });

  const edges: Edge[] = flow.edges.map((edge, i) => ({
    id: `e-${edge.from}-${edge.to}-${i}`,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    animated: false,
    style: { strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
  }));

  return getLayoutedElements(nodes, edges, "LR");
}

interface PipelineCanvasProps {
  flow: AiPromptFlowResponseDtoFlowsItem;
  pipelineConfig?: PhaseConfig[];
  onPipelineConfigChange?: (configs: PhaseConfig[]) => void;
}

export function PipelineCanvas({
  flow,
  pipelineConfig,
  onPipelineConfigChange,
}: PipelineCanvasProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => flowToReactFlow(flow),
    [flow],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(
          { ...connection, animated: false, style: { strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } },
          eds,
        ),
      ),
    [setEdges],
  );
  const [selectedNode, setSelectedNode] =
    useState<AiPromptFlowResponseDtoFlowsItemNodesItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const flowNode = flow.nodes.find((n) => n.id === node.id);
      if (flowNode) {
        setSelectedNode(flowNode);
        setSheetOpen(true);
      }
    },
    [flow.nodes],
  );

  const selectedPhaseConfig = useMemo(() => {
    if (!selectedNode || !pipelineConfig) return undefined;
    return pipelineConfig.find((p) =>
      // Match by checking if the node belongs to the phase's stage
      selectedNode.id.startsWith(p.phase) ||
      selectedNode.id.includes(p.phase),
    );
  }, [selectedNode, pipelineConfig]);

  const handlePhaseConfigChange = useCallback(
    (partial: Partial<PhaseConfig>) => {
      if (!selectedPhaseConfig || !pipelineConfig || !onPipelineConfigChange) return;
      const updated = pipelineConfig.map((p) =>
        p.phase === selectedPhaseConfig.phase ? { ...p, ...partial } : p,
      );
      onPipelineConfigChange(updated);
    },
    [selectedPhaseConfig, pipelineConfig, onPipelineConfigChange],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          className="!bg-background/80"
        />
        <Panel position="top-left" className="text-xs text-muted-foreground">
          {flow.name} — {flow.nodes.length} nodes, {flow.edges.length} edges
        </Panel>
      </ReactFlow>

      <NodeConfigSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        node={selectedNode}
        allNodes={flow.nodes}
        edges={edges}
        phaseConfig={selectedPhaseConfig}
        onPhaseConfigChange={handlePhaseConfigChange}
      />
    </div>
  );
}
