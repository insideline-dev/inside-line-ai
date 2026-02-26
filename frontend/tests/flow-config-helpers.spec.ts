import { describe, expect, it } from "bun:test";
import {
  parseFlowConfigRecord,
  selectInitialFlowConfigCandidate,
  type FlowConfigRecord,
} from "../src/routes/_protected/admin/-flow-config-helpers";

function makeConfig(
  overrides: Partial<FlowConfigRecord> & Pick<FlowConfigRecord, "id" | "status">,
): FlowConfigRecord {
  return {
    id: overrides.id,
    name: overrides.name ?? `Config ${overrides.id}`,
    status: overrides.status,
    version: overrides.version ?? 1,
    updatedAt: overrides.updatedAt ?? "2026-02-26T00:00:00.000Z",
    flowDefinition: overrides.flowDefinition ?? {
      flowId: "pipeline",
      edges: [],
      nodeConfigs: {},
    },
    pipelineConfig: overrides.pipelineConfig,
  };
}

describe("flow config hydration helpers", () => {
  it("prefers active published config over list candidates", () => {
    const active = makeConfig({
      id: "active",
      status: "published",
      flowDefinition: { flowId: "pipeline", edges: [], nodeConfigs: {} },
    });
    const list = [
      makeConfig({ id: "draft", status: "draft" }),
      makeConfig({ id: "published", status: "published" }),
    ];

    const selected = selectInitialFlowConfigCandidate({
      flowId: "pipeline",
      activeConfig: active,
      configList: list,
    });

    expect(selected?.id).toBe("active");
  });

  it("falls back to list published when active is unavailable", () => {
    const list = [
      makeConfig({ id: "archived", status: "archived" }),
      makeConfig({ id: "published", status: "published" }),
      makeConfig({ id: "draft", status: "draft" }),
    ];

    const selected = selectInitialFlowConfigCandidate({
      flowId: "pipeline",
      activeConfig: null,
      configList: list,
    });

    expect(selected?.id).toBe("published");
  });

  it("falls back to list draft when no published exists", () => {
    const list = [
      makeConfig({ id: "archived", status: "archived" }),
      makeConfig({ id: "draft", status: "draft" }),
    ];

    const selected = selectInitialFlowConfigCandidate({
      flowId: "pipeline",
      activeConfig: null,
      configList: list,
    });

    expect(selected?.id).toBe("draft");
  });

  it("returns null when only archived configs exist", () => {
    const list = [makeConfig({ id: "archived", status: "archived" })];

    const selected = selectInitialFlowConfigCandidate({
      flowId: "pipeline",
      activeConfig: null,
      configList: list,
    });

    expect(selected).toBeNull();
  });

  it("parses active config payloads wrapped in data", () => {
    const wrapped = {
      data: makeConfig({ id: "published", status: "published" }),
    };

    const parsed = parseFlowConfigRecord(wrapped);

    expect(parsed?.id).toBe("published");
    expect(parsed?.status).toBe("published");
  });
});
