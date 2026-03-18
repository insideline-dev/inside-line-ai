import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OutputSchemaTree,
  resolveOutputSchemaPayload,
} from "../src/components/pipeline/prompt-editor/OutputSchemaViewer";

describe("OutputSchemaTree", () => {
  it("accepts parsed-body hook data instead of requiring an extra data wrapper", () => {
    const payload = resolveOutputSchemaPayload({
      key: "evaluation.market",
      stage: null,
      source: "code",
      schemaJson: {
        type: "object",
        fields: {
          summary: { type: "string" },
        },
      },
      jsonSchema: { type: "object" },
      note: "Schema configured in code.",
    });

    expect(payload?.schemaJson.fields.summary.type).toBe("string");
  });

  it("renders nested object and array fields as a readable tree", () => {
    const html = renderToStaticMarkup(
      <OutputSchemaTree
        schema={{
          type: "object",
          fields: {
            summary: { type: "string" },
            strengths: {
              type: "array",
              items: { type: "string" },
            },
            marketSizing: {
              type: "object",
              fields: {
                tam: { type: "number" },
                regions: {
                  type: "array",
                  items: {
                    type: "object",
                    fields: {
                      name: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        }}
      />,
    );

    expect(html).toContain("summary");
    expect(html).toContain("string");
    expect(html).toContain("strengths");
    expect(html).toContain("array&lt;string&gt;");
    expect(html).toContain("marketSizing");
    expect(html).toContain("object");
    expect(html).toContain("tam");
    expect(html).toContain("number");
    expect(html).toContain("regions");
    expect(html).toContain("array&lt;object&gt;");
    expect(html).toContain("name");
  });
});
