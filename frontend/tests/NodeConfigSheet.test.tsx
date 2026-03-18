import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { AiPromptFlowResponseDtoFlowsItemNodesItem } from "../src/api/generated/model";
import { NodeInputOutputPanel } from "../src/components/pipeline/NodeConfigSheet";

const promptNode = {
  id: "evaluation_market",
  label: "Market Evaluation",
  description: "Evaluates the market.",
  kind: "prompt",
  promptKeys: ["evaluation.market"],
  inputs: [],
  outputs: [{ label: "market", type: "object" }],
} satisfies AiPromptFlowResponseDtoFlowsItemNodesItem;

describe("NodeConfigSheet", () => {
  it("renders the output structure panel in the input/output tab for prompt nodes", () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <NodeInputOutputPanel
          node={promptNode}
          selectedPromptKey="evaluation.market"
        />
      </QueryClientProvider>,
    );

    expect(html).toContain("Output Structure");
  });
});
