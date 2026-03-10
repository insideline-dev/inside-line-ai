import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TraceInputPanel } from "../src/components/startup-view/AdminPipelineLivePanel";
import type { PipelineAgentTrace } from "../src/types/pipeline-progress";

const trace = {
  id: "trace_1",
  pipelineRunId: "run_1",
  phase: "evaluation",
  agentKey: "exitPotential",
  status: "completed",
  inputPrompt: "Build a structured exit analysis for Parasail.",
  systemPrompt: "You are the exit potential evaluation agent.",
} satisfies PipelineAgentTrace;

describe("TraceInputPanel", () => {
  it("renders user and system prompt tabs for an agent trace", () => {
    const html = renderToStaticMarkup(<TraceInputPanel trace={trace} />);
    const systemHtml = renderToStaticMarkup(
      <TraceInputPanel trace={trace} defaultTab="system" />,
    );

    expect(html).toContain("User Prompt");
    expect(html).toContain("System Prompt");
    expect(html).toContain("Build a structured exit analysis for Parasail.");
    expect(html).toContain('data-state="active"');
    expect(systemHtml).toContain("You are the exit potential evaluation agent.");
  });

  it("renders a clear empty state when the system prompt was not captured", () => {
    const html = renderToStaticMarkup(
      <TraceInputPanel
        trace={{ ...trace, systemPrompt: null }}
        defaultTab="system"
      />,
    );

    expect(html).toContain("System prompt not captured");
  });
});
