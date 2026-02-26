import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeMouseHandler,
  type Connection,
  MarkerType,
  ConnectionLineType,
  Panel,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NodeConfigSheet } from "./NodeConfigSheet";
import { getLayoutedElements } from "./layout";
import type {
  AiPromptFlowResponseDtoFlowsItem,
  AiPromptFlowResponseDtoFlowsItemNodesItem,
} from "@/api/generated/model";
import type { PhaseConfig } from "./types";
import { FixedDataNode } from "./nodes/FixedDataNode";
import { AiAgentNode } from "./nodes/AiAgentNode";
import { OrchestratorNode } from "./nodes/OrchestratorNode";
import type { PipelineCanvasNodeData } from "./nodes/types";
import { CanvasToolbar } from "./CanvasToolbar";

const nodeTypes: NodeTypes = {
  fixedData: FixedDataNode,
  aiAgent: AiAgentNode,
  orchestrator: OrchestratorNode,
};

function getNodeType(node: AiPromptFlowResponseDtoFlowsItemNodesItem): "orchestrator" | "fixedData" | "aiAgent" {
  if (node.id.includes("orchestrator")) return "orchestrator";
  if (node.kind === "system") return "fixedData";
  return "aiAgent";
}

function edgeColorFromType(type?: string) {
  if (type === "object") return "#2563eb";
  if (type === "array") return "#16a34a";
  if (type === "number") return "#d97706";
  return "#64748b";
}

function flowToReactFlow(flow: AiPromptFlowResponseDtoFlowsItem) {
  const childCountByOrchestrator = flow.edges.reduce<Record<string, number>>((acc, edge) => {
    if (edge.from.includes("orchestrator")) {
      acc[edge.from] = (acc[edge.from] ?? 0) + 1;
    }
    return acc;
  }, {});

  const nodes: Node<PipelineCanvasNodeData>[] = flow.nodes.map((node) => {
    const stage = flow.stages.find((s) => s.nodeIds.includes(node.id));
    const type = getNodeType(node);
    const enabled = (node as unknown as { enabled?: boolean }).enabled;

    return {
      id: node.id,
      type,
      position: { x: 0, y: 0 },
      data: {
        label: node.label,
        description: node.description,
        kind: node.kind as "prompt" | "system",
        stage: stage?.title,
        promptKeys: node.promptKeys,
        enabled,
        schemaFieldCount: node.outputs.length,
        childCount: childCountByOrchestrator[node.id] ?? 0,
      },
    };
  });

  const edges: Edge[] = flow.edges.map((edge, i) => {
    const sourceNode = flow.nodes.find((node) => node.id === edge.from);
    const sourceType = sourceNode?.outputs?.[0]?.type;
    const edgeColor = edgeColorFromType(sourceType);

    return {
      id: `e-${edge.from}-${edge.to}-${i}`,
      source: edge.from,
      target: edge.to,
      label: edge.label ?? sourceType,
      animated: true,
      style: { strokeWidth: 1.75, stroke: edgeColor },
      labelStyle: { fill: edgeColor, fontSize: 10 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: edgeColor },
    };
  });

  return getLayoutedElements(nodes, edges, "LR");
}

interface PipelineCanvasProps {
  flow: AiPromptFlowResponseDtoFlowsItem;
  pipelineConfig?: PhaseConfig[];
  onPipelineConfigChange?: (configs: PhaseConfig[]) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  isDirty?: boolean;
  onSaveDraft?: () => void;
  onPublish?: () => void;
  saveDisabled?: boolean;
  publishDisabled?: boolean;
}

function CanvasInner(props: PipelineCanvasProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => flowToReactFlow(props.flow),
    [props.flow],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
            animated: true,
            interactionWidth: 30,
            style: { strokeWidth: 3, stroke: "#0f172a" },
            labelStyle: { fill: "#0f172a", fontSize: 10, fontWeight: 600 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#0f172a" },
          },
          currentEdges,
        ),
      ),
    [setEdges],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      const sourceNode = props.flow.nodes.find((node) => node.id === newConnection.source);
      const sourceType = sourceNode?.outputs?.[0]?.type;
      const edgeColor = edgeColorFromType(sourceType);

      setEdges((currentEdges) =>
        currentEdges.map((edge) =>
          edge.id === oldEdge.id
            ? {
                ...edge,
                source: newConnection.source ?? edge.source,
                target: newConnection.target ?? edge.target,
                sourceHandle: newConnection.sourceHandle ?? edge.sourceHandle,
                targetHandle: newConnection.targetHandle ?? edge.targetHandle,
                style: { ...edge.style, stroke: edgeColor, strokeWidth: 3 },
                labelStyle: { ...edge.labelStyle, fill: edgeColor, fontSize: 10, fontWeight: 600 },
                markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: edgeColor },
              }
            : edge,
        ),
      );
    },
    [props.flow.nodes, setEdges],
  );

  const renderedEdges = useMemo(
    () =>
      edges.map((edge) => {
        const isActive = edge.selected || edge.id === hoveredEdgeId;
        const activeColor = "#0f172a";
        const baseColor = (edge.style?.stroke as string | undefined) ?? "#64748b";

        return {
          ...edge,
          interactionWidth: 30,
          style: {
            ...edge.style,
            stroke: isActive ? activeColor : baseColor,
            strokeWidth: isActive ? 4.5 : 3,
            opacity: isActive ? 1 : 0.95,
          },
          labelStyle: {
            ...edge.labelStyle,
            fill: isActive ? activeColor : ((edge.labelStyle?.fill as string | undefined) ?? baseColor),
            fontSize: isActive ? 11 : 10,
            fontWeight: isActive ? 700 : 600,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: isActive ? 18 : 16,
            height: isActive ? 18 : 16,
            color: isActive ? activeColor : baseColor,
          },
        };
      }),
    [edges, hoveredEdgeId],
  );

  const [selectedNode, setSelectedNode] =
    useState<AiPromptFlowResponseDtoFlowsItemNodesItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const flowNode = props.flow.nodes.find((n) => n.id === node.id);
      if (flowNode) {
        setSelectedNode(flowNode);
        setSheetOpen(true);
      }
    },
    [props.flow.nodes],
  );

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey;
      const isRedo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && event.shiftKey;
      if (isUndo && props.onUndo) {
        event.preventDefault();
        props.onUndo();
      }
      if (isRedo && props.onRedo) {
        event.preventDefault();
        props.onRedo();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [props.onUndo, props.onRedo]);

  const selectedPhaseConfig = useMemo(() => {
    if (!selectedNode || !props.pipelineConfig) return undefined;
    return props.pipelineConfig.find((p) =>
      selectedNode.id.startsWith(p.phase) || selectedNode.id.includes(p.phase),
    );
  }, [selectedNode, props.pipelineConfig]);

  const handlePhaseConfigChange = useCallback(
    (partial: Partial<PhaseConfig>) => {
      if (!selectedPhaseConfig || !props.pipelineConfig || !props.onPipelineConfigChange) return;
      const updated = props.pipelineConfig.map((phase) =>
        phase.phase === selectedPhaseConfig.phase ? { ...phase, ...partial } : phase,
      );
      props.onPipelineConfigChange(updated);
    },
    [selectedPhaseConfig, props.pipelineConfig, props.onPipelineConfigChange],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={renderedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onReconnect={onReconnect}
        onNodeClick={onNodeClick}
        onEdgeMouseEnter={(_event, edge) => setHoveredEdgeId(edge.id)}
        onEdgeMouseLeave={() => setHoveredEdgeId(null)}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgesReconnectable
        elevateEdgesOnSelect
        reconnectRadius={18}
        connectionLineStyle={{ stroke: "#0f172a", strokeWidth: 3.5, opacity: 0.9 }}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onInit={setReactFlow}
      >
        <Background gap={16} size={1} />
        <Panel position="top-left" className="w-[min(100%,980px)]">
          <CanvasToolbar
            canUndo={Boolean(props.canUndo)}
            canRedo={Boolean(props.canRedo)}
            onUndo={props.onUndo ?? (() => undefined)}
            onRedo={props.onRedo ?? (() => undefined)}
            onZoomIn={() => reactFlow?.zoomIn()}
            onZoomOut={() => reactFlow?.zoomOut()}
            onFitView={() => reactFlow?.fitView({ padding: 0.2 })}
            nodeCount={props.flow.nodes.length}
            edgeCount={props.flow.edges.length}
            isDirty={Boolean(props.isDirty)}
            onSaveDraft={props.onSaveDraft ?? (() => undefined)}
            onPublish={props.onPublish ?? (() => undefined)}
            saveDisabled={props.saveDisabled}
            publishDisabled={props.publishDisabled}
          />
        </Panel>
      </ReactFlow>

      <NodeConfigSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        node={selectedNode}
        phaseConfig={selectedPhaseConfig}
        onPhaseConfigChange={handlePhaseConfigChange}
      />
    </div>
  );
}

export function PipelineCanvas(props: PipelineCanvasProps) {
  return <CanvasInner {...props} />;
}
