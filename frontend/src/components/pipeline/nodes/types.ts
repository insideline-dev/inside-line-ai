export type PipelineCanvasNodeData = {
  label: string;
  description: string;
  kind: "prompt" | "system";
  stage?: string;
  promptKeys?: string[];
  enabled?: boolean;
  modelName?: string;
  schemaFieldCount?: number;
  childCount?: number;
};
