import { describe, expect, it } from "bun:test";
import { z } from "zod";
import type { SchemaDescriptor } from "../../interfaces/schema.interface";
import { SchemaCompilerService } from "../../services/schema-compiler.service";

describe("SchemaCompilerService", () => {
  const service = new SchemaCompilerService();

  it("compiles flat primitive fields", () => {
    const schema = service.compile({
      type: "object",
      fields: {
        name: { type: "string" },
        score: { type: "number" },
        active: { type: "boolean" },
      },
    });

    const parsed = schema.parse({ name: "Acme", score: 90, active: true });
    expect(parsed).toEqual({ name: "Acme", score: 90, active: true });
  });

  it("compiles nested objects", () => {
    const schema = service.compile({
      type: "object",
      fields: {
        company: {
          type: "object",
          fields: {
            name: { type: "string" },
            founded: { type: "number" },
          },
        },
      },
    });

    const parsed = schema.parse({
      company: { name: "Acme", founded: 2020 },
    });

    expect(parsed.company).toEqual({ name: "Acme", founded: 2020 });
  });

  it("compiles arrays of strings", () => {
    const schema = service.compile({
      type: "object",
      fields: {
        strengths: {
          type: "array",
          items: { type: "string" },
        },
      },
    });

    const parsed = schema.parse({ strengths: ["speed", "focus"] });
    expect(parsed.strengths).toEqual(["speed", "focus"]);
  });

  it("compiles arrays of objects", () => {
    const schema = service.compile({
      type: "object",
      fields: {
        founders: {
          type: "array",
          items: {
            type: "object",
            fields: {
              name: { type: "string" },
              score: { type: "number" },
            },
          },
        },
      },
    });

    const parsed = schema.parse({
      founders: [
        { name: "Sam", score: 88 },
        { name: "Lee", score: 92 },
      ],
    });

    expect(parsed.founders).toHaveLength(2);
    expect(parsed.founders[0]).toEqual({ name: "Sam", score: 88 });
  });

  it("compiles enum fields", () => {
    const schema = service.compile({
      type: "object",
      fields: {
        recommendation: {
          type: "enum",
          values: ["pass", "consider", "decline"],
        },
      },
    });

    expect(schema.parse({ recommendation: "pass" }).recommendation).toBe("pass");
    expect(() => schema.parse({ recommendation: "invalid" })).toThrow();
  });

  it("respects min and max constraints", () => {
    const schema = service.compile({
      type: "object",
      fields: {
        confidence: { type: "number", min: 0, max: 1 },
      },
    });

    expect(schema.parse({ confidence: 0.6 }).confidence).toBe(0.6);
    expect(() => schema.parse({ confidence: 2 })).toThrow();
  });

  it("handles optional fields", () => {
    const schema = service.compile({
      type: "object",
      fields: {
        notes: { type: "string", optional: true },
      },
    });

    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ notes: "hello" }).notes).toBe("hello");
  });

  it("roundtrips zod schema serialize -> compile", () => {
    const zodSchema = z.object({
      score: z.number().min(0).max(100),
      recommendation: z.enum(["pass", "consider", "decline"]),
      founders: z.array(
        z.object({
          name: z.string(),
          role: z.string().optional(),
        }),
      ),
    });

    const descriptor = service.serialize(zodSchema);
    const compiled = service.compile(descriptor);

    const sample = {
      score: 82,
      recommendation: "consider",
      founders: [{ name: "Ari", role: "CEO" }, { name: "Rin" }],
    };

    expect(zodSchema.parse(sample)).toEqual(compiled.parse(sample));
  });

  it("extracts nested field paths with array markers", () => {
    const descriptor: SchemaDescriptor = {
      type: "object",
      fields: {
        score: { type: "number" },
        strengths: { type: "array", items: { type: "string" } },
        founders: {
          type: "array",
          items: {
            type: "object",
            fields: {
              name: { type: "string" },
              metrics: {
                type: "object",
                fields: {
                  confidence: { type: "number" },
                },
              },
            },
          },
        },
      },
    };

    const paths = service.extractFieldPaths(descriptor);
    expect(paths).toEqual([
      "score",
      "strengths[]",
      "founders[].name",
      "founders[].metrics.confidence",
    ]);
  });

  it("rejects malformed descriptors", () => {
    const invalid = {
      type: "object",
      fields: {
        badEnum: { type: "enum", values: [] },
        badArray: { type: "array" },
        badNumber: { type: "number", min: 10, max: 1 },
      },
    };

    const result = service.validate(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
